import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PaginatedResponseDto } from '../../common/dto/pagination.dto.js';
import { BorrowingStatus } from '../../common/enums/borrowing-status.enum.js';
import { MemberStatus } from '../../common/enums/member-status.enum.js';
import { DatabaseService } from '../database/database.service.js';
import { CreateMemberDto } from './dto/create-member.dto.js';
import { FilterMemberDto } from './dto/filter-member.dto.js';
import { UpdateMemberDto } from './dto/update-member.dto.js';
import { Member } from './entities/member.entity.js';

@Injectable()
export class MembersService {
  constructor(private readonly db: DatabaseService) {}

  findAll(filters: FilterMemberDto): PaginatedResponseDto<Member> {
    let members = this.db.getMembers();

    // Cập nhật số sách đang mượn thực tế
    const borrowings = this.db.getBorrowings();
    members = members.map((mem) => {
      const activeCount = borrowings.filter(
        (b) =>
          b.memberId === mem.id &&
          (b.status === BorrowingStatus.BORROWED || b.status === BorrowingStatus.OVERDUE),
      ).length;
      return { ...mem, currentBorrowedCount: activeCount };
    });

    if (filters.status) {
      members = members.filter((m) => m.status === filters.status);
    }

    if (filters.cardNumber) {
      members = members.filter((m) =>
        m.cardNumber.toLowerCase().includes(filters.cardNumber!.toLowerCase()),
      );
    }

    if (filters.search) {
      const term = filters.search.toLowerCase();
      members = members.filter(
        (m) =>
          m.fullName.toLowerCase().includes(term) ||
          m.email.toLowerCase().includes(term) ||
          m.phone.includes(term) ||
          m.cardNumber.toLowerCase().includes(term) ||
          m.address.toLowerCase().includes(term),
      );
    }

    if (filters.sortBy) {
      const key = filters.sortBy as keyof Member;
      members.sort((a, b) => {
        const valA = a[key] ?? '';
        const valB = b[key] ?? '';
        if (filters.sortOrder === 'ASC') {
          return valA > valB ? 1 : -1;
        }
        return valA < valB ? 1 : -1;
      });
    } else {
      members.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }

    const totalItems = members.length;
    const page = filters.page || 1;
    const limit = filters.limit || 10;
    const totalPages = Math.ceil(totalItems / limit) || 1;
    const startIndex = (page - 1) * limit;
    const data = members.slice(startIndex, startIndex + limit);

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

  findOne(id: string): Member {
    const member = this.db.getMemberById(id);
    if (!member) {
      throw new NotFoundException(`Không tìm thấy độc giả với ID "${id}"`);
    }

    // Cập nhật số sách đang mượn thực tế
    const activeCount = this.db
      .getBorrowings()
      .filter(
        (b) =>
          b.memberId === id &&
          (b.status === BorrowingStatus.BORROWED || b.status === BorrowingStatus.OVERDUE),
      ).length;

    return { ...member, currentBorrowedCount: activeCount };
  }

  findByCardNumber(cardNumber: string): Member {
    const member = this.db.getMemberByCardNumber(cardNumber);
    if (!member) {
      throw new NotFoundException(`Không tìm thấy độc giả có số thẻ "${cardNumber}"`);
    }
    return member;
  }

  create(dto: CreateMemberDto): Member {
    const existingEmail = this.db.getMemberByEmail(dto.email);
    if (existingEmail) {
      throw new ConflictException(`Địa chỉ email "${dto.email}" đã được đăng ký cho độc giả khác`);
    }

    const now = new Date();
    const durationMonths = dto.membershipDurationMonths ?? 12;
    const expiryDate = new Date(now);
    expiryDate.setMonth(expiryDate.getMonth() + durationMonths);

    // Tự sinh số thẻ thư viện định dạng: LIB-2026-XXXX
    const memberCount = this.db.getMembers().length + 1;
    const cardNumber = `LIB-${now.getFullYear()}-${memberCount.toString().padStart(4, '0')}`;

    const newMember: Member = {
      id: `mem-${randomUUID().substring(0, 8)}`,
      cardNumber,
      fullName: dto.fullName.trim(),
      email: dto.email.trim().toLowerCase(),
      phone: dto.phone.trim(),
      address: dto.address.trim(),
      membershipExpiry: expiryDate,
      status: MemberStatus.ACTIVE,
      maxBorrowLimit: dto.maxBorrowLimit ?? 5,
      currentBorrowedCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    this.db.setMember(newMember);
    return newMember;
  }

  update(id: string, dto: UpdateMemberDto): Member {
    const member = this.findOne(id);

    if (dto.email && dto.email.trim().toLowerCase() !== member.email.toLowerCase()) {
      const duplicate = this.db.getMemberByEmail(dto.email.trim());
      if (duplicate && duplicate.id !== id) {
        throw new ConflictException(`Địa chỉ email "${dto.email}" đã tồn tại`);
      }
    }

    let expiry = member.membershipExpiry;
    if (dto.membershipExpiry) {
      const parsedDate = new Date(dto.membershipExpiry);
      if (isNaN(parsedDate.getTime())) {
        throw new BadRequestException('Ngày hết hạn thẻ không hợp lệ');
      }
      expiry = parsedDate;
    }

    const updatedMember: Member = {
      ...member,
      fullName: dto.fullName ? dto.fullName.trim() : member.fullName,
      email: dto.email ? dto.email.trim().toLowerCase() : member.email,
      phone: dto.phone ? dto.phone.trim() : member.phone,
      address: dto.address ? dto.address.trim() : member.address,
      status: dto.status ?? member.status,
      membershipExpiry: expiry,
      maxBorrowLimit: dto.maxBorrowLimit ?? member.maxBorrowLimit,
      updatedAt: new Date(),
    };

    this.db.setMember(updatedMember);
    return updatedMember;
  }

  remove(id: string): { message: string; deletedId: string } {
    const member = this.findOne(id);

    // Kiểm tra xem độc giả có đang mượn sách không
    const activeBorrowings = this.db
      .getBorrowings()
      .filter(
        (b) =>
          b.memberId === id &&
          (b.status === BorrowingStatus.BORROWED || b.status === BorrowingStatus.OVERDUE),
      );

    if (activeBorrowings.length > 0) {
      throw new ConflictException(
        `Không thể xóa độc giả này vì hiện còn ${activeBorrowings.length} cuốn sách chưa hoàn trả`,
      );
    }

    this.db.deleteMember(id);
    return {
      message: `Đã xóa độc giả ${member.fullName} (${member.cardNumber}) khỏi hệ thống`,
      deletedId: id,
    };
  }
}
