import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaginatedResponseDto } from '../../common/dto/pagination.dto.js';
import { BookStatus } from '../../common/enums/book-status.enum.js';
import { MemberStatus } from '../../common/enums/member-status.enum.js';
import {
  ACTIVE_RESERVATION_STATUSES,
  ReservationStatus,
} from '../../common/enums/reservation-status.enum.js';
import { PrismaTx } from '../loan-policy/book-stock.service.js';
import { LoanPolicyService } from '../loan-policy/loan-policy.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CancelReservationDto } from './dto/cancel-reservation.dto.js';
import { CreateReservationDto } from './dto/create-reservation.dto.js';
import { FilterReservationDto } from './dto/filter-reservation.dto.js';
import { Reservation } from './entities/reservation.entity.js';

/**
 * Nghiệp vụ đặt trước (giữ chỗ) sách.
 *
 * Trước đây hệ thống không có khái niệm đặt trước, nên yêu cầu
 * "không cho gia hạn khi có độc giả khác đã đặt trước" là bất khả thi.
 * Module này cung cấp dữ liệu đó cho luồng gia hạn ở `BorrowingsService`
 * và `BorrowingSlipsService`.
 */
@Injectable()
export class ReservationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: LoanPolicyService,
  ) {}

  async findAll(filters: FilterReservationDto): Promise<PaginatedResponseDto<Reservation>> {
    await this.expireStaleReservations();

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

    if (filters.search) {
      const term = filters.search.trim();
      where.OR = [
        { reservationCode: { contains: term, mode: 'insensitive' } },
        { member: { fullName: { contains: term, mode: 'insensitive' } } },
        { book: { title: { contains: term, mode: 'insensitive' } } },
      ];
    }

    const [totalItems, reservations] = await Promise.all([
      this.prisma.reservation.count({ where }),
      this.prisma.reservation.findMany({
        where,
        skip,
        take: limit,
        include: { member: true, book: true },
        orderBy: filters.sortBy
          ? { [filters.sortBy]: (filters.sortOrder ?? 'DESC').toLowerCase() }
          : { reservedAt: 'asc' },
      }),
    ]);

    const totalPages = Math.ceil(totalItems / limit) || 1;

    return {
      data: reservations.map((r) => this.mapToEntity(r)),
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

  async findOne(id: string): Promise<Reservation> {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id },
      include: { member: true, book: true },
    });

    if (!reservation) {
      throw new NotFoundException(`Không tìm thấy phiếu đặt trước với ID "${id}"`);
    }

    return this.mapToEntity(reservation);
  }

  /**
   * Hàng đợi đặt trước của một cuốn sách, sắp xếp theo thứ tự đăng ký.
   * Dùng cho thủ thư khi quyết định cho gia hạn hay thu hồi sách.
   */
  async findQueueByBook(bookId: string): Promise<Reservation[]> {
    await this.expireStaleReservations();

    const book = await this.prisma.book.findUnique({ where: { id: bookId } });
    if (!book) {
      throw new NotFoundException(`Không tìm thấy cuốn sách với ID "${bookId}"`);
    }

    const queue = await this.prisma.reservation.findMany({
      where: { bookId, status: { in: [...ACTIVE_RESERVATION_STATUSES] } },
      include: { member: true, book: true },
      orderBy: { reservedAt: 'asc' },
    });

    return queue.map((r) => this.mapToEntity(r));
  }

  async create(dto: CreateReservationDto): Promise<Reservation> {
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const member = await tx.member.findUnique({ where: { id: dto.memberId } });
      if (!member) {
        throw new NotFoundException(`Không tìm thấy độc giả với ID "${dto.memberId}"`);
      }

      if (member.status !== MemberStatus.ACTIVE) {
        throw new BadRequestException(
          `Thẻ độc giả đang ở trạng thái "${member.status}". Không đủ điều kiện đặt trước sách`,
        );
      }

      if (new Date(member.membershipExpiry) < now) {
        throw new BadRequestException('Thẻ thư viện của độc giả đã hết hạn. Vui lòng gia hạn thẻ');
      }

      const book = await tx.book.findUnique({ where: { id: dto.bookId } });
      if (!book) {
        throw new NotFoundException(`Không tìm thấy cuốn sách với ID "${dto.bookId}"`);
      }

      if (book.status === BookStatus.DISCONTINUED) {
        throw new BadRequestException('Cuốn sách này đã ngừng lưu hành, không thể đặt trước');
      }

      const duplicate = await tx.reservation.findFirst({
        where: {
          memberId: dto.memberId,
          bookId: dto.bookId,
          status: { in: [...ACTIVE_RESERVATION_STATUSES] },
        },
      });
      if (duplicate) {
        throw new ConflictException(
          `Độc giả đã có phiếu đặt trước còn hiệu lực cho cuốn sách "${book.title}" (${duplicate.reservationCode})`,
        );
      }

      const activeCount = await tx.reservation.count({
        where: { memberId: dto.memberId, status: { in: [...ACTIVE_RESERVATION_STATUSES] } },
      });
      if (activeCount >= this.policy.maxActiveReservations) {
        throw new BadRequestException(
          `Độc giả đã đạt số phiếu đặt trước tối đa (${this.policy.maxActiveReservations} phiếu đang chờ)`,
        );
      }

      // Sách còn trên kệ thì giữ ngay cho độc giả, ngược lại xếp vào hàng đợi.
      const isAvailableNow = book.copiesAvailable > 0;
      const reservationCode = await this.nextReservationCode(tx, now);

      const created = await tx.reservation.create({
        data: {
          reservationCode,
          memberId: member.id,
          bookId: book.id,
          status: isAvailableNow ? ReservationStatus.READY : ReservationStatus.PENDING,
          reservedAt: now,
          readyAt: isAvailableNow ? now : null,
          expiresAt: isAvailableNow ? this.policy.resolveReservationExpiry(now) : null,
          notes: dto.notes?.trim() || null,
        },
        include: { member: true, book: true },
      });

      return this.mapToEntity(created);
    });
  }

  async cancel(id: string, dto: CancelReservationDto): Promise<Reservation> {
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const reservation = await tx.reservation.findUnique({ where: { id } });
      if (!reservation) {
        throw new NotFoundException(`Không tìm thấy phiếu đặt trước với ID "${id}"`);
      }

      if (!(ACTIVE_RESERVATION_STATUSES as readonly string[]).includes(reservation.status)) {
        throw new ConflictException(
          `Phiếu đặt trước đang ở trạng thái "${reservation.status}", không thể hủy`,
        );
      }

      const updated = await tx.reservation.update({
        where: { id },
        data: {
          status: ReservationStatus.CANCELLED,
          cancelledAt: now,
          cancelReason: dto.reason?.trim() || 'Hủy theo yêu cầu',
        },
        include: { member: true, book: true },
      });

      return this.mapToEntity(updated);
    });
  }

  /**
   * Đánh dấu phiếu đặt trước đã được chuyển thành phiếu mượn.
   * Được gọi từ luồng mượn sách để hàng đợi không chặn chính độc giả đã đặt.
   */
  async fulfillForBorrow(
    tx: PrismaTx,
    memberId: string,
    bookId: string,
    now: Date = new Date(),
  ): Promise<void> {
    await tx.reservation.updateMany({
      where: {
        memberId,
        bookId,
        status: { in: [...ACTIVE_RESERVATION_STATUSES] },
      },
      data: { status: ReservationStatus.FULFILLED, fulfilledAt: now },
    });
  }

  /**
   * Khi sách được trả về kho, phiếu đặt trước đầu hàng đợi được chuyển sang
   * READY kèm hạn nhận sách. Chạy trong transaction của luồng trả sách.
   */
  async promoteQueueAfterReturn(
    tx: PrismaTx,
    bookId: string,
    availableCopies: number,
    now: Date = new Date(),
  ): Promise<number> {
    if (availableCopies <= 0) {
      return 0;
    }

    const pending = await tx.reservation.findMany({
      where: { bookId, status: ReservationStatus.PENDING },
      orderBy: { reservedAt: 'asc' },
      take: availableCopies,
      select: { id: true },
    });

    if (pending.length === 0) {
      return 0;
    }

    await tx.reservation.updateMany({
      where: { id: { in: pending.map((p) => p.id) } },
      data: {
        status: ReservationStatus.READY,
        readyAt: now,
        expiresAt: this.policy.resolveReservationExpiry(now),
      },
    });

    return pending.length;
  }

  /** Dọn các phiếu READY đã hết hạn nhận sách. */
  async expireStaleReservations(now: Date = new Date()): Promise<number> {
    const result = await this.prisma.reservation.updateMany({
      where: {
        status: ReservationStatus.READY,
        expiresAt: { lt: now },
      },
      data: { status: ReservationStatus.EXPIRED },
    });

    return result.count;
  }

  private async nextReservationCode(tx: PrismaTx, now: Date): Promise<string> {
    const year = now.getFullYear();
    const prefix = `RSV-${year}-`;

    const last = await tx.reservation.findFirst({
      where: { reservationCode: { startsWith: prefix } },
      orderBy: { reservationCode: 'desc' },
      select: { reservationCode: true },
    });

    const lastSequence = last ? Number.parseInt(last.reservationCode.slice(prefix.length), 10) : 0;
    const nextSequence = Number.isFinite(lastSequence) ? lastSequence + 1 : 1;

    return `${prefix}${nextSequence.toString().padStart(4, '0')}`;
  }

  private mapToEntity(r: any): Reservation {
    return {
      id: r.id,
      reservationCode: r.reservationCode,
      memberId: r.memberId,
      memberName: r.member?.fullName || 'Chưa xác định',
      bookId: r.bookId,
      bookTitle: r.book?.title || 'Chưa xác định',
      status: r.status as ReservationStatus,
      reservedAt: r.reservedAt,
      expiresAt: r.expiresAt || undefined,
      readyAt: r.readyAt || undefined,
      fulfilledAt: r.fulfilledAt || undefined,
      cancelledAt: r.cancelledAt || undefined,
      cancelReason: r.cancelReason || undefined,
      notes: r.notes || undefined,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }
}
