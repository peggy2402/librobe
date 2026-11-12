import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PaginatedResponseDto } from '../../common/dto/pagination.dto.js';
import { BookStatus } from '../../common/enums/book-status.enum.js';
import { BorrowingStatus } from '../../common/enums/borrowing-status.enum.js';
import {
  BookStockService,
  PrismaTx,
} from '../loan-policy/book-stock.service.js';
import { LoanEligibilityService } from '../loan-policy/loan-eligibility.service.js';
import type { RenewalActor } from '../loan-policy/loan-eligibility.service.js';
import { LoanPolicyService } from '../loan-policy/loan-policy.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ReservationsService } from '../reservations/reservations.service.js';
import { BorrowBookDto } from './dto/borrow-book.dto.js';
import { FilterBorrowingDto } from './dto/filter-borrowing.dto.js';
import { RenewLoanDto } from './dto/renew-loan.dto.js';
import { ReturnBookDto } from './dto/return-book.dto.js';
import { Borrowing, BorrowingDetail } from './entities/borrowing.entity.js';
import { LoanRenewalHistory } from './entities/loan-renewal.entity.js';

/** Số lần thử lại khi mã phiếu mượn bị trùng do hai request tạo cùng lúc. */
const CODE_RETRY_ATTEMPTS = 5;

@Injectable()
export class BorrowingsService {
  private readonly logger = new Logger(BorrowingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: LoanPolicyService,
    private readonly eligibility: LoanEligibilityService,
    private readonly stock: BookStockService,
    private readonly reservations: ReservationsService,
  ) {}

  async findAll(
    filters: FilterBorrowingDto,
  ): Promise<PaginatedResponseDto<Borrowing>> {
    await this.refreshOverdueStatus();

    const page = filters.page || 1;
    const limit = filters.limit || 10;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

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

  async findOne(id: string, actor: RenewalActor): Promise<BorrowingDetail> {
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

    const renewal = await this.eligibility.getBorrowingRenewalEligibility(
      borrowing,
      actor,
    );
    return { ...this.mapPrismaToEntity(borrowing), ...renewal };
  }

  /**
   * Tình huống 1 & 2 & 3: mượn sách.
   *
   * Toàn bộ kiểm tra điều kiện VÀ các lệnh ghi đều nằm trong cùng một
   * interactive transaction. Việc trừ kho dùng atomic conditional update
   * (xem `BookStockService.decrementAvailable`), nên hai độc giả cùng mượn bản
   * sách cuối cùng thì chỉ một giao dịch thành công, giao dịch còn lại nhận 409
   * và được rollback hoàn toàn (không tạo phiếu mượn, không trừ kho,
   * không tăng `currentBorrowedCount`).
   */
  async borrowBook(dto: BorrowBookDto): Promise<Borrowing> {
    for (let attempt = 1; attempt <= CODE_RETRY_ATTEMPTS; attempt += 1) {
      try {
        return await this.createLoanTransaction(dto);
      } catch (error) {
        if (this.isDuplicateCodeError(error) && attempt < CODE_RETRY_ATTEMPTS) {
          this.logger.warn(
            `Mã phiếu mượn bị trùng do tạo đồng thời, thử lại lần ${attempt + 1}/${CODE_RETRY_ATTEMPTS}`,
          );
          continue;
        }
        throw error;
      }
    }

    throw new ConflictException(
      'Hệ thống đang xử lý quá nhiều phiếu mượn cùng lúc. Vui lòng thử lại sau',
    );
  }

  private async createLoanTransaction(dto: BorrowBookDto): Promise<Borrowing> {
    const now = new Date();

    if (dto.durationDays !== undefined && dto.durationDays > this.policy.maxLoanDays) {
      throw new BadRequestException(
        `Thời hạn mượn tối đa theo chính sách thư viện là ${this.policy.maxLoanDays} ngày (yêu cầu ${dto.durationDays} ngày)`,
      );
    }

    const created = await this.prisma.$transaction(async (tx) => {
      // 1. Điều kiện của độc giả: trạng thái thẻ, hạn thẻ, sách quá hạn,
      //    nợ phạt chưa thanh toán và hạn mức mượn (tính trên cả 2 luồng mượn).
      await this.eligibility.assertCanBorrow(dto.memberId, 1, tx, now);

      // 2. Điều kiện của cuốn sách
      const book = await tx.book.findUnique({
        where: { id: dto.bookId },
        select: { id: true, title: true, status: true, copiesAvailable: true },
      });

      if (!book) {
        throw new NotFoundException(
          `Không tìm thấy cuốn sách với ID "${dto.bookId}"`,
        );
      }

      if (book.status === BookStatus.DISCONTINUED) {
        throw new BadRequestException(
          'Cuốn sách này đã ngừng lưu hành trong thư viện',
        );
      }

      if (book.copiesAvailable <= 0) {
        throw new BadRequestException(
          `Cuốn sách "${book.title}" hiện tại đã hết bản in sẵn có để mượn`,
        );
      }

      // 3. Trừ kho atomic — đây là chốt chặn thật sự cho tình huống tranh chấp.
      await this.stock.decrementAvailable(tx, book.id, 1, book.title);

      // 4. Ghi nhận phiếu mượn
      const dueDate = this.policy.resolveDueDate(now, dto.durationDays);
      const transactionCode = await this.nextTransactionCode(tx, now);

      const borrowing = await tx.borrowing.create({
        data: {
          transactionCode,
          memberId: dto.memberId,
          bookId: book.id,
          borrowDate: now,
          dueDate,
          renewCount: 0,
          fineAmount: 0,
          finePaid: false,
          notes: dto.notes?.trim() || null,
          status: BorrowingStatus.BORROWED,
        },
        include: { member: true, book: true },
      });

      await tx.member.update({
        where: { id: dto.memberId },
        data: { currentBorrowedCount: { increment: 1 } },
      });

      // 5. Nếu độc giả này từng đặt trước chính cuốn sách đó, đóng phiếu đặt trước.
      await this.reservations.fulfillForBorrow(tx, dto.memberId, book.id, now);

      return borrowing;
    });

    return this.mapPrismaToEntity(created);
  }

  /**
   * Tình huống 4: trả sách (đúng hạn hoặc quá hạn).
   *
   * - Tiền phạt = số ngày quá hạn × mức phạt/ngày (lấy từ cấu hình).
   * - Chốt trạng thái RETURNED bằng atomic update có điều kiện `returnDate IS NULL`,
   *   nên hai request trả sách đồng thời chỉ có một request thành công
   *   -> không cộng phạt trùng, không hoàn kho hai lần.
   * - `finePaid` mặc định là false: trả sách và thanh toán phạt là hai trạng thái
   *   độc lập, nộp phạt về sau qua `POST /api/borrowings/:id/pay-fine`.
   */
  async returnBook(id: string, dto: ReturnBookDto): Promise<Borrowing> {
    const now = new Date();

    const updated = await this.prisma.$transaction(async (tx) => {
      const borrowing = await tx.borrowing.findUnique({
        where: { id },
        select: {
          id: true,
          bookId: true,
          memberId: true,
          dueDate: true,
          returnDate: true,
          status: true,
          fineAmount: true,
          finePaid: true,
          notes: true,
        },
      });

      if (!borrowing) {
        throw new NotFoundException(`Không tìm thấy phiếu mượn với ID "${id}"`);
      }

      if (
        borrowing.returnDate ||
        borrowing.status === BorrowingStatus.RETURNED
      ) {
        throw new BadRequestException(
          'Phiếu mượn này đã được hoàn trả trước đó',
        );
      }

      const overdueDays = this.policy.countOverdueDays(borrowing.dueDate, now);
      const lateFee = this.policy.calculateLateFee(borrowing.dueDate, now, 1);

      // Không hạ thấp khoản phạt đã ghi nhận trước đó (ví dụ đã dồn tích trong
      // lúc sách còn đang quá hạn), đồng thời nếu phần đã thu vẫn đủ phủ khoản
      // phạt cuối cùng thì giữ nguyên trạng thái "đã thanh toán".
      const accruedFine = Math.max(lateFee, borrowing.fineAmount);
      const alreadySettled = borrowing.finePaid && borrowing.fineAmount >= accruedFine;
      const fineSettled = accruedFine <= 0 ? true : alreadySettled || (dto.finePaid ?? false);

      // Chỉ bản ghi còn `returnDate IS NULL` mới được cập nhật -> chống trả sách trùng.
      const claimed = await tx.borrowing.updateMany({
        where: { id, returnDate: null },
        data: {
          returnDate: now,
          fineAmount: accruedFine,
          finePaid: fineSettled,
          finePaidAt: fineSettled && accruedFine > 0 ? now : null,
          notes: dto.notes ? dto.notes.trim() : borrowing.notes,
          status: BorrowingStatus.RETURNED,
        },
      });

      if (claimed.count === 0) {
        throw new ConflictException(
          'Phiếu mượn vừa được xử lý trả sách bởi một giao dịch khác. Vui lòng tải lại dữ liệu',
        );
      }

      // Hoàn bản sách về kho và giảm số sách đang giữ của độc giả.
      await this.stock.incrementAvailable(tx, borrowing.bookId, 1);
      await tx.member.update({
        where: { id: borrowing.memberId },
        data: { currentBorrowedCount: { decrement: 1 } },
      });

      // Sách về kho thì đánh thức hàng đợi đặt trước.
      const book = await tx.book.findUnique({
        where: { id: borrowing.bookId },
        select: { copiesAvailable: true },
      });
      await this.reservations.promoteQueueAfterReturn(
        tx,
        borrowing.bookId,
        book?.copiesAvailable ?? 0,
        now,
      );

      this.logger.log(
        `Trả sách phiếu ${id}: quá hạn ${overdueDays} ngày, tiền phạt ${accruedFine} VNĐ, đã thu: ${fineSettled}`,
      );

      return tx.borrowing.findUniqueOrThrow({
        where: { id },
        include: { member: true, book: true },
      });
    });

    return this.mapPrismaToEntity(updated);
  }

  /**
   * Tình huống 5: gia hạn.
   *
   * Thứ tự kiểm tra (cố định để thông điệp lỗi luôn xác định được):
   * 1. Phiếu tồn tại        -> 404
   * 2. MEMBER là chủ phiếu  -> 403 nếu không khớp memberId
   * 3. Điều kiện gia hạn dùng chung với GET chi tiết -> 400/409
   */
  async renewLoan(
    id: string,
    dto: RenewLoanDto,
    actor: RenewalActor,
  ): Promise<Borrowing> {
    const now = new Date();

    const updated = await this.prisma.$transaction(async (tx) => {
      const borrowing = await tx.borrowing.findUnique({
        where: { id },
        select: {
          id: true,
          bookId: true,
          memberId: true,
          dueDate: true,
          returnDate: true,
          renewCount: true,
          status: true,
          notes: true,
          book: { select: { title: true } },
        },
      });

      if (!borrowing) {
        throw new NotFoundException(`Không tìm thấy phiếu mượn với ID "${id}"`);
      }

      this.eligibility.assertCanRenew(
        await this.eligibility.getBorrowingRenewalEligibility(
          borrowing,
          actor,
          tx,
          now,
        ),
      );

      const extraDays = this.policy.resolveRenewDays(dto.extraDays);
      const previousDueDate = new Date(borrowing.dueDate);
      const newDueDate = new Date(
        previousDueDate.getTime() + extraDays * 24 * 60 * 60 * 1000,
      );
      const nextSequence = borrowing.renewCount + 1;

      // Atomic: chỉ gia hạn khi renewCount vẫn đúng như lúc kiểm tra
      // -> hai request gia hạn đồng thời không thể cùng cộng ngày.
      const claimed = await tx.borrowing.updateMany({
        where: { id, renewCount: borrowing.renewCount, returnDate: null },
        data: {
          dueDate: newDueDate,
          renewCount: nextSequence,
          notes: dto.notes
            ? `${borrowing.notes ? borrowing.notes + ' | ' : ''}Gia hạn thêm ${extraDays} ngày: ${dto.notes.trim()}`
            : borrowing.notes,
        },
      });

      if (claimed.count === 0) {
        throw new ConflictException(
          'Phiếu mượn vừa được gia hạn bởi một giao dịch khác. Vui lòng tải lại dữ liệu',
        );
      }

      // Lưu vết audit cho từng lần gia hạn
      await tx.loanRenewal.create({
        data: {
          borrowingId: id,
          sequence: nextSequence,
          previousDueDate,
          newDueDate,
          extraDays,
          renewedAt: now,
          renewedBy: actor.id,
          reason: dto.notes?.trim() || null,
        },
      });

      return tx.borrowing.findUniqueOrThrow({
        where: { id },
        include: { member: true, book: true },
      });
    });

    return this.mapPrismaToEntity(updated);
  }

  /** Lịch sử gia hạn của một phiếu mượn (audit trail). */
  async getRenewalHistory(id: string): Promise<LoanRenewalHistory[]> {
    const borrowing = await this.prisma.borrowing.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!borrowing) {
      throw new NotFoundException(`Không tìm thấy phiếu mượn với ID "${id}"`);
    }

    const history = await this.prisma.loanRenewal.findMany({
      where: { borrowingId: id },
      orderBy: { sequence: 'asc' },
    });

    return history.map((h) => ({
      id: h.id,
      borrowingId: h.borrowingId ?? undefined,
      slipId: h.slipId ?? undefined,
      sequence: h.sequence,
      previousDueDate: h.previousDueDate,
      newDueDate: h.newDueDate,
      extraDays: h.extraDays,
      renewedAt: h.renewedAt,
      renewedBy: h.renewedBy ?? undefined,
      reason: h.reason ?? undefined,
    }));
  }

  /** Thanh toán tiền phạt — độc lập với việc đã trả sách hay chưa. */
  async payFine(id: string): Promise<Borrowing> {
    const now = new Date();

    const updated = await this.prisma.$transaction(async (tx) => {
      const borrowing = await tx.borrowing.findUnique({
        where: { id },
        select: { id: true, fineAmount: true, finePaid: true },
      });

      if (!borrowing) {
        throw new NotFoundException(`Không tìm thấy phiếu mượn với ID "${id}"`);
      }

      if (borrowing.fineAmount <= 0) {
        throw new BadRequestException(
          'Phiếu mượn này không có phát sinh tiền phạt',
        );
      }

      if (borrowing.finePaid) {
        throw new BadRequestException(
          'Tiền phạt của phiếu mượn này đã được thanh toán trước đó',
        );
      }

      // Chống thu phạt hai lần khi người dùng bấm nút liên tiếp.
      const claimed = await tx.borrowing.updateMany({
        where: { id, finePaid: false },
        data: { finePaid: true, finePaidAt: now },
      });

      if (claimed.count === 0) {
        throw new ConflictException(
          'Tiền phạt vừa được thanh toán bởi một giao dịch khác',
        );
      }

      return tx.borrowing.findUniqueOrThrow({
        where: { id },
        include: { member: true, book: true },
      });
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

  /** Danh sách khoản phạt chưa thanh toán, phục vụ thu ngân tại quầy. */
  async getUnpaidFines(memberId?: string): Promise<{
    totalUnpaidFine: number;
    totalRecords: number;
    items: Borrowing[];
  }> {
    await this.refreshOverdueStatus();

    const where: Prisma.BorrowingWhereInput = {
      finePaid: false,
      fineAmount: { gt: 0 },
      ...(memberId ? { memberId } : {}),
    };

    const records = await this.prisma.borrowing.findMany({
      where,
      include: { member: true, book: true },
      orderBy: { dueDate: 'asc' },
    });

    return {
      totalUnpaidFine: records.reduce((sum, r) => sum + r.fineAmount, 0),
      totalRecords: records.length,
      items: records.map((r) => this.mapPrismaToEntity(r)),
    };
  }

  /**
   * Cập nhật trạng thái quá hạn và dồn tích tiền phạt.
   *
   * Code cũ chạy N+1 (findMany rồi update từng dòng trong vòng lặp) và ghi đè
   * `fineAmount` kể cả với khoản đã thanh toán. Ở đây gom lại thành 2 câu lệnh
   * set-based và loại trừ `fine_paid = true`, nên khoản phạt đã thu không bị
   * tính lại và không phát sinh phạt trùng.
   */
  private async refreshOverdueStatus(now: Date = new Date()): Promise<void> {
    const graceDays = this.policy.fineGraceDays;
    const finePerDay = this.policy.finePerDayPerBook;

    await this.prisma.$transaction([
      // 1. BORROWED quá hạn -> OVERDUE
      this.prisma.$executeRaw`
        UPDATE borrowings
        SET status = 'OVERDUE', updated_at = NOW()
        WHERE return_date IS NULL
          AND status = 'BORROWED'
          AND ((${now}::timestamptz)::date - due_date::date) > ${graceDays}
      `,
      // 2. Dồn tích tiền phạt cho các khoản chưa thanh toán
      this.prisma.$executeRaw`
        UPDATE borrowings
        SET fine_amount = GREATEST(0, ((${now}::timestamptz)::date - due_date::date) - ${graceDays}) * ${finePerDay},
            updated_at = NOW()
        WHERE return_date IS NULL
          AND status = 'OVERDUE'
          AND fine_paid = false
          AND fine_amount <> GREATEST(0, ((${now}::timestamptz)::date - due_date::date) - ${graceDays}) * ${finePerDay}
      `,
    ]);
  }

  /**
   * Sinh mã phiếu mượn dạng BRW-YYYY-NNNN.
   * Code cũ dùng `count() + 1` NGOÀI transaction, hai request đồng thời sinh
   * cùng một mã và vi phạm ràng buộc unique. Ở đây mã được sinh trong
   * transaction, lấy theo số lớn nhất hiện có, và `borrowBook` có cơ chế
   * thử lại nếu vẫn trùng.
   */
  private async nextTransactionCode(tx: PrismaTx, now: Date): Promise<string> {
    const prefix = `BRW-${now.getFullYear()}-`;

    const last = await tx.borrowing.findFirst({
      where: { transactionCode: { startsWith: prefix } },
      orderBy: { transactionCode: 'desc' },
      select: { transactionCode: true },
    });

    const lastSequence = last ? Number.parseInt(last.transactionCode.slice(prefix.length), 10) : 0;
    const nextSequence = Number.isFinite(lastSequence) ? lastSequence + 1 : 1;

    return `${prefix}${nextSequence.toString().padStart(4, '0')}`;
  }

  private isDuplicateCodeError(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' &&
      JSON.stringify(error.meta ?? {}).includes('transaction_code')
    );
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
      finePaidAt: b.finePaidAt || undefined,
      notes: b.notes || undefined,
      status: b.status as BorrowingStatus,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
    };
  }
}
