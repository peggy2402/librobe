import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BorrowingItemStatus,
  BorrowingSlipStatus,
  MemberStatus,
  ReturnCondition,
} from '@prisma/client';
import { PaginatedResponseDto } from '../../common/dto/pagination.dto.js';
import { BookStatus } from '../../common/enums/book-status.enum.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateBorrowingSlipDto } from './dto/create-borrowing-slip.dto.js';
import { FilterBorrowingSlipDto } from './dto/filter-borrowing-slip.dto.js';
import { CancelBorrowingSlipDto, RejectBorrowingSlipDto } from './dto/reject-borrowing-slip.dto.js';
import { ReturnSlipItemsDto } from './dto/return-slip-items.dto.js';
import { BorrowingSlipEntity, BorrowingSlipItemEntity } from './entities/borrowing-slip.entity.js';

@Injectable()
export class BorrowingSlipsService {
  private readonly FINE_PER_DAY = 5000;

  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters: FilterBorrowingSlipDto): Promise<PaginatedResponseDto<BorrowingSlipEntity>> {
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
        { items: { some: { book: { title: { contains: term, mode: 'insensitive' } } } } },
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

  async findOne(id: string): Promise<BorrowingSlipEntity> {
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

    return this.mapSlipToEntity(slip);
  }

  async create(dto: CreateBorrowingSlipDto): Promise<BorrowingSlipEntity> {
    const now = new Date();

    // 1. Kiểm tra độc giả
    const member = await this.prisma.member.findUnique({
      where: { id: dto.memberId },
      include: {
        borrowings: true,
        borrowingSlips: {
          include: { items: true },
        },
      },
    });

    if (!member) {
      throw new NotFoundException(`Không tìm thấy độc giả với ID "${dto.memberId}"`);
    }

    if (member.status !== MemberStatus.ACTIVE) {
      throw new BadRequestException(
        `Thẻ độc giả đang ở trạng thái "${member.status}". Không đủ điều kiện lập phiếu mượn`,
      );
    }

    if (new Date(member.membershipExpiry) < now) {
      throw new BadRequestException('Thẻ thư viện của độc giả đã hết hạn. Vui lòng gia hạn thẻ');
    }

    // Kiểm tra sách quá hạn
    const hasOldOverdue = member.borrowings.some(
      (b) => b.status === 'OVERDUE' || (b.status === 'BORROWED' && new Date(b.dueDate) < now),
    );
    const hasSlipOverdue = member.borrowingSlips.some(
      (s) => ['BORROWED', 'PARTIAL_RETURNED'].includes(s.status as any) && new Date(s.dueDate) < now,
    );
    if (hasOldOverdue || hasSlipOverdue) {
      throw new BadRequestException(
        'Độc giả hiện có sách mượn đã quá hạn chưa hoàn trả. Cần trả sách trước khi tạo phiếu mới',
      );
    }

    // Gộp items nếu có trùng bookId
    const itemMap = new Map<string, number>();
    for (const item of dto.items) {
      const current = itemMap.get(item.bookId) || 0;
      itemMap.set(item.bookId, current + item.quantity);
    }

    const consolidatedItems = Array.from(itemMap.entries()).map(([bookId, quantity]) => ({
      bookId,
      quantity,
    }));

    const requestedTotalQuantity = consolidatedItems.reduce((sum, item) => sum + item.quantity, 0);

    // Tính số sách đang mượn
    const activeOldCount = member.borrowings.filter((b) =>
      ['BORROWED', 'OVERDUE'].includes(b.status as any),
    ).length;
    const activeSlipsCount = member.borrowingSlips
      .filter((s) => ['BORROWED', 'PARTIAL_RETURNED'].includes(s.status as any))
      .reduce((sum, s) => {
        const remaining = s.items
          .filter((it) => ['PENDING', 'BORROWING'].includes(it.status as any))
          .reduce((acc, it) => acc + (it.quantity - it.returnedQuantity - it.lostQuantity), 0);
        return sum + remaining;
      }, 0);

    const currentBorrowedCount = activeOldCount + activeSlipsCount;
    const remainingLimit = Math.max(0, member.maxBorrowLimit - currentBorrowedCount);

    if (requestedTotalQuantity > remainingLimit) {
      throw new BadRequestException(
        `Độc giả chỉ còn được phép mượn thêm tối đa ${remainingLimit} cuốn sách (yêu cầu mượn ${requestedTotalQuantity} cuốn)`,
      );
    }

    // 2. Kiểm tra tồn kho của từng cuốn sách
    const bookIds = consolidatedItems.map((i) => i.bookId);
    const books = await this.prisma.book.findMany({
      where: { id: { in: bookIds } },
    });

    if (books.length < bookIds.length || !bookIds.every((id) => books.some((b) => b.id === id))) {
      throw new NotFoundException('Một hoặc nhiều cuốn sách trong danh sách yêu cầu không tồn tại trong thư viện');
    }

    for (const item of consolidatedItems) {
      const book = books.find((b) => b.id === item.bookId)!;
      if (book.status === BookStatus.DISCONTINUED) {
        throw new BadRequestException(`Cuốn sách "${book.title}" đã ngừng lưu hành`);
      }
      if (book.copiesAvailable < item.quantity) {
        throw new ConflictException(
          `Sách "${book.title}" chỉ còn ${book.copiesAvailable} cuốn khả dụng trong kho, không đủ số lượng yêu cầu (${item.quantity})`,
        );
      }
    }

    // 3. Tạo phiếu mượn (Master - Detail)
    const durationDays = dto.expectedReturnDays ?? 14;
    const dueDate = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
    const count = await this.prisma.borrowingSlip.count();
    const slipNumber = `SLIP-${now.getFullYear()}-${(count + 1).toString().padStart(4, '0')}`;

    const createdSlip = await this.prisma.borrowingSlip.create({
      data: {
        slipNumber,
        memberId: member.id,
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
        items: {
          include: { book: true },
        },
      },
    });

    return this.mapSlipToEntity(createdSlip);
  }

  async approve(id: string, approvedBy = 'Librarian'): Promise<BorrowingSlipEntity> {
    const slip = await this.findOne(id);
    const now = new Date();

    if (slip.status !== BorrowingSlipStatus.PENDING_APPROVAL) {
      throw new ConflictException(
        `DOCUMENT_ALREADY_PROCESSED: Phiếu mượn này đang ở trạng thái "${slip.status}", không thể phê duyệt`,
      );
    }

    // Khóa tồn kho (Stock Lock & Concurrency Check)
    for (const item of slip.items) {
      const book = await this.prisma.book.findUnique({ where: { id: item.bookId } });
      if (!book || book.copiesAvailable < item.quantity) {
        throw new ConflictException(
          `OUT_OF_STOCK_RACE_CONDITION: Sách "${item.bookTitle}" không còn đủ số lượng khả dụng trong kho (${book?.copiesAvailable ?? 0} < ${item.quantity})`,
        );
      }
    }

    // Thực hiện trừ kho và chuyển trạng thái trong một Transaction
    const totalQty = slip.items.reduce((sum, it) => sum + it.quantity, 0);

    const [updatedSlip] = await this.prisma.$transaction([
      this.prisma.borrowingSlip.update({
        where: { id },
        data: {
          status: BorrowingSlipStatus.BORROWED,
          borrowDate: now,
          approvedAt: now,
          approvedBy,
          items: {
            updateMany: {
              where: { slipId: id },
              data: { status: BorrowingItemStatus.BORROWING },
            },
          },
        },
        include: {
          member: true,
          items: {
            include: { book: true },
          },
        },
      }),
      // Trừ kho từng cuốn sách
      ...slip.items.map((it) =>
        this.prisma.book.update({
          where: { id: it.bookId },
          data: {
            copiesAvailable: { decrement: it.quantity },
          },
        }),
      ),
      // Tăng số sách đang mượn của độc giả
      this.prisma.member.update({
        where: { id: slip.memberId },
        data: {
          currentBorrowedCount: { increment: totalQty },
        },
      }),
    ]);

    return this.mapSlipToEntity(updatedSlip);
  }

  async reject(id: string, dto: RejectBorrowingSlipDto): Promise<BorrowingSlipEntity> {
    const slip = await this.findOne(id);
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

  async cancel(id: string, dto: CancelBorrowingSlipDto): Promise<BorrowingSlipEntity> {
    const slip = await this.findOne(id);
    const now = new Date();

    if (['COMPLETED', 'REJECTED', 'CANCELLED'].includes(slip.status)) {
      throw new ConflictException(
        `DOCUMENT_ALREADY_PROCESSED: Không thể hủy phiếu mượn đã ở trạng thái "${slip.status}"`,
      );
    }

    // Nếu đã xuất kho mượn (BORROWED hoặc PARTIAL_RETURNED), cần hoàn lại số sách chưa trả vào kho
    if (['BORROWED', 'PARTIAL_RETURNED'].includes(slip.status)) {
      const activeItems = slip.items.filter(
        (it) => it.status === BorrowingItemStatus.PENDING || it.status === BorrowingItemStatus.BORROWING,
      );
      const remainingTotalQty = activeItems.reduce(
        (sum, it) => sum + (it.quantity - it.returnedQuantity - it.lostQuantity),
        0,
      );

      const [cancelled] = await this.prisma.$transaction([
        this.prisma.borrowingSlip.update({
          where: { id },
          data: {
            status: BorrowingSlipStatus.CANCELLED,
            cancelledAt: now,
            cancelReason: dto.reason.trim(),
            items: {
              updateMany: {
                where: {
                  slipId: id,
                  status: { in: [BorrowingItemStatus.PENDING, BorrowingItemStatus.BORROWING] },
                },
                data: { status: BorrowingItemStatus.CANCELLED },
              },
            },
          },
          include: { member: true, items: { include: { book: true } } },
        }),
        ...activeItems.map((it) =>
          this.prisma.book.update({
            where: { id: it.bookId },
            data: {
              copiesAvailable: { increment: it.quantity - it.returnedQuantity - it.lostQuantity },
            },
          }),
        ),
        this.prisma.member.update({
          where: { id: slip.memberId },
          data: {
            currentBorrowedCount: { decrement: remainingTotalQty },
          },
        }),
      ]);

      return this.mapSlipToEntity(cancelled);
    }

    // Nếu đang ở PENDING_APPROVAL thì chỉ đổi trạng thái
    const updated = await this.prisma.borrowingSlip.update({
      where: { id },
      data: {
        status: BorrowingSlipStatus.CANCELLED,
        cancelledAt: now,
        cancelReason: dto.reason.trim(),
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

  async returnItems(id: string, dto: ReturnSlipItemsDto): Promise<BorrowingSlipEntity> {
    const slip = await this.findOne(id);
    const now = new Date();

    if (!['BORROWED', 'PARTIAL_RETURNED'].includes(slip.status)) {
      throw new BadRequestException(
        `Chỉ có thể hoàn trả các phiếu mượn đang ở trạng thái BORROWED hoặc PARTIAL_RETURNED (hiện tại: ${slip.status})`,
      );
    }

    let batchFine = 0;
    let totalReturnedQty = 0;
    const itemUpdates: any[] = [];
    const bookStockUpdates: any[] = [];

    // Tính quá hạn nếu có
    const isOverdue = now > new Date(slip.dueDate);
    const daysLate = isOverdue
      ? Math.ceil((now.getTime() - new Date(slip.dueDate).getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    for (const reqItem of dto.items) {
      const item = slip.items.find((it) => it.id === reqItem.itemId);
      if (!item) {
        throw new NotFoundException(`Không tìm thấy dòng chi tiết sách với ID "${reqItem.itemId}" trong phiếu này`);
      }

      const remainingInItem = item.quantity - item.returnedQuantity - item.lostQuantity;
      if (remainingInItem <= 0) {
        throw new BadRequestException(`Sách "${item.bookTitle}" đã được hoàn tất trước đó`);
      }

      const processQty = Math.min(reqItem.quantity ?? 1, remainingInItem);
      totalReturnedQty += processQty;

      let itemFine = 0;
      if (daysLate > 0) {
        itemFine += daysLate * this.FINE_PER_DAY * processQty;
      }

      if (reqItem.returnCondition === ReturnCondition.LOST) {
        itemFine += item.bookPrice * processQty;
      }

      batchFine += itemFine;

      const newReturned =
        reqItem.returnCondition === ReturnCondition.GOOD
          ? item.returnedQuantity + processQty
          : item.returnedQuantity;
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

      itemUpdates.push(
        this.prisma.borrowingSlipItem.update({
          where: { id: item.id },
          data: {
            returnedQuantity: newReturned,
            lostQuantity: newLost,
            status: nextItemStatus,
            returnDate: now,
            returnCondition: reqItem.returnCondition,
            fineAmount: item.fineAmount + itemFine,
            notes: reqItem.notes ? reqItem.notes.trim() : item.notes,
          },
        }),
      );

      // Nếu sách trả nguyên vẹn thì hoàn lại kho
      if (reqItem.returnCondition === ReturnCondition.GOOD) {
        bookStockUpdates.push(
          this.prisma.book.update({
            where: { id: item.bookId },
            data: {
              copiesAvailable: { increment: processQty },
            },
          }),
        );
      }
    }

    // Kiểm tra xem sau đợt trả này toàn bộ phiếu đã xong chưa
    const allItemsResolved = slip.items.every((it) => {
      const match = dto.items.find((req) => req.itemId === it.id);
      if (match) {
        const remaining = it.quantity - it.returnedQuantity - it.lostQuantity;
        const processed = Math.min(match.quantity ?? 1, remaining);
        return it.returnedQuantity + it.lostQuantity + processed >= it.quantity;
      }
      return it.returnedQuantity + it.lostQuantity >= it.quantity;
    });

    const nextSlipStatus = allItemsResolved
      ? BorrowingSlipStatus.COMPLETED
      : BorrowingSlipStatus.PARTIAL_RETURNED;

    const [updatedSlip] = await this.prisma.$transaction([
      this.prisma.borrowingSlip.update({
        where: { id },
        data: {
          status: nextSlipStatus,
          totalFine: slip.totalFine + batchFine,
          finePaid: dto.isPaidNow ?? true,
          notes: dto.notes
            ? `${slip.notes ? slip.notes + ' | ' : ''}Trả sách ${now.toLocaleDateString('vi-VN')}: ${dto.notes.trim()}`
            : slip.notes,
        },
        include: {
          member: true,
          items: { include: { book: true } },
        },
      }),
      ...itemUpdates,
      ...bookStockUpdates,
      this.prisma.member.update({
        where: { id: slip.memberId },
        data: {
          currentBorrowedCount: { decrement: totalReturnedQty },
        },
      }),
    ]);

    return this.mapSlipToEntity(updatedSlip);
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
        notes: it.notes || undefined,
        createdAt: it.createdAt,
        updatedAt: it.updatedAt,
      })),
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    };
  }
}
