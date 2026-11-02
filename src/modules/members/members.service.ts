import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaginatedResponseDto } from '../../common/dto/pagination.dto.js';
import { BorrowingStatus } from '../../common/enums/borrowing-status.enum.js';
import { MemberStatus } from '../../common/enums/member-status.enum.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateMemberDto } from './dto/create-member.dto.js';
import { FilterMemberDto } from './dto/filter-member.dto.js';
import { UpdateMemberDto } from './dto/update-member.dto.js';
import { Member } from './entities/member.entity.js';

@Injectable()
export class MembersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters: FilterMemberDto): Promise<PaginatedResponseDto<Member>> {
    const page = filters.page || 1;
    const limit = filters.limit || 10;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.cardNumber) {
      where.cardNumber = { contains: filters.cardNumber.trim(), mode: 'insensitive' };
    }

    if (filters.search) {
      const term = filters.search.trim();
      where.OR = [
        { fullName: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
        { phone: { contains: term, mode: 'insensitive' } },
        { cardNumber: { contains: term, mode: 'insensitive' } },
        { address: { contains: term, mode: 'insensitive' } },
      ];
    }

    const [totalItems, members] = await Promise.all([
      this.prisma.member.count({ where }),
      this.prisma.member.findMany({
        where,
        skip,
        take: limit,
        include: {
          borrowings: {
            where: {
              status: { in: [BorrowingStatus.BORROWED, BorrowingStatus.OVERDUE] },
            },
          },
        },
        orderBy: filters.sortBy
          ? { [filters.sortBy]: (filters.sortOrder ?? 'DESC').toLowerCase() }
          : { createdAt: 'desc' },
      }),
    ]);

    const data: Member[] = members.map((m) => ({
      id: m.id,
      cardNumber: m.cardNumber,
      fullName: m.fullName,
      email: m.email,
      phone: m.phone,
      address: m.address,
      membershipExpiry: m.membershipExpiry,
      status: m.status as MemberStatus,
      maxBorrowLimit: m.maxBorrowLimit,
      currentBorrowedCount: m.borrowings.length,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
    }));

    const totalPages = Math.ceil(totalItems / limit) || 1;

    return {
      data,
      meta: {
        page,
        limit,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  async findOne(id: string): Promise<Member> {
    const member = await this.prisma.member.findUnique({
      where: { id },
      include: {
        borrowings: {
          where: {
            status: { in: [BorrowingStatus.BORROWED, BorrowingStatus.OVERDUE] },
          },
        },
      },
    });

    if (!member) {
      throw new NotFoundException(`Không tìm thấy độc giả với ID "${id}"`);
    }

    return {
      id: member.id,
      cardNumber: member.cardNumber,
      fullName: member.fullName,
      email: member.email,
      phone: member.phone,
      address: member.address,
      membershipExpiry: member.membershipExpiry,
      status: member.status as MemberStatus,
      maxBorrowLimit: member.maxBorrowLimit,
      currentBorrowedCount: member.borrowings.length,
      createdAt: member.createdAt,
      updatedAt: member.updatedAt,
    };
  }

  async getDebtSummary(id: string): Promise<{
    memberId: string;
    cardNumber: string;
    fullName: string;
    status: MemberStatus;
    membershipExpiry: Date;
    maxBorrowLimit: number;
    currentBorrowedCount: number;
    remainingBorrowLimit: number;
    totalUnpaidFine: number;
    hasOverdue: boolean;
    canBorrow: boolean;
    reasonIfNotAllowed?: string;
  }> {
    const now = new Date();
    const member = await this.prisma.member.findUnique({
      where: { id },
      include: {
        borrowings: true,
        borrowingSlips: {
          include: { items: true },
        },
      },
    });

    if (!member) {
      throw new NotFoundException(`Không tìm thấy độc giả với ID "${id}"`);
    }

    // 1. Tính tổng sách đang mượn từ cả hai nguồn (phiếu đơn cũ và phiếu master mới)
    const activeOldBorrowings = member.borrowings.filter((b) =>
      [BorrowingStatus.BORROWED, BorrowingStatus.OVERDUE].includes(b.status as any),
    );
    const activeSlipItemsCount = member.borrowingSlips
      .filter((s) => ['BORROWED', 'PARTIAL_RETURNED'].includes(s.status as any))
      .reduce((sum, s) => {
        const remainingInSlip = s.items
          .filter((item) => ['PENDING', 'BORROWING'].includes(item.status as any))
          .reduce((itemSum, item) => itemSum + (item.quantity - item.returnedQuantity - item.lostQuantity), 0);
        return sum + remainingInSlip;
      }, 0);

    const currentBorrowedCount = activeOldBorrowings.length + activeSlipItemsCount;
    const remainingBorrowLimit = Math.max(0, member.maxBorrowLimit - currentBorrowedCount);

    // 2. Tính tiền phạt chưa thanh toán
    const oldUnpaidFine = member.borrowings
      .filter((b) => !b.finePaid && b.fineAmount > 0)
      .reduce((sum, b) => sum + b.fineAmount, 0);

    const slipUnpaidFine = member.borrowingSlips
      .filter((s) => !s.finePaid && s.totalFine > 0)
      .reduce((sum, s) => sum + s.totalFine, 0);

    const totalUnpaidFine = oldUnpaidFine + slipUnpaidFine;

    // 3. Kiểm tra quá hạn
    const hasOldOverdue = activeOldBorrowings.some(
      (b) => b.status === BorrowingStatus.OVERDUE || new Date(b.dueDate) < now,
    );
    const hasSlipOverdue = member.borrowingSlips.some(
      (s) => ['BORROWED', 'PARTIAL_RETURNED'].includes(s.status as any) && new Date(s.dueDate) < now,
    );
    const hasOverdue = hasOldOverdue || hasSlipOverdue;

    // 4. Quyết định khả năng mượn sách tiếp
    let canBorrow = true;
    let reasonIfNotAllowed: string | undefined;

    if (member.status !== MemberStatus.ACTIVE) {
      canBorrow = false;
      reasonIfNotAllowed = `Thẻ độc giả đang ở trạng thái "${member.status}"`;
    } else if (new Date(member.membershipExpiry) < now) {
      canBorrow = false;
      reasonIfNotAllowed = 'Thẻ thư viện của độc giả đã hết hạn sử dụng';
    } else if (hasOverdue) {
      canBorrow = false;
      reasonIfNotAllowed = 'Độc giả có sách mượn đã quá hạn chưa hoàn trả';
    } else if (totalUnpaidFine > 0) {
      canBorrow = false;
      reasonIfNotAllowed = `Độc giả còn nợ tiền phạt chưa thanh toán (${totalUnpaidFine.toLocaleString('vi-VN')} VNĐ)`;
    } else if (remainingBorrowLimit <= 0) {
      canBorrow = false;
      reasonIfNotAllowed = `Độc giả đã sử dụng hết hạn mức mượn (${member.maxBorrowLimit} cuốn)`;
    }

    return {
      memberId: member.id,
      cardNumber: member.cardNumber,
      fullName: member.fullName,
      status: member.status as MemberStatus,
      membershipExpiry: member.membershipExpiry,
      maxBorrowLimit: member.maxBorrowLimit,
      currentBorrowedCount,
      remainingBorrowLimit,
      totalUnpaidFine,
      hasOverdue,
      canBorrow,
      reasonIfNotAllowed,
    };
  }

  async findByCardNumber(cardNumber: string): Promise<Member> {
    const member = await this.prisma.member.findUnique({
      where: { cardNumber: cardNumber.trim() },
      include: {
        borrowings: {
          where: {
            status: { in: [BorrowingStatus.BORROWED, BorrowingStatus.OVERDUE] },
          },
        },
      },
    });

    if (!member) {
      throw new NotFoundException(`Không tìm thấy độc giả có số thẻ "${cardNumber}"`);
    }

    return {
      id: member.id,
      cardNumber: member.cardNumber,
      fullName: member.fullName,
      email: member.email,
      phone: member.phone,
      address: member.address,
      membershipExpiry: member.membershipExpiry,
      status: member.status as MemberStatus,
      maxBorrowLimit: member.maxBorrowLimit,
      currentBorrowedCount: member.borrowings.length,
      createdAt: member.createdAt,
      updatedAt: member.updatedAt,
    };
  }

  async create(dto: CreateMemberDto): Promise<Member> {
    const cleanEmail = dto.email.trim().toLowerCase();
    const cleanPhone = dto.phone.trim();

    const existingEmail = await this.prisma.member.findUnique({
      where: { email: cleanEmail },
    });
    if (existingEmail) {
      throw new ConflictException(`Địa chỉ email "${dto.email}" đã được đăng ký cho độc giả khác`);
    }

    const existingPhone = await this.prisma.member.findUnique({
      where: { phone: cleanPhone },
    });
    if (existingPhone) {
      throw new ConflictException(`Số điện thoại "${dto.phone}" đã được sử dụng`);
    }

    const now = new Date();
    const durationMonths = dto.membershipDurationMonths ?? 12;
    const expiryDate = new Date(now);
    expiryDate.setMonth(expiryDate.getMonth() + durationMonths);

    const memberCount = (await this.prisma.member.count()) + 1;
    const cardNumber = `LIB-${now.getFullYear()}-${memberCount.toString().padStart(4, '0')}`;

    const created = await this.prisma.member.create({
      data: {
        cardNumber,
        fullName: dto.fullName.trim(),
        email: cleanEmail,
        phone: cleanPhone,
        address: dto.address.trim(),
        membershipExpiry: expiryDate,
        status: MemberStatus.ACTIVE,
        maxBorrowLimit: dto.maxBorrowLimit ?? 5,
        currentBorrowedCount: 0,
      },
    });

    return {
      id: created.id,
      cardNumber: created.cardNumber,
      fullName: created.fullName,
      email: created.email,
      phone: created.phone,
      address: created.address,
      membershipExpiry: created.membershipExpiry,
      status: created.status as MemberStatus,
      maxBorrowLimit: created.maxBorrowLimit,
      currentBorrowedCount: 0,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    };
  }

  async update(id: string, dto: UpdateMemberDto): Promise<Member> {
    const member = await this.findOne(id);

    if (dto.email && dto.email.trim().toLowerCase() !== member.email.toLowerCase()) {
      const duplicate = await this.prisma.member.findUnique({
        where: { email: dto.email.trim().toLowerCase() },
      });
      if (duplicate && duplicate.id !== id) {
        throw new ConflictException(`Địa chỉ email "${dto.email}" đã tồn tại`);
      }
    }

    let expiry: Date | undefined;
    if (dto.membershipExpiry) {
      const parsedDate = new Date(dto.membershipExpiry);
      if (isNaN(parsedDate.getTime())) {
        throw new BadRequestException('Ngày hết hạn thẻ không hợp lệ');
      }
      expiry = parsedDate;
    }

    const updated = await this.prisma.member.update({
      where: { id },
      data: {
        ...(dto.fullName ? { fullName: dto.fullName.trim() } : {}),
        ...(dto.email ? { email: dto.email.trim().toLowerCase() } : {}),
        ...(dto.phone ? { phone: dto.phone.trim() } : {}),
        ...(dto.address ? { address: dto.address.trim() } : {}),
        ...(dto.status ? { status: dto.status as any } : {}),
        ...(expiry ? { membershipExpiry: expiry } : {}),
        ...(dto.maxBorrowLimit !== undefined ? { maxBorrowLimit: dto.maxBorrowLimit } : {}),
      },
      include: {
        borrowings: {
          where: {
            status: { in: [BorrowingStatus.BORROWED, BorrowingStatus.OVERDUE] },
          },
        },
      },
    });

    return {
      id: updated.id,
      cardNumber: updated.cardNumber,
      fullName: updated.fullName,
      email: updated.email,
      phone: updated.phone,
      address: updated.address,
      membershipExpiry: updated.membershipExpiry,
      status: updated.status as MemberStatus,
      maxBorrowLimit: updated.maxBorrowLimit,
      currentBorrowedCount: updated.borrowings.length,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  async remove(id: string): Promise<{ message: string; deletedId: string }> {
    const member = await this.findOne(id);

    const activeBorrowings = await this.prisma.borrowing.count({
      where: {
        memberId: id,
        status: { in: [BorrowingStatus.BORROWED, BorrowingStatus.OVERDUE] },
      },
    });

    if (activeBorrowings > 0) {
      throw new ConflictException(
        `Không thể xóa độc giả này vì hiện còn ${activeBorrowings} cuốn sách chưa hoàn trả`,
      );
    }

    await this.prisma.member.delete({ where: { id } });

    return {
      message: `Đã xóa độc giả ${member.fullName} (${member.cardNumber}) khỏi hệ thống Supabase`,
      deletedId: id,
    };
  }
}
