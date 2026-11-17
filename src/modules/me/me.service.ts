import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BorrowingSlipStatus } from '@prisma/client';
import { PaginatedResponseDto } from '../../common/dto/pagination.dto.js';
import { BorrowingSlipsService, SlipActor } from '../borrowing-slips/borrowing-slips.service.js';
import { BorrowingSlipEntity } from '../borrowing-slips/entities/borrowing-slip.entity.js';
import { BorrowingsService } from '../borrowings/borrowings.service.js';
import { Borrowing } from '../borrowings/entities/borrowing.entity.js';
import { LoanEligibilityService } from '../loan-policy/loan-eligibility.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { Reservation } from '../reservations/entities/reservation.entity.js';
import { ReservationsService } from '../reservations/reservations.service.js';
import {
  CancelMyRequestDto,
  CreateMyBorrowingSlipDto,
  CreateMyReservationDto,
  FilterMySlipDto,
  RenewMyBorrowingSlipDto,
} from './dto/me-request.dto.js';

/** Người gọi, lấy từ JWT. `memberId` đã được `MemberCardGuard` bảo đảm tồn tại. */
export interface MeActor {
  id: string;
  email: string;
  memberId: string;
}

@Injectable()
export class MeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly slips: BorrowingSlipsService,
    private readonly borrowings: BorrowingsService,
    private readonly reservations: ReservationsService,
    private readonly eligibility: LoanEligibilityService,
  ) {}

  // ===========================================================================
  // Hồ sơ
  // ===========================================================================

  async getProfile(actor: MeActor) {
    const state = await this.eligibility.getMemberLoanState(actor.memberId);
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

  // ===========================================================================
  // Phiếu mượn ERP
  // ===========================================================================

  async listMySlips(
    actor: MeActor,
    filters: FilterMySlipDto,
  ): Promise<PaginatedResponseDto<BorrowingSlipEntity>> {
    // memberId bị ghi đè bằng giá trị từ JWT, không lấy từ query.
    return this.slips.findAll({ ...filters, memberId: actor.memberId });
  }

  async getMySlip(actor: MeActor, slipId: string): Promise<BorrowingSlipEntity> {
    await this.assertOwnsSlip(actor, slipId);
    return this.slips.findOne(slipId);
  }

  async createMySlip(
    actor: MeActor,
    dto: CreateMyBorrowingSlipDto,
  ): Promise<BorrowingSlipEntity> {
    return this.slips.create({
      memberId: actor.memberId,
      items: dto.items,
      expectedReturnDays: dto.expectedReturnDays,
      notes: dto.notes,
    });
  }

  /**
   * Độc giả chỉ được tự hủy phiếu CHƯA xuất kho. Phiếu đã duyệt nghĩa là sách
   * đã rời kệ, phải mang sách đến quầy để thủ thư xử lý trả, không thể hủy
   * đơn phương từ ứng dụng.
   */
  async cancelMySlip(
    actor: MeActor,
    slipId: string,
    dto: CancelMyRequestDto,
  ): Promise<BorrowingSlipEntity> {
    const slip = await this.assertOwnsSlip(actor, slipId);

    if (slip.status !== BorrowingSlipStatus.PENDING_APPROVAL) {
      throw new BadRequestException(
        `Chỉ tự hủy được phiếu đang chờ duyệt. Phiếu này đang ở trạng thái "${slip.status}", ` +
          'vui lòng liên hệ thủ thư để được xử lý',
      );
    }

    return this.slips.cancel(
      slipId,
      { reason: dto.reason?.trim() || 'Độc giả tự hủy qua ứng dụng' },
      this.toSlipActor(actor),
    );
  }

  async renewMySlip(
    actor: MeActor,
    slipId: string,
    dto: RenewMyBorrowingSlipDto,
  ): Promise<BorrowingSlipEntity> {
    await this.assertOwnsSlip(actor, slipId);

    // Toàn bộ luật gia hạn (chưa quá hạn, chưa hết lượt, không ai đặt trước)
    // do service nghiệp vụ quyết định — không nhân bản luật ở đây.
    return this.slips.renew(slipId, {
      extraDays: dto.extraDays,
      notes: dto.notes,
      renewedBy: actor.email,
    });
  }

  async getMySlipRenewals(actor: MeActor, slipId: string) {
    await this.assertOwnsSlip(actor, slipId);
    return this.slips.getRenewalHistory(slipId);
  }

  // ===========================================================================
  // Phiếu mượn lẻ (dữ liệu lịch sử)
  // ===========================================================================

  async listMyBorrowings(
    actor: MeActor,
    filters: FilterMySlipDto,
  ): Promise<PaginatedResponseDto<Borrowing>> {
    return this.borrowings.findAll({
      page: filters.page,
      limit: filters.limit,
      memberId: actor.memberId,
    });
  }

  // ===========================================================================
  // Khoản phạt
  // ===========================================================================

  /**
   * Tổng nợ phạt cộng từ cả hai luồng mượn, kèm danh sách chi tiết.
   */
  async getMyFines(actor: MeActor) {
    const [loans, slips] = await Promise.all([
      this.prisma.borrowing.findMany({
        where: { memberId: actor.memberId, finePaid: false, fineAmount: { gt: 0 } },
        include: { book: true },
        orderBy: { dueDate: 'asc' },
      }),
      this.prisma.borrowingSlip.findMany({
        where: { memberId: actor.memberId, finePaid: false, totalFine: { gt: 0 } },
        include: { items: { include: { book: true } } },
        orderBy: { dueDate: 'asc' },
      }),
    ]);

    const fromLoans = loans.reduce((sum, b) => sum + b.fineAmount, 0);
    const fromSlips = slips.reduce((sum, s) => sum + s.totalFine, 0);

    return {
      totalUnpaidFine: fromLoans + fromSlips,
      borrowingFines: loans.map((b) => ({
        borrowingId: b.id,
        transactionCode: b.transactionCode,
        bookTitle: b.book?.title ?? 'Chưa xác định',
        dueDate: b.dueDate,
        returnDate: b.returnDate ?? undefined,
        fineAmount: b.fineAmount,
        finePaid: b.finePaid,
        status: b.status,
      })),
      slipFines: slips.map((s) => ({
        slipId: s.id,
        slipNumber: s.slipNumber,
        dueDate: s.dueDate,
        totalFine: s.totalFine,
        finePaid: s.finePaid,
        status: s.status,
        books: s.items.map((i) => ({
          bookTitle: i.book?.title ?? 'Chưa xác định',
          lateFee: i.lateFee,
          compensationFee: i.compensationFee,
        })),
      })),
    };
  }

  // ===========================================================================
  // Đặt trước
  // ===========================================================================

  async listMyReservations(
    actor: MeActor,
    filters: FilterMySlipDto,
  ): Promise<PaginatedResponseDto<Reservation>> {
    return this.reservations.findAll({
      page: filters.page,
      limit: filters.limit,
      memberId: actor.memberId,
    });
  }

  async createMyReservation(
    actor: MeActor,
    dto: CreateMyReservationDto,
  ): Promise<Reservation> {
    return this.reservations.create({
      memberId: actor.memberId,
      bookId: dto.bookId,
      notes: dto.notes,
    });
  }

  async cancelMyReservation(
    actor: MeActor,
    reservationId: string,
    dto: CancelMyRequestDto,
  ): Promise<Reservation> {
    const row = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      select: { memberId: true },
    });

    // Không thuộc mình thì coi như không tồn tại, tránh tiết lộ phiếu của người khác.
    if (!row || row.memberId !== actor.memberId) {
      throw new NotFoundException(`Không tìm thấy phiếu đặt trước với ID "${reservationId}"`);
    }

    return this.reservations.cancel(reservationId, {
      reason: dto.reason?.trim() || 'Độc giả tự hủy qua ứng dụng',
    });
  }

  // ===========================================================================
  // Nội bộ
  // ===========================================================================

  /**
   * Trả về phiếu nếu thuộc người gọi, ngược lại ném 404.
   *
   * Dùng 404 thay vì 403: nếu trả 403 thì client biết được phiếu đó có tồn tại
   * trong hệ thống, là một dạng rò rỉ thông tin.
   */
  private async assertOwnsSlip(actor: MeActor, slipId: string) {
    const slip = await this.prisma.borrowingSlip.findUnique({
      where: { id: slipId },
      select: { id: true, memberId: true, status: true },
    });

    if (!slip || slip.memberId !== actor.memberId) {
      throw new NotFoundException(`Không tìm thấy phiếu mượn với ID "${slipId}"`);
    }

    return slip;
  }

  private toSlipActor(actor: MeActor): SlipActor {
    return { id: actor.id, email: actor.email };
  }
}
