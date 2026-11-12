import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BorrowingItemStatus,
  BorrowingSlipStatus,
  ReturnCondition,
} from '@prisma/client';
import { PaginatedResponseDto } from '../../common/dto/pagination.dto.js';
import { BookStatus } from '../../common/enums/book-status.enum.js';
import {
  BookStockService,
  PrismaTx,
} from '../loan-policy/book-stock.service.js';
import { LoanEligibilityService } from '../loan-policy/loan-eligibility.service.js';
import type { RenewalActor } from '../loan-policy/loan-eligibility.service.js';
import { LoanPolicyService } from '../loan-policy/loan-policy.service.js';
import { LoanRenewalHistory } from '../borrowings/entities/loan-renewal.entity.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ReservationsService } from '../reservations/reservations.service.js';
import { CreateBorrowingSlipDto } from './dto/create-borrowing-slip.dto.js';
import { FilterBorrowingSlipDto } from './dto/filter-borrowing-slip.dto.js';
import {
  CancelBorrowingSlipDto,
  RejectBorrowingSlipDto,
} from './dto/reject-borrowing-slip.dto.js';
import { RenewSlipDto } from './dto/renew-slip.dto.js';
import { ReturnSlipItemsDto } from './dto/return-slip-items.dto.js';
import {
  BorrowingSlipDetail,
  BorrowingSlipEntity,
  BorrowingSlipItemEntity,
} from './entities/borrowing-slip.entity.js';

@Injectable()
export class BorrowingSlipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: LoanPolicyService,
    private readonly eligibility: LoanEligibilityService,
    private readonly stock: BookStockService,
    private readonly reservations: ReservationsService,
  ) {}

  async findAll(
    filters: FilterBorrowingSlipDto,
  ): Promise<PaginatedResponseDto<BorrowingSlipEntity>> {
    const page = filters.page || 1;
    const limit = filters.limit || 10;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (filters.memberId) {
      where.memberId = filters.memberId;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.search) {
      const term = filters.search.trim();
      where.OR = [
        { slipNumber: { contains: term, mode: 'insensitive' } },
        { member: { fullName: { contains: term, mode: 'insensitive' } } },
        { member: { cardNumber: { contains: term, mode: 'insensitive' } } },
        {
          items: {
            some: { book: { title: { contains: term, mode: 'insensitive' } } },
          },
        },
      ];
    }

    const [totalItems, slips] = await Promise.all([
      this.prisma.borrowingSlip.count({ where }),
      this.prisma.borrowingSlip.findMany({
        where,
        skip,
        take: limit,
        include: {
          member: true,
          items: {
            include: { book: true },
          },
        },
        orderBy: filters.sortBy
          ? { [filters.sortBy]: (filters.sortOrder ?? 'DESC').toLowerCase() }
          : { createdAt: 'desc' },
      }),
    ]);

    const data = slips.map((s) => this.mapSlipToEntity(s));
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

  async findOne(id: string, actor: RenewalActor): Promise<BorrowingSlipDetail> {
    const slip = await this.prisma.borrowingSlip.findUnique({
      where: { id },
      include: {
        member: true,
        items: {
          include: { book: true },
        },
      },
    });

    if (!slip) {
      throw new NotFoundException(`Không tìm thấy phiếu mượn với ID "${id}"`);
    }

    const renewal = await this.eligibility.getSlipRenewalEligibility(
      slip,
      actor,
    );
    return { ...this.mapSlipToEntity(slip), ...renewal };
  }

  /**
   * Tình huống 1 & 2: lập phiếu mượn nhiều cuốn trong một chứng từ.
   *
   * Điều kiện của độc giả (trạng thái thẻ, hạn thẻ, sách quá hạn, nợ phạt,
   * hạn mức mượn) được uỷ quyền cho `LoanEligibilityService` để hai luồng mượn
   * sách dùng chung một bộ luật thay vì mỗi nơi tự kiểm tra một kiểu.
   */
  async create(dto: CreateBorrowingSlipDto): Promise<BorrowingSlipEntity> {
    const now = new Date();

    if (
      dto.expectedReturnDays !== undefined &&
      dto.expectedReturnDays > this.policy.maxLoanDays
    ) {
      throw new BadRequestException(
        `Thời hạn mượn tối đa theo chính sách thư viện là ${this.policy.maxLoanDays} ngày (yêu cầu ${dto.expectedReturnDays} ngày)`,
      );
    }

    // Gộp items nếu có trùng bookId
    const itemMap = new Map<string, number>();
    for (const item of dto.items) {
      const current = itemMap.get(item.bookId) || 0;
      itemMap.set(item.bookId, current + item.quantity);
    }

    const consolidatedItems = Array.from(itemMap.entries()).map(
      ([bookId, quantity]) => ({
        bookId,
        quantity,
      }),
    );

    const requestedTotalQuantity = consolidatedItems.reduce(
      (sum, item) => sum + item.quantity,
      0,
    );

    const createdSlip = await this.prisma.$transaction(async (tx) => {
      // 1. Điều kiện của độc giả + hạn mức mượn cho TỔNG số cuốn yêu cầu
      await this.eligibility.assertCanBorrow(
        dto.memberId,
        requestedTotalQuantity,
        tx,
        now,
      );

      // 2. Kiểm tra tồn kho của từng cuốn sách
      const bookIds = consolidatedItems.map((i) => i.bookId);
      const books = await tx.book.findMany({ where: { id: { in: bookIds } } });

      if (books.length < bookIds.length || !bookIds.every((id) => books.some((b) => b.id === id))) {
        throw new NotFoundException(
          'Một hoặc nhiều cuốn sách trong danh sách yêu cầu không tồn tại trong thư viện',
        );
      }

      for (const item of consolidatedItems) {
        const book = books.find((b) => b.id === item.bookId)!;
        if (book.status === BookStatus.DISCONTINUED) {
          throw new BadRequestException(
            `Cuốn sách "${book.title}" đã ngừng lưu hành`,
          );
        }
        if (book.copiesAvailable < item.quantity) {
          throw new ConflictException(
            `Sách "${book.title}" chỉ còn ${book.copiesAvailable} cuốn khả dụng trong kho, không đủ số lượng yêu cầu (${item.quantity})`,
          );
        }
      }

      // 3. Tạo phiếu mượn (Master - Detail). Chưa trừ kho: tồn kho chỉ bị trừ
      //    khi chứng từ được phê duyệt ở bước `approve`.
      const dueDate = this.policy.resolveDueDate(now, dto.expectedReturnDays);
      const slipNumber = await this.nextSlipNumber(tx, now);

      return tx.borrowingSlip.create({
        data: {
          slipNumber,
          memberId: dto.memberId,
          status: BorrowingSlipStatus.PENDING_APPROVAL,
          dueDate,
          notes: dto.notes?.trim() || null,
          items: {
            create: consolidatedItems.map((item) => {
              const book = books.find((b) => b.id === item.bookId)!;
              return {
                bookId: item.bookId,
                quantity: item.quantity,
                bookPrice: book.price ?? 150000,
                status: BorrowingItemStatus.PENDING,
              };
            }),
          },
        },
        include: {
          member: true,
          items: { include: { book: true } },
        },
      });
    });

    return this.mapSlipToEntity(createdSlip);
  }

  /**
   * Tình huống 3: phê duyệt chứng từ và xuất kho.
   *
   * Code cũ đọc tồn kho bằng `findUnique` NGOÀI transaction rồi mới trừ kho,
   * nên hai phiếu cùng duyệt bản sách cuối cùng đều vượt qua vòng kiểm tra và
   * `copies_available` tụt xuống số âm. Ở đây:
   *  - chốt trạng thái phiếu bằng atomic update có điều kiện
   *    `status = PENDING_APPROVAL` -> chống double-click / duyệt trùng;
   *  - trừ kho bằng atomic conditional update -> chỉ một phiếu giành được bản
   *    sách cuối cùng, phiếu còn lại nhận 409 và rollback toàn bộ.
   */
  async approve(
    id: string,
    approvedBy = 'Librarian',
  ): Promise<BorrowingSlipEntity> {
    const now = new Date();

    const updatedSlip = await this.prisma.$transaction(async (tx) => {
      const slip = await tx.borrowingSlip.findUnique({
        where: { id },
        include: { items: { include: { book: { select: { title: true } } } } },
      });

      if (!slip) {
        throw new NotFoundException(`Không tìm thấy phiếu mượn với ID "${id}"`);
      }

      if (slip.status !== BorrowingSlipStatus.PENDING_APPROVAL) {
        throw new ConflictException(
          `DOCUMENT_ALREADY_PROCESSED: Phiếu mượn này đang ở trạng thái "${slip.status}", không thể phê duyệt`,
        );
      }

      // Chốt quyền xử lý chứng từ: chỉ một request đi tiếp được.
      const claimed = await tx.borrowingSlip.updateMany({
        where: { id, status: BorrowingSlipStatus.PENDING_APPROVAL },
        data: {
          status: BorrowingSlipStatus.BORROWED,
          borrowDate: now,
          approvedAt: now,
          approvedBy,
        },
      });

      if (claimed.count === 0) {
        throw new ConflictException(
          'DOCUMENT_ALREADY_PROCESSED: Phiếu mượn vừa được phê duyệt bởi một giao dịch khác',
        );
      }

      // Trừ kho atomic cho từng dòng sách. Nếu bất kỳ dòng nào thiếu hàng,
      // exception sẽ rollback cả trạng thái phiếu vừa chốt ở trên.
      for (const item of slip.items) {
        await this.stock.decrementAvailable(
          tx,
          item.bookId,
          item.quantity,
          item.book?.title ?? item.bookId,
        );
      }

      await tx.borrowingSlipItem.updateMany({
        where: { slipId: id, status: BorrowingItemStatus.PENDING },
        data: { status: BorrowingItemStatus.BORROWING },
      });

      const totalQty = slip.items.reduce((sum, it) => sum + it.quantity, 0);
      await tx.member.update({
        where: { id: slip.memberId },
        data: { currentBorrowedCount: { increment: totalQty } },
      });

      // Đóng các phiếu đặt trước của chính độc giả này trên các cuốn vừa xuất kho.
      for (const item of slip.items) {
        await this.reservations.fulfillForBorrow(
          tx,
          slip.memberId,
          item.bookId,
          now,
        );
      }

      return tx.borrowingSlip.findUniqueOrThrow({
        where: { id },
        include: { member: true, items: { include: { book: true } } },
      });
    });

    return this.mapSlipToEntity(updatedSlip);
  }

  async reject(
    id: string,
    dto: RejectBorrowingSlipDto,
  ): Promise<BorrowingSlipEntity> {
    const slip = await this.prisma.borrowingSlip.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!slip) {
      throw new NotFoundException(`Không tìm thấy phiếu mượn với ID "${id}"`);
    }
    const now = new Date();

    if (slip.status !== BorrowingSlipStatus.PENDING_APPROVAL) {
      throw new ConflictException(
        `DOCUMENT_ALREADY_PROCESSED: Không thể từ chối phiếu mượn đang ở trạng thái "${slip.status}"`,
      );
    }

    const updated = await this.prisma.borrowingSlip.update({
      where: { id },
      data: {
        status: BorrowingSlipStatus.REJECTED,
        rejectedAt: now,
        rejectReason: dto.reason.trim(),
        items: {
          updateMany: {
            where: { slipId: id },
            data: { status: BorrowingItemStatus.CANCELLED },
          },
        },
      },
      include: {
        member: true,
        items: { include: { book: true } },
      },
    });

    return this.mapSlipToEntity(updated);
  }

  async cancel(
    id: string,
    dto: CancelBorrowingSlipDto,
  ): Promise<BorrowingSlipEntity> {
    const now = new Date();
    const closedStatuses: string[] = [
      BorrowingSlipStatus.COMPLETED,
      BorrowingSlipStatus.REJECTED,
      BorrowingSlipStatus.CANCELLED,
    ];

    const cancelled = await this.prisma.$transaction(async (tx) => {
      const slip = await tx.borrowingSlip.findUnique({
        where: { id },
        include: { items: true },
      });

      if (!slip) {
        throw new NotFoundException(`Không tìm thấy phiếu mượn với ID "${id}"`);
      }

      if (closedStatuses.includes(slip.status)) {
        throw new ConflictException(
          `DOCUMENT_ALREADY_PROCESSED: Không thể hủy phiếu mượn đã ở trạng thái "${slip.status}"`,
        );
      }

      const wasIssued = (
        [
          BorrowingSlipStatus.BORROWED,
          BorrowingSlipStatus.PARTIAL_RETURNED,
        ] as string[]
      ).includes(slip.status);

      const claimed = await tx.borrowingSlip.updateMany({
        where: { id, status: slip.status },
        data: {
          status: BorrowingSlipStatus.CANCELLED,
          cancelledAt: now,
          cancelReason: dto.reason.trim(),
        },
      });

      if (claimed.count === 0) {
        throw new ConflictException(
          'DOCUMENT_ALREADY_PROCESSED: Phiếu mượn vừa được xử lý bởi một giao dịch khác',
        );
      }

      const activeItems = slip.items.filter(
        (it) =>
          it.status === BorrowingItemStatus.PENDING || it.status === BorrowingItemStatus.BORROWING,
      );

      await tx.borrowingSlipItem.updateMany({
        where: {
          slipId: id,
          status: {
            in: [BorrowingItemStatus.PENDING, BorrowingItemStatus.BORROWING],
          },
        },
        data: { status: BorrowingItemStatus.CANCELLED },
      });

      // Chỉ hoàn kho khi chứng từ đã thực sự xuất kho trước đó.
      if (wasIssued) {
        let remainingTotalQty = 0;
        for (const item of activeItems) {
          const remaining = Math.max(
            0,
            item.quantity - item.returnedQuantity - item.lostQuantity,
          );
          if (remaining > 0) {
            await this.stock.incrementAvailable(tx, item.bookId, remaining);
            remainingTotalQty += remaining;
          }
        }

        if (remainingTotalQty > 0) {
          await tx.member.update({
            where: { id: slip.memberId },
            data: { currentBorrowedCount: { decrement: remainingTotalQty } },
          });
        }
      }

      return tx.borrowingSlip.findUniqueOrThrow({
        where: { id },
        include: { member: true, items: { include: { book: true } } },
      });
    });

    return this.mapSlipToEntity(cancelled);
  }

  /**
   * Tình huống 4: trả sách từng phần, tính phạt quá hạn và bồi thường mất sách.
   *
   * Nguyên tắc chống tính phạt trùng:
   *  - tiền phạt chỉ tính trên SỐ LƯỢNG ĐƯỢC XỬ LÝ trong đợt này
   *    (`processQty`), không tính lại trên số đã trả ở các đợt trước;
   *  - mỗi dòng chi tiết bị chặn nếu phần còn lại đã bằng 0;
   *  - mọi lệnh ghi nằm trong cùng một interactive transaction và dòng chi tiết
   *    được chốt bằng atomic update theo đúng `returnedQuantity`/`lostQuantity`
   *    đã đọc, nên hai request trả cùng một dòng sẽ chỉ có một request thắng.
   *
   * Tiền phạt trễ hạn của một dòng = số ngày quá hạn × mức phạt mỗi ngày × số lượng xử lý.
   */
  async returnItems(
    id: string,
    dto: ReturnSlipItemsDto,
  ): Promise<BorrowingSlipEntity> {
    const now = new Date();
    const returnableStatuses: string[] = [
      BorrowingSlipStatus.BORROWED,
      BorrowingSlipStatus.PARTIAL_RETURNED,
    ];

    const updatedSlip = await this.prisma.$transaction(async (tx) => {
      const slip = await tx.borrowingSlip.findUnique({
        where: { id },
        include: { items: { include: { book: { select: { title: true } } } } },
      });

      if (!slip) {
        throw new NotFoundException(`Không tìm thấy phiếu mượn với ID "${id}"`);
      }

      if (!returnableStatuses.includes(slip.status)) {
        throw new BadRequestException(
          `Chỉ có thể hoàn trả các phiếu mượn đang ở trạng thái BORROWED hoặc PARTIAL_RETURNED (hiện tại: ${slip.status})`,
        );
      }

      // Số ngày quá hạn tính một lần cho cả phiếu, theo mốc đầu ngày.
      const daysLate = this.policy.countOverdueDays(slip.dueDate, now);

      let batchLateFee = 0;
      let batchCompensation = 0;
      let totalProcessedQty = 0;
      const processedMap = new Map<string, number>();

      for (const reqItem of dto.items) {
        const item = slip.items.find((it) => it.id === reqItem.itemId);
        if (!item) {
          throw new NotFoundException(
            `Không tìm thấy dòng chi tiết sách với ID "${reqItem.itemId}" trong phiếu này`,
          );
        }

        if (processedMap.has(item.id)) {
          throw new BadRequestException(
            `Dòng chi tiết "${item.id}" bị khai báo trùng trong cùng một yêu cầu trả sách`,
          );
        }

        const bookTitle = item.book?.title ?? item.bookId;
        const remainingInItem = item.quantity - item.returnedQuantity - item.lostQuantity;
        if (remainingInItem <= 0) {
          throw new BadRequestException(
            `Sách "${bookTitle}" đã được hoàn tất trước đó`,
          );
        }

        const requestedQty = reqItem.quantity ?? 1;
        if (requestedQty > remainingInItem) {
          throw new BadRequestException(
            `Sách "${bookTitle}" chỉ còn ${remainingInItem} cuốn chưa hoàn tất, không thể xử lý ${requestedQty} cuốn`,
          );
        }

        const processQty = requestedQty;
        processedMap.set(item.id, processQty);
        totalProcessedQty += processQty;

        const itemLateFee = daysLate * this.policy.finePerDayPerBook * processQty;
        const itemCompensation =
          reqItem.returnCondition === ReturnCondition.LOST ? item.bookPrice * processQty : 0;

        batchLateFee += itemLateFee;
        batchCompensation += itemCompensation;

        const newReturned =
          reqItem.returnCondition === ReturnCondition.LOST
            ? item.returnedQuantity
            : item.returnedQuantity + processQty;
        const newLost =
          reqItem.returnCondition === ReturnCondition.LOST
            ? item.lostQuantity + processQty
            : item.lostQuantity;

        const isItemFullyProcessed = newReturned + newLost >= item.quantity;
        const nextItemStatus = isItemFullyProcessed
          ? reqItem.returnCondition === ReturnCondition.LOST
            ? BorrowingItemStatus.LOST
            : BorrowingItemStatus.RETURNED
          : BorrowingItemStatus.BORROWING;

        // Chốt dòng chi tiết dựa trên đúng số lượng đã đọc -> chống xử lý trùng.
        const claimedItem = await tx.borrowingSlipItem.updateMany({
          where: {
            id: item.id,
            returnedQuantity: item.returnedQuantity,
            lostQuantity: item.lostQuantity,
          },
          data: {
            returnedQuantity: newReturned,
            lostQuantity: newLost,
            status: nextItemStatus,
            returnDate: now,
            returnCondition: reqItem.returnCondition,
            lateFee: item.lateFee + itemLateFee,
            compensationFee: item.compensationFee + itemCompensation,
            fineAmount: item.fineAmount + itemLateFee + itemCompensation,
            notes: reqItem.notes ? reqItem.notes.trim() : item.notes,
          },
        });

        if (claimedItem.count === 0) {
          throw new ConflictException(
            `Sách "${bookTitle}" vừa được xử lý trả bởi một giao dịch khác. Vui lòng tải lại phiếu mượn`,
          );
        }

        // Sách mất thì không hoàn kho. Sách hỏng vẫn thuộc về thư viện nhưng
        // không còn cho mượn được, nên cũng không cộng lại tồn kho khả dụng.
        if (reqItem.returnCondition === ReturnCondition.GOOD) {
          await this.stock.incrementAvailable(tx, item.bookId, processQty);
          const book = await tx.book.findUnique({
            where: { id: item.bookId },
            select: { copiesAvailable: true },
          });
          await this.reservations.promoteQueueAfterReturn(
            tx,
            item.bookId,
            book?.copiesAvailable ?? 0,
            now,
          );
        }
      }

      // Phiếu hoàn tất khi mọi dòng đã được xử lý hết số lượng.
      const allItemsResolved = slip.items.every((it) => {
        const processed = processedMap.get(it.id) ?? 0;
        return it.returnedQuantity + it.lostQuantity + processed >= it.quantity;
      });

      const batchFine = batchLateFee + batchCompensation;
      const newTotalFine = slip.totalFine + batchFine;
      const paidNow = dto.isPaidNow ?? false;
      // Chỉ coi là đã thanh toán khi không còn khoản phạt nào chưa thu.
      const fineSettled = newTotalFine <= 0 ? true : slip.finePaid && batchFine === 0 ? true : paidNow;

      await tx.borrowingSlip.update({
        where: { id },
        data: {
          status: allItemsResolved
            ? BorrowingSlipStatus.COMPLETED
            : BorrowingSlipStatus.PARTIAL_RETURNED,
          totalFine: newTotalFine,
          finePaid: fineSettled,
          finePaidAt: fineSettled && newTotalFine > 0 ? now : null,
          notes: dto.notes
            ? `${slip.notes ? slip.notes + ' | ' : ''}Trả sách ${now.toLocaleDateString('vi-VN')}: ${dto.notes.trim()}`
            : slip.notes,
        },
      });

      if (totalProcessedQty > 0) {
        await tx.member.update({
          where: { id: slip.memberId },
          data: { currentBorrowedCount: { decrement: totalProcessedQty } },
        });
      }

      return tx.borrowingSlip.findUniqueOrThrow({
        where: { id },
        include: { member: true, items: { include: { book: true } } },
      });
    });

    return this.mapSlipToEntity(updatedSlip);
  }

  /**
   * Tình huống 5: gia hạn phiếu mượn ERP (trước đây luồng này không có gia hạn).
   * Áp dụng cùng bộ luật với phiếu mượn lẻ: chưa trả hết sách, chưa quá hạn,
   * chưa dùng hết số lần gia hạn, và không cuốn nào trong phiếu đang có độc giả
   * khác đặt trước.
   */
  async renew(
    id: string,
    dto: RenewSlipDto,
    actor: RenewalActor,
  ): Promise<BorrowingSlipEntity> {
    const now = new Date();

    const updated = await this.prisma.$transaction(async (tx) => {
      const slip = await tx.borrowingSlip.findUnique({
        where: { id },
        include: { items: { include: { book: { select: { title: true } } } } },
      });

      if (!slip) {
        throw new NotFoundException(`Không tìm thấy phiếu mượn với ID "${id}"`);
      }

      this.eligibility.assertCanRenew(
        await this.eligibility.getSlipRenewalEligibility(slip, actor, tx, now),
      );

      const extraDays = this.policy.resolveRenewDays(dto.extraDays);
      const previousDueDate = new Date(slip.dueDate);
      const newDueDate = new Date(
        previousDueDate.getTime() + extraDays * 24 * 60 * 60 * 1000,
      );
      const nextSequence = slip.renewCount + 1;

      const claimed = await tx.borrowingSlip.updateMany({
        where: { id, renewCount: slip.renewCount, status: slip.status },
        data: {
          dueDate: newDueDate,
          renewCount: nextSequence,
          notes: dto.notes
            ? `${slip.notes ? slip.notes + ' | ' : ''}Gia hạn thêm ${extraDays} ngày: ${dto.notes.trim()}`
            : slip.notes,
        },
      });

      if (claimed.count === 0) {
        throw new ConflictException(
          'Phiếu mượn vừa được gia hạn bởi một giao dịch khác. Vui lòng tải lại dữ liệu',
        );
      }

      await tx.loanRenewal.create({
        data: {
          slipId: id,
          sequence: nextSequence,
          previousDueDate,
          newDueDate,
          extraDays,
          renewedAt: now,
          renewedBy: actor.id,
          reason: dto.notes?.trim() || null,
        },
      });

      return tx.borrowingSlip.findUniqueOrThrow({
        where: { id },
        include: { member: true, items: { include: { book: true } } },
      });
    });

    return this.mapSlipToEntity(updated);
  }

  /** Lịch sử gia hạn của phiếu mượn ERP. */
  async getRenewalHistory(id: string): Promise<LoanRenewalHistory[]> {
    const slip = await this.prisma.borrowingSlip.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!slip) {
      throw new NotFoundException(`Không tìm thấy phiếu mượn với ID "${id}"`);
    }

    const history = await this.prisma.loanRenewal.findMany({
      where: { slipId: id },
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

  /** Thanh toán tiền phạt của phiếu mượn ERP (trước đây chỉ có trên phiếu mượn lẻ). */
  async payFine(id: string): Promise<BorrowingSlipEntity> {
    const now = new Date();

    const updated = await this.prisma.$transaction(async (tx) => {
      const slip = await tx.borrowingSlip.findUnique({
        where: { id },
        select: { id: true, totalFine: true, finePaid: true },
      });

      if (!slip) {
        throw new NotFoundException(`Không tìm thấy phiếu mượn với ID "${id}"`);
      }

      if (slip.totalFine <= 0) {
        throw new BadRequestException(
          'Phiếu mượn này không có phát sinh tiền phạt',
        );
      }

      if (slip.finePaid) {
        throw new BadRequestException(
          'Tiền phạt của phiếu mượn này đã được thanh toán trước đó',
        );
      }

      const claimed = await tx.borrowingSlip.updateMany({
        where: { id, finePaid: false },
        data: { finePaid: true, finePaidAt: now },
      });

      if (claimed.count === 0) {
        throw new ConflictException(
          'Tiền phạt vừa được thanh toán bởi một giao dịch khác',
        );
      }

      return tx.borrowingSlip.findUniqueOrThrow({
        where: { id },
        include: { member: true, items: { include: { book: true } } },
      });
    });

    return this.mapSlipToEntity(updated);
  }

  private async nextSlipNumber(tx: PrismaTx, now: Date): Promise<string> {
    const prefix = `SLIP-${now.getFullYear()}-`;

    const last = await tx.borrowingSlip.findFirst({
      where: { slipNumber: { startsWith: prefix } },
      orderBy: { slipNumber: 'desc' },
      select: { slipNumber: true },
    });

    const lastSequence = last ? Number.parseInt(last.slipNumber.slice(prefix.length), 10) : 0;
    const nextSequence = Number.isFinite(lastSequence) ? lastSequence + 1 : 1;

    return `${prefix}${nextSequence.toString().padStart(4, '0')}`;
  }

  private mapSlipToEntity(s: any): BorrowingSlipEntity {
    return {
      id: s.id,
      slipNumber: s.slipNumber,
      memberId: s.memberId,
      memberName: s.member?.fullName || 'Chưa xác định',
      memberCardNumber: s.member?.cardNumber || 'Chưa xác định',
      status: s.status,
      borrowDate: s.borrowDate || undefined,
      dueDate: s.dueDate,
      approvedAt: s.approvedAt || undefined,
      approvedBy: s.approvedBy || undefined,
      rejectReason: s.rejectReason || undefined,
      cancelReason: s.cancelReason || undefined,
      notes: s.notes || undefined,
      totalFine: s.totalFine,
      finePaid: s.finePaid,
      finePaidAt: s.finePaidAt || undefined,
      renewCount: s.renewCount ?? 0,
      items: (s.items || []).map((it: any): BorrowingSlipItemEntity => ({
        id: it.id,
        slipId: it.slipId,
        bookId: it.bookId,
        bookTitle: it.book?.title || 'Chưa xác định',
        quantity: it.quantity,
        returnedQuantity: it.returnedQuantity,
        lostQuantity: it.lostQuantity,
        bookPrice: it.bookPrice,
        status: it.status,
        returnDate: it.returnDate || undefined,
        returnCondition: it.returnCondition || undefined,
        fineAmount: it.fineAmount,
        lateFee: it.lateFee ?? 0,
        compensationFee: it.compensationFee ?? 0,
        notes: it.notes || undefined,
        createdAt: it.createdAt,
        updatedAt: it.updatedAt,
      })),
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    };
  }
}
