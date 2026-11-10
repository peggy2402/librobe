import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MemberStatus } from '../../common/enums/member-status.enum.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PrismaTx } from './book-stock.service.js';
import { LoanPolicyService } from './loan-policy.service.js';

const ACTIVE_BORROWING_STATUSES = ['BORROWED', 'OVERDUE'] as const;
const ACTIVE_SLIP_STATUSES = ['BORROWED', 'PARTIAL_RETURNED'] as const;
const ACTIVE_SLIP_ITEM_STATUSES = ['PENDING', 'BORROWING'] as const;

/** Lý do từ chối, dùng để test và để frontend hiển thị nhất quán. */
export enum BorrowBlockReason {
  CARD_NOT_ACTIVE = 'CARD_NOT_ACTIVE',
  CARD_EXPIRED = 'CARD_EXPIRED',
  HAS_OVERDUE = 'HAS_OVERDUE',
  UNPAID_FINE = 'UNPAID_FINE',
  LIMIT_EXCEEDED = 'LIMIT_EXCEEDED',
}

export interface MemberLoanState {
  memberId: string;
  cardNumber: string;
  fullName: string;
  status: MemberStatus;
  membershipExpiry: Date;
  maxBorrowLimit: number;
  /** Số sách đang giữ thực tế, cộng từ cả phiếu mượn lẻ và phiếu mượn ERP. */
  currentBorrowedCount: number;
  remainingBorrowLimit: number;
  totalUnpaidFine: number;
  overdueCount: number;
  hasOverdue: boolean;
  canBorrow: boolean;
  blockReason?: BorrowBlockReason;
  reasonIfNotAllowed?: string;
}

/**
 * Nguồn sự thật duy nhất cho câu hỏi "độc giả này có được mượn thêm không?".
 *
 * Code cũ có 3 bản sao của logic này: `BorrowingsService.borrowBook` (chỉ đếm
 * bảng `borrowings`), `BorrowingSlipsService.create` (đếm cả hai bảng) và
 * `MembersService.getDebtSummary` (đếm cả hai bảng + tiền phạt, nhưng chỉ là
 * endpoint đọc, không chặn được luồng ghi). Kết quả là luật "nợ phạt thì không
 * được mượn" chỉ tồn tại trên giấy. Giờ cả ba đều gọi vào đây.
 */
@Injectable()
export class LoanEligibilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: LoanPolicyService,
  ) {}

  /**
   * Tính trạng thái mượn/nợ của độc giả. Nhận `tx` để có thể chạy bên trong
   * transaction của luồng mượn sách, đảm bảo đọc nhất quán với lúc ghi.
   */
  async getMemberLoanState(
    memberId: string,
    client: PrismaTx = this.prisma,
    now: Date = new Date(),
  ): Promise<MemberLoanState> {
    const member = await client.member.findUnique({
      where: { id: memberId },
      include: {
        borrowings: {
          where: { status: { in: [...ACTIVE_BORROWING_STATUSES] } },
          select: { id: true, status: true, dueDate: true },
        },
        borrowingSlips: {
          where: { status: { in: [...ACTIVE_SLIP_STATUSES] } },
          select: {
            id: true,
            dueDate: true,
            items: {
              where: { status: { in: [...ACTIVE_SLIP_ITEM_STATUSES] } },
              select: { quantity: true, returnedQuantity: true, lostQuantity: true },
            },
          },
        },
      },
    });

    if (!member) {
      throw new NotFoundException(`Không tìm thấy độc giả với ID "${memberId}"`);
    }

    const activeLoanCount = member.borrowings.length;
    const activeSlipCount = member.borrowingSlips.reduce(
      (total, slip) =>
        total +
        slip.items.reduce(
          (sum, item) =>
            sum + Math.max(0, item.quantity - item.returnedQuantity - item.lostQuantity),
          0,
        ),
      0,
    );

    const currentBorrowedCount = activeLoanCount + activeSlipCount;
    const remainingBorrowLimit = Math.max(0, member.maxBorrowLimit - currentBorrowedCount);

    const overdueLoans = member.borrowings.filter(
      (loan) => loan.status === 'OVERDUE' || this.policy.isOverdue(loan.dueDate, now),
    );
    const overdueSlips = member.borrowingSlips.filter((slip) =>
      this.policy.isOverdue(slip.dueDate, now),
    );
    const overdueCount = overdueLoans.length + overdueSlips.length;

    const totalUnpaidFine = await this.getTotalUnpaidFine(memberId, client);

    const state: MemberLoanState = {
      memberId: member.id,
      cardNumber: member.cardNumber,
      fullName: member.fullName,
      status: member.status as MemberStatus,
      membershipExpiry: member.membershipExpiry,
      maxBorrowLimit: member.maxBorrowLimit,
      currentBorrowedCount,
      remainingBorrowLimit,
      totalUnpaidFine,
      overdueCount,
      hasOverdue: overdueCount > 0,
      canBorrow: true,
    };

    const block = this.resolveBlockReason(state, now);
    if (block) {
      state.canBorrow = false;
      state.blockReason = block.reason;
      state.reasonIfNotAllowed = block.message;
    }

    return state;
  }

  /** Tổng tiền phạt chưa thanh toán, cộng từ phiếu mượn lẻ và phiếu mượn ERP. */
  async getTotalUnpaidFine(memberId: string, client: PrismaTx = this.prisma): Promise<number> {
    const [loanFines, slipFines] = await Promise.all([
      client.borrowing.aggregate({
        where: { memberId, finePaid: false, fineAmount: { gt: 0 } },
        _sum: { fineAmount: true },
      }),
      client.borrowingSlip.aggregate({
        where: { memberId, finePaid: false, totalFine: { gt: 0 } },
        _sum: { totalFine: true },
      }),
    ]);

    return (loanFines._sum.fineAmount ?? 0) + (slipFines._sum.totalFine ?? 0);
  }

  /**
   * Chốt cửa trước khi ghi dữ liệu mượn. Ném lỗi nghiệp vụ 400 với thông điệp
   * rõ ràng thay vì để luồng đi tiếp rồi tạo phiếu mượn không hợp lệ.
   *
   * @param requestedQuantity số cuốn độc giả xin mượn thêm trong lần này
   */
  async assertCanBorrow(
    memberId: string,
    requestedQuantity: number,
    client: PrismaTx = this.prisma,
    now: Date = new Date(),
  ): Promise<MemberLoanState> {
    const state = await this.getMemberLoanState(memberId, client, now);

    if (!state.canBorrow && state.blockReason !== BorrowBlockReason.LIMIT_EXCEEDED) {
      throw new BadRequestException(state.reasonIfNotAllowed);
    }

    const quantity = Math.max(1, Math.trunc(requestedQuantity));
    if (quantity > state.remainingBorrowLimit) {
      throw new BadRequestException(
        `Vượt quá hạn mức mượn: độc giả "${state.fullName}" đang giữ ${state.currentBorrowedCount}/${state.maxBorrowLimit} cuốn, ` +
          `chỉ còn được mượn thêm ${state.remainingBorrowLimit} cuốn nhưng yêu cầu ${quantity} cuốn`,
      );
    }

    return state;
  }

  /**
   * Phiếu đặt trước còn hiệu lực của ĐỘC GIẢ KHÁC trên cùng cuốn sách.
   * Dùng cho chính sách "không gia hạn khi sách đang có người chờ".
   */
  async countActiveReservationsByOthers(
    bookId: string,
    memberId: string,
    client: PrismaTx = this.prisma,
    now: Date = new Date(),
  ): Promise<number> {
    return client.reservation.count({
      where: {
        bookId,
        memberId: { not: memberId },
        status: { in: ['PENDING', 'READY'] },
        OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
      },
    });
  }

  private resolveBlockReason(
    state: MemberLoanState,
    now: Date,
  ): { reason: BorrowBlockReason; message: string } | undefined {
    if (state.status !== MemberStatus.ACTIVE) {
      return {
        reason: BorrowBlockReason.CARD_NOT_ACTIVE,
        message: `Thẻ độc giả đang ở trạng thái "${state.status}". Không đủ điều kiện mượn sách`,
      };
    }

    if (new Date(state.membershipExpiry) < now) {
      return {
        reason: BorrowBlockReason.CARD_EXPIRED,
        message: 'Thẻ thư viện của độc giả đã hết hạn. Vui lòng gia hạn thẻ',
      };
    }

    if (this.policy.blockBorrowOnOverdue && state.hasOverdue) {
      return {
        reason: BorrowBlockReason.HAS_OVERDUE,
        message: `Độc giả đang có ${state.overdueCount} lượt mượn quá hạn chưa hoàn trả. Cần trả sách trước khi mượn tiếp`,
      };
    }

    if (this.policy.blockBorrowOnUnpaidFine && state.totalUnpaidFine > 0) {
      return {
        reason: BorrowBlockReason.UNPAID_FINE,
        message: `Độc giả còn nợ tiền phạt chưa thanh toán (${state.totalUnpaidFine.toLocaleString('vi-VN')} VNĐ). Cần thanh toán trước khi mượn tiếp`,
      };
    }

    if (state.remainingBorrowLimit <= 0) {
      return {
        reason: BorrowBlockReason.LIMIT_EXCEEDED,
        message: `Độc giả đã sử dụng hết hạn mức mượn (${state.maxBorrowLimit} cuốn)`,
      };
    }

    return undefined;
  }
}
