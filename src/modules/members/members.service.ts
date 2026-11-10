import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BorrowingItemStatus as ItemStatus,
  BorrowingSlipStatus as SlipStatus,
  Prisma,
} from '@prisma/client';
import { PaginatedResponseDto } from '../../common/dto/pagination.dto.js';
import { BorrowingStatus } from '../../common/enums/borrowing-status.enum.js';
import { MemberStatus } from '../../common/enums/member-status.enum.js';
import { LoanEligibilityService } from '../loan-policy/loan-eligibility.service.js';
import { LoanPolicyService } from '../loan-policy/loan-policy.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateMemberDto } from './dto/create-member.dto.js';
import { FilterMemberDto } from './dto/filter-member.dto.js';
import { UpdateMemberDto } from './dto/update-member.dto.js';
import { Member } from './entities/member.entity.js';

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: LoanPolicyService,
    private readonly eligibility: LoanEligibilityService,
  ) {}

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
        include: this.activeLoanInclude(),
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
      currentBorrowedCount: this.countActiveBorrowed(m),
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
      include: this.activeLoanInclude(),
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
      currentBorrowedCount: this.countActiveBorrowed(member),
      createdAt: member.createdAt,
      updatedAt: member.updatedAt,
    };
  }

  /**
   * Include dùng chung để đếm số sách độc giả đang giữ.
   * Phải cộng cả hai luồng mượn (phiếu lẻ `borrowings` và phiếu ERP
   * `borrowingSlips`), nếu không `currentBorrowedCount` trả ra cho frontend sẽ
   * thiếu phần sách mượn qua phiếu ERP như bản code cũ.
   */
  private activeLoanInclude() {
    return {
      borrowings: {
        where: {
          status: { in: [BorrowingStatus.BORROWED, BorrowingStatus.OVERDUE] },
        },
      },
      borrowingSlips: {
        where: { status: { in: [SlipStatus.BORROWED, SlipStatus.PARTIAL_RETURNED] } },
        include: {
          items: {
            where: { status: { in: [ItemStatus.PENDING, ItemStatus.BORROWING] } },
          },
        },
      },
    } satisfies Prisma.MemberInclude;
  }

  private countActiveBorrowed(member: {
    borrowings: unknown[];
    borrowingSlips?: {
      items: { quantity: number; returnedQuantity: number; lostQuantity: number }[];
    }[];
  }): number {
    const fromSlips = (member.borrowingSlips ?? []).reduce(
      (total, slip) =>
        total +
        slip.items.reduce(
          (sum, item) =>
            sum + Math.max(0, item.quantity - item.returnedQuantity - item.lostQuantity),
          0,
        ),
      0,
    );

    return member.borrowings.length + fromSlips;
  }

  /**
   * Tóm tắt tình trạng mượn/nợ của độc giả.
   *
   * Phần tính toán đã được chuyển sang `LoanEligibilityService` để endpoint này
   * và các luồng ghi (mượn sách, lập phiếu mượn) dùng chung đúng một bộ luật.
   * Cấu trúc response giữ nguyên để không ảnh hưởng frontend đang gọi
   * `GET /api/members/:id/debt-summary`.
   */
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
    overdueCount: number;
    hasOverdue: boolean;
    canBorrow: boolean;
    blockReason?: string;
    reasonIfNotAllowed?: string;
  }> {
    const state = await this.eligibility.getMemberLoanState(id);

    return {
      memberId: state.memberId,
      cardNumber: state.cardNumber,
      fullName: state.fullName,
      status: state.status,
      membershipExpiry: state.membershipExpiry,
      maxBorrowLimit: state.maxBorrowLimit,
      currentBorrowedCount: state.currentBorrowedCount,
      remainingBorrowLimit: state.remainingBorrowLimit,
      totalUnpaidFine: state.totalUnpaidFine,
      overdueCount: state.overdueCount,
      hasOverdue: state.hasOverdue,
      canBorrow: state.canBorrow,
      blockReason: state.blockReason,
      reasonIfNotAllowed: state.reasonIfNotAllowed,
    };
  }

  async findByCardNumber(cardNumber: string): Promise<Member> {
    const member = await this.prisma.member.findUnique({
      where: { cardNumber: cardNumber.trim() },
      include: this.activeLoanInclude(),
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
      currentBorrowedCount: this.countActiveBorrowed(member),
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
        maxBorrowLimit: dto.maxBorrowLimit ?? this.policy.defaultMaxBorrowLimit,
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
      include: this.activeLoanInclude(),
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
      currentBorrowedCount: this.countActiveBorrowed(updated),
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  async remove(id: string): Promise<{ message: string; deletedId: string }> {
    const member = await this.findOne(id);

    // Phải tính cả hai luồng mượn, nếu không một độc giả còn giữ sách qua
    // phiếu mượn ERP vẫn bị xóa và `onDelete: Restrict` sẽ bật lỗi tầng DB.
    const [activeBorrowings, activeSlips] = await Promise.all([
      this.prisma.borrowing.count({
        where: {
          memberId: id,
          status: { in: [BorrowingStatus.BORROWED, BorrowingStatus.OVERDUE] },
        },
      }),
      this.prisma.borrowingSlip.count({
        where: {
          memberId: id,
          status: { in: ['PENDING_APPROVAL', 'BORROWED', 'PARTIAL_RETURNED'] },
        },
      }),
    ]);

    if (activeBorrowings + activeSlips > 0) {
      throw new ConflictException(
        `Không thể xóa độc giả này vì hiện còn ${activeBorrowings} phiếu mượn lẻ và ${activeSlips} phiếu mượn chưa hoàn tất`,
      );
    }

    await this.prisma.member.delete({ where: { id } });

    return {
      message: `Đã xóa độc giả ${member.fullName} (${member.cardNumber}) khỏi hệ thống Supabase`,
      deletedId: id,
    };
  }
}
