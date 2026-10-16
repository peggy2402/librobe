import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaginatedResponseDto } from '../../common/dto/pagination.dto.js';
import { BookStatus } from '../../common/enums/book-status.enum.js';
import { BorrowingStatus } from '../../common/enums/borrowing-status.enum.js';
import { MemberStatus } from '../../common/enums/member-status.enum.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { BorrowBookDto } from './dto/borrow-book.dto.js';
import { FilterBorrowingDto } from './dto/filter-borrowing.dto.js';
import { RenewLoanDto } from './dto/renew-loan.dto.js';
import { ReturnBookDto } from './dto/return-book.dto.js';
import { Borrowing } from './entities/borrowing.entity.js';

@Injectable()
export class BorrowingsService {
  private readonly FINE_PER_DAY = 5000;
  private readonly MAX_RENEWS = 2;

  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters: FilterBorrowingDto): Promise<PaginatedResponseDto<Borrowing>> {
    await this.refreshOverdueStatus();

    const page = filters.page || 1;
    const limit = filters.limit || 10;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (filters.memberId) {
      where.memberId = filters.memberId;
    }

    if (filters.bookId) {
      where.bookId = filters.bookId;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.isOverdue) {
      where.status = BorrowingStatus.OVERDUE;
    }

    if (filters.search) {
      const term = filters.search.trim();
      where.OR = [
        { transactionCode: { contains: term, mode: 'insensitive' } },
        { member: { fullName: { contains: term, mode: 'insensitive' } } },
        { book: { title: { contains: term, mode: 'insensitive' } } },
      ];
    }

    const [totalItems, borrowings] = await Promise.all([
      this.prisma.borrowing.count({ where }),
      this.prisma.borrowing.findMany({
        where,
        skip,
        take: limit,
        include: {
          member: true,
          book: true,
        },
        orderBy: filters.sortBy
          ? { [filters.sortBy]: (filters.sortOrder ?? 'DESC').toLowerCase() }
          : { createdAt: 'desc' },
      }),
    ]);

    const data: Borrowing[] = borrowings.map((b) => this.mapPrismaToEntity(b));
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

  async findOne(id: string): Promise<Borrowing> {
    await this.refreshOverdueStatus();

    const borrowing = await this.prisma.borrowing.findUnique({
      where: { id },
      include: {
        member: true,
        book: true,
      },
    });

    if (!borrowing) {
      throw new NotFoundException(`Không tìm thấy phiếu mượn với ID "${id}"`);
    }

    return this.mapPrismaToEntity(borrowing);
  }

  async borrowBook(dto: BorrowBookDto): Promise<Borrowing> {
    const now = new Date();

    const member = await this.prisma.member.findUnique({
      where: { id: dto.memberId },
      include: {
        borrowings: {
          where: {
            status: { in: [BorrowingStatus.BORROWED, BorrowingStatus.OVERDUE] },
          },
        },
      },
    });

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

    const hasOverdue = member.borrowings.some(
      (b) =>
        b.status === BorrowingStatus.OVERDUE ||
        (b.status === BorrowingStatus.BORROWED && new Date(b.dueDate) < now),
    );
    if (hasOverdue) {
      throw new BadRequestException(
        'Độc giả hiện có sách mượn đã quá hạn chưa trả. Cần hoàn trả sách và thanh lý phạt trước khi mượn tiếp',
      );
    }

    if (member.borrowings.length >= member.maxBorrowLimit) {
      throw new BadRequestException(
        `Độc giả đã đạt giới hạn mượn tối đa (${member.maxBorrowLimit} cuốn sách)`,
      );
    }

    const book = await this.prisma.book.findUnique({
      where: { id: dto.bookId },
    });

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

    const durationDays = dto.durationDays ?? 14;
    const dueDate = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
    const borrowCount = (await this.prisma.borrowing.count()) + 1;
    const transactionCode = `BRW-${now.getFullYear()}-${borrowCount.toString().padStart(4, '0')}`;

    const newCopiesAvailable = book.copiesAvailable - 1;
    const newBookStatus = newCopiesAvailable === 0 ? BookStatus.OUT_OF_STOCK : book.status;

    const [borrowing] = await this.prisma.$transaction([
      this.prisma.borrowing.create({
        data: {
          transactionCode,
          memberId: member.id,
          bookId: book.id,
          borrowDate: now,
          dueDate,
          renewCount: 0,
          fineAmount: 0,
          finePaid: false,
          notes: dto.notes?.trim() || null,
          status: BorrowingStatus.BORROWED,
        },
        include: {
          member: true,
          book: true,
        },
      }),
      this.prisma.book.update({
        where: { id: book.id },
        data: {
          copiesAvailable: newCopiesAvailable,
          status: newBookStatus as any,
        },
      }),
      this.prisma.member.update({
        where: { id: member.id },
        data: {
          currentBorrowedCount: member.currentBorrowedCount + 1,
        },
      }),
    ]);

    return this.mapPrismaToEntity(borrowing);
  }

  async returnBook(id: string, dto: ReturnBookDto): Promise<Borrowing> {
    const borrowing = await this.findOne(id);
    const now = new Date();

    if (borrowing.status === BorrowingStatus.RETURNED) {
      throw new BadRequestException('Phiếu mượn này đã được hoàn trả trước đó');
    }

    let fineAmount = 0;
    if (now > new Date(borrowing.dueDate)) {
      const diffMs = now.getTime() - new Date(borrowing.dueDate).getTime();
      const daysLate = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      fineAmount = daysLate * this.FINE_PER_DAY;
    }

    const book = await this.prisma.book.findUnique({ where: { id: borrowing.bookId } });
    const member = await this.prisma.member.findUnique({ where: { id: borrowing.memberId } });

    const newCopies = (book?.copiesAvailable ?? 0) + 1;
    const newBookStatus =
      book?.status === BookStatus.OUT_OF_STOCK && newCopies > 0
        ? BookStatus.AVAILABLE
        : book?.status;

    const [updated] = await this.prisma.$transaction([
      this.prisma.borrowing.update({
        where: { id },
        data: {
          returnDate: now,
          fineAmount: fineAmount > 0 ? fineAmount : borrowing.fineAmount,
          finePaid: fineAmount > 0 ? (dto.finePaid ?? true) : true,
          notes: dto.notes ? dto.notes.trim() : borrowing.notes,
          status: BorrowingStatus.RETURNED,
        },
        include: {
          member: true,
          book: true,
        },
      }),
      ...(book
        ? [
            this.prisma.book.update({
              where: { id: book.id },
              data: {
                copiesAvailable: newCopies,
                status: newBookStatus as any,
              },
            }),
          ]
        : []),
      ...(member
        ? [
            this.prisma.member.update({
              where: { id: member.id },
              data: {
                currentBorrowedCount: Math.max(0, member.currentBorrowedCount - 1),
              },
            }),
          ]
        : []),
    ]);

    return this.mapPrismaToEntity(updated);
  }

  async renewLoan(id: string, dto: RenewLoanDto): Promise<Borrowing> {
    const borrowing = await this.findOne(id);
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

    const updated = await this.prisma.borrowing.update({
      where: { id },
      data: {
        dueDate: newDueDate,
        renewCount: borrowing.renewCount + 1,
        notes: dto.notes
          ? `${borrowing.notes ? borrowing.notes + ' | ' : ''}Gia hạn thêm ${extraDays} ngày: ${dto.notes.trim()}`
          : borrowing.notes,
      },
      include: {
        member: true,
        book: true,
      },
    });

    return this.mapPrismaToEntity(updated);
  }

  async payFine(id: string): Promise<Borrowing> {
    const borrowing = await this.findOne(id);
    if (borrowing.fineAmount <= 0) {
      throw new BadRequestException('Phiếu mượn này không có phát sinh tiền phạt');
    }
    if (borrowing.finePaid) {
      throw new BadRequestException('Tiền phạt của phiếu mượn này đã được thanh toán trước đó');
    }

    const updated = await this.prisma.borrowing.update({
      where: { id },
      data: { finePaid: true },
      include: { member: true, book: true },
    });

    return this.mapPrismaToEntity(updated);
  }

  async getOverdueLoans(): Promise<Borrowing[]> {
    await this.refreshOverdueStatus();
    const overdue = await this.prisma.borrowing.findMany({
      where: { status: BorrowingStatus.OVERDUE },
      include: { member: true, book: true },
      orderBy: { dueDate: 'asc' },
    });

    return overdue.map((b) => this.mapPrismaToEntity(b));
  }

  private async refreshOverdueStatus(): Promise<void> {
    const now = new Date();
    const overdueLoans = await this.prisma.borrowing.findMany({
      where: {
        status: BorrowingStatus.BORROWED,
        dueDate: { lt: now },
      },
    });

    for (const loan of overdueLoans) {
      const diffMs = now.getTime() - new Date(loan.dueDate).getTime();
      const daysLate = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      await this.prisma.borrowing.update({
        where: { id: loan.id },
        data: {
          status: BorrowingStatus.OVERDUE,
          fineAmount: daysLate * this.FINE_PER_DAY,
        },
      });
    }
  }

  private mapPrismaToEntity(b: any): Borrowing {
    return {
      id: b.id,
      transactionCode: b.transactionCode,
      memberId: b.memberId,
      memberName: b.member?.fullName || 'Chưa xác định',
      bookId: b.bookId,
      bookTitle: b.book?.title || 'Chưa xác định',
      borrowDate: b.borrowDate,
      dueDate: b.dueDate,
      returnDate: b.returnDate || undefined,
      renewCount: b.renewCount,
      fineAmount: b.fineAmount,
      finePaid: b.finePaid,
      notes: b.notes || undefined,
      status: b.status as BorrowingStatus,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
    };
  }
}
