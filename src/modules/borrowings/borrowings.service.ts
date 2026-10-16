import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PaginatedResponseDto } from '../../common/dto/pagination.dto.js';
import { BookStatus } from '../../common/enums/book-status.enum.js';
import { BorrowingStatus } from '../../common/enums/borrowing-status.enum.js';
import { MemberStatus } from '../../common/enums/member-status.enum.js';
import { DatabaseService } from '../database/database.service.js';
import { BorrowBookDto } from './dto/borrow-book.dto.js';
import { FilterBorrowingDto } from './dto/filter-borrowing.dto.js';
import { RenewLoanDto } from './dto/renew-loan.dto.js';
import { ReturnBookDto } from './dto/return-book.dto.js';
import { Borrowing } from './entities/borrowing.entity.js';

@Injectable()
export class BorrowingsService {
  private readonly FINE_PER_DAY = 5000; // 5.000 VNĐ / ngày trễ hạn
  private readonly MAX_RENEWS = 2; // Tối đa gia hạn 2 lần

  constructor(private readonly db: DatabaseService) {}

  findAll(filters: FilterBorrowingDto): PaginatedResponseDto<Borrowing> {
    this.refreshOverdueStatus();
    let borrowings = this.db.getBorrowings();

    if (filters.memberId) {
      borrowings = borrowings.filter((b) => b.memberId === filters.memberId);
    }

    if (filters.bookId) {
      borrowings = borrowings.filter((b) => b.bookId === filters.bookId);
    }

    if (filters.status) {
      borrowings = borrowings.filter((b) => b.status === filters.status);
    }

    if (filters.isOverdue) {
      borrowings = borrowings.filter((b) => b.status === BorrowingStatus.OVERDUE);
    }

    if (filters.search) {
      const term = filters.search.toLowerCase();
      borrowings = borrowings.filter(
        (b) =>
          b.transactionCode.toLowerCase().includes(term) ||
          b.memberName.toLowerCase().includes(term) ||
          b.bookTitle.toLowerCase().includes(term),
      );
    }

    if (filters.sortBy) {
      const key = filters.sortBy as keyof Borrowing;
      borrowings.sort((a, b) => {
        const valA = a[key] ?? '';
        const valB = b[key] ?? '';
        if (filters.sortOrder === 'ASC') {
          return valA > valB ? 1 : -1;
        }
        return valA < valB ? 1 : -1;
      });
    } else {
      borrowings.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }

    const totalItems = borrowings.length;
    const page = filters.page || 1;
    const limit = filters.limit || 10;
    const totalPages = Math.ceil(totalItems / limit) || 1;
    const startIndex = (page - 1) * limit;
    const data = borrowings.slice(startIndex, startIndex + limit);

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

  findOne(id: string): Borrowing {
    this.refreshOverdueStatus();
    const borrowing = this.db.getBorrowingById(id);
    if (!borrowing) {
      throw new NotFoundException(`Không tìm thấy phiếu mượn với ID "${id}"`);
    }
    return borrowing;
  }

  borrowBook(dto: BorrowBookDto): Borrowing {
    const now = new Date();

    // 1. Kiểm tra độc giả
    const member = this.db.getMemberById(dto.memberId);
    if (!member) {
      throw new NotFoundException(`Không tìm thấy độc giả với ID "${dto.memberId}"`);
    }

    if (member.status !== MemberStatus.ACTIVE) {
      throw new BadRequestException(
        `Thẻ độc giả đang ở trạng thái "${member.status}". Không đủ điều kiện mượn sách`,
      );
    }

    if (new Date(member.membershipExpiry) < now) {
      throw new BadRequestException('Thẻ thư viện của độc giả đã hết hạn. Vui lòng gia hạn thẻ');
    }

    // Kiểm tra độc giả có phiếu mượn nào đang bị quá hạn không
    const memberBorrowings = this.db.getBorrowingsByMemberId(member.id);
    const hasOverdue = memberBorrowings.some(
      (b) =>
        (b.status === BorrowingStatus.OVERDUE ||
          (b.status === BorrowingStatus.BORROWED && new Date(b.dueDate) < now)),
    );
    if (hasOverdue) {
      throw new BadRequestException(
        'Độc giả hiện có sách mượn đã quá hạn chưa trả. Cần hoàn trả sách và thanh lý phạt trước khi mượn tiếp',
      );
    }

    // Đếm số sách đang mượn hiện tại
    const activeCount = memberBorrowings.filter(
      (b) => b.status === BorrowingStatus.BORROWED || b.status === BorrowingStatus.OVERDUE,
    ).length;

    if (activeCount >= member.maxBorrowLimit) {
      throw new BadRequestException(
        `Độc giả đã đạt giới hạn mượn tối đa (${member.maxBorrowLimit} cuốn sách)`,
      );
    }

    // 2. Kiểm tra sách
    const book = this.db.getBookById(dto.bookId);
    if (!book) {
      throw new NotFoundException(`Không tìm thấy cuốn sách với ID "${dto.bookId}"`);
    }

    if (book.status === BookStatus.DISCONTINUED) {
      throw new BadRequestException('Cuốn sách này đã ngừng lưu hành trong thư viện');
    }

    if (book.copiesAvailable <= 0) {
      throw new BadRequestException(
        `Cuốn sách "${book.title}" hiện tại đã hết bản in sẵn có để mượn`,
      );
    }

    // 3. Tiến hành trừ kho sách
    book.copiesAvailable -= 1;
    if (book.copiesAvailable === 0) {
      book.status = BookStatus.OUT_OF_STOCK;
    }
    book.updatedAt = now;
    this.db.setBook(book);

    // 4. Cập nhật số sách đang mượn của thành viên
    member.currentBorrowedCount = activeCount + 1;
    member.updatedAt = now;
    this.db.setMember(member);

    // 5. Tạo phiếu mượn
    const durationDays = dto.durationDays ?? 14;
    const dueDate = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
    const borrowCount = this.db.getBorrowings().length + 1;
    const transactionCode = `BRW-${now.getFullYear()}-${borrowCount.toString().padStart(4, '0')}`;

    const newBorrowing: Borrowing = {
      id: `brw-${randomUUID().substring(0, 8)}`,
      transactionCode,
      memberId: member.id,
      memberName: member.fullName,
      bookId: book.id,
      bookTitle: book.title,
      borrowDate: now,
      dueDate,
      renewCount: 0,
      fineAmount: 0,
      finePaid: false,
      notes: dto.notes?.trim(),
      status: BorrowingStatus.BORROWED,
      createdAt: now,
      updatedAt: now,
    };

    this.db.setBorrowing(newBorrowing);
    return newBorrowing;
  }

  returnBook(id: string, dto: ReturnBookDto): Borrowing {
    const borrowing = this.findOne(id);
    const now = new Date();

    if (borrowing.status === BorrowingStatus.RETURNED) {
      throw new BadRequestException('Phiếu mượn này đã được hoàn trả trước đó');
    }

    // 1. Hoàn lại kho sách
    const book = this.db.getBookById(borrowing.bookId);
    if (book) {
      book.copiesAvailable += 1;
      if (book.status === BookStatus.OUT_OF_STOCK && book.copiesAvailable > 0) {
        book.status = BookStatus.AVAILABLE;
      }
      book.updatedAt = now;
      this.db.setBook(book);
    }

    // 2. Giảm số sách đang mượn của độc giả
    const member = this.db.getMemberById(borrowing.memberId);
    if (member) {
      member.currentBorrowedCount = Math.max(0, member.currentBorrowedCount - 1);
      member.updatedAt = now;
      this.db.setMember(member);
    }

    // 3. Tính tiền phạt nếu trả trễ hạn
    let fineAmount = 0;
    if (now > new Date(borrowing.dueDate)) {
      const diffMs = now.getTime() - new Date(borrowing.dueDate).getTime();
      const daysLate = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      fineAmount = daysLate * this.FINE_PER_DAY;
    }

    const updatedBorrowing: Borrowing = {
      ...borrowing,
      returnDate: now,
      fineAmount: fineAmount > 0 ? fineAmount : borrowing.fineAmount,
      finePaid: fineAmount > 0 ? (dto.finePaid ?? true) : true,
      notes: dto.notes ? dto.notes.trim() : borrowing.notes,
      status: BorrowingStatus.RETURNED,
      updatedAt: now,
    };

    this.db.setBorrowing(updatedBorrowing);
    return updatedBorrowing;
  }

  renewLoan(id: string, dto: RenewLoanDto): Borrowing {
    const borrowing = this.findOne(id);
    const now = new Date();

    if (borrowing.status !== BorrowingStatus.BORROWED) {
      throw new BadRequestException(
        `Chỉ có thể gia hạn phiếu mượn đang ở trạng thái "${BorrowingStatus.BORROWED}"`,
      );
    }

    if (now > new Date(borrowing.dueDate)) {
      throw new BadRequestException(
        'Phiếu mượn đã quá hạn chót trả sách. Không được phép gia hạn thêm',
      );
    }

    if (borrowing.renewCount >= this.MAX_RENEWS) {
      throw new BadRequestException(
        `Đã đạt số lần gia hạn tối đa (${this.MAX_RENEWS} lần) cho cuốn sách này`,
      );
    }

    const extraDays = dto.extraDays ?? 7;
    const currentDueDate = new Date(borrowing.dueDate);
    const newDueDate = new Date(currentDueDate.getTime() + extraDays * 24 * 60 * 60 * 1000);

    const updatedBorrowing: Borrowing = {
      ...borrowing,
      dueDate: newDueDate,
      renewCount: borrowing.renewCount + 1,
      notes: dto.notes
        ? `${borrowing.notes ? borrowing.notes + ' | ' : ''}Gia hạn thêm ${extraDays} ngày: ${dto.notes.trim()}`
        : borrowing.notes,
      updatedAt: now,
    };

    this.db.setBorrowing(updatedBorrowing);
    return updatedBorrowing;
  }

  payFine(id: string): Borrowing {
    const borrowing = this.findOne(id);
    if (borrowing.fineAmount <= 0) {
      throw new BadRequestException('Phiếu mượn này không có phát sinh tiền phạt');
    }
    if (borrowing.finePaid) {
      throw new BadRequestException('Tiền phạt của phiếu mượn này đã được thanh toán trước đó');
    }

    const updated: Borrowing = {
      ...borrowing,
      finePaid: true,
      updatedAt: new Date(),
    };
    this.db.setBorrowing(updated);
    return updated;
  }

  getOverdueLoans(): Borrowing[] {
    this.refreshOverdueStatus();
    return this.db.getBorrowings().filter((b) => b.status === BorrowingStatus.OVERDUE);
  }

  /**
   * Tự động quét và cập nhật trạng thái các phiếu mượn bị quá hạn
   */
  private refreshOverdueStatus(): void {
    const now = new Date();
    const borrowings = this.db.getBorrowings();

    borrowings.forEach((b) => {
      if (b.status === BorrowingStatus.BORROWED && new Date(b.dueDate) < now) {
        const diffMs = now.getTime() - new Date(b.dueDate).getTime();
        const daysLate = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        b.status = BorrowingStatus.OVERDUE;
        b.fineAmount = daysLate * this.FINE_PER_DAY;
        b.updatedAt = now;
        this.db.setBorrowing(b);
      }
    });
  }
}
