import { Injectable, Logger } from '@nestjs/common';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Tập trung toàn bộ tham số nghiệp vụ mượn/trả/gia hạn/phạt vào một chỗ duy nhất.
 *
 * Trước đây các con số này bị hardcode rải rác (FINE_PER_DAY = 5000 lặp ở 2 service,
 * `dto.durationDays ?? 14`, `MAX_RENEWS = 2`, `extraDays ?? 7`), dẫn tới hai luồng
 * mượn sách áp dụng chính sách lệch nhau. Toàn bộ giá trị giờ đọc từ biến môi
 * trường và có giá trị mặc định an toàn, nên đổi chính sách không cần sửa code.
 */
@Injectable()
export class LoanPolicyService {
  private readonly logger = new Logger(LoanPolicyService.name);

  /** Thời hạn mượn mặc định (ngày) khi request không truyền durationDays. */
  readonly defaultLoanDays = this.readInt('LOAN_DEFAULT_DAYS', 14, 1, 365);

  /** Thời hạn mượn tối đa thủ thư được phép cấp cho một lượt mượn. */
  readonly maxLoanDays = this.readInt('LOAN_MAX_DAYS', 30, 1, 365);

  /** Mức phạt trễ hạn: VNĐ / ngày / cuốn. */
  readonly finePerDayPerBook = this.readInt('LOAN_FINE_PER_DAY', 5000, 0, 10_000_000);

  /** Số ngày ân hạn không tính phạt sau dueDate (0 = tính phạt ngay ngày đầu trễ). */
  readonly fineGraceDays = this.readInt('LOAN_FINE_GRACE_DAYS', 0, 0, 30);

  /** Số lần gia hạn tối đa cho mỗi lượt mượn. */
  readonly maxRenewCount = this.readInt('LOAN_RENEW_MAX_COUNT', 1, 0, 10);

  /** Số ngày cộng thêm mặc định cho mỗi lần gia hạn. */
  readonly defaultRenewDays = this.readInt('LOAN_RENEW_DAYS', 7, 1, 90);

  /** Số ngày gia hạn tối đa cho mỗi lần gia hạn. */
  readonly maxRenewDays = this.readInt('LOAN_RENEW_MAX_DAYS', 14, 1, 90);

  /**
   * Chỉ cho phép gia hạn khi còn tối đa N ngày tới hạn trả
   * (0 = cho gia hạn bất cứ lúc nào miễn chưa quá hạn).
   */
  readonly renewWindowDays = this.readInt('LOAN_RENEW_WINDOW_DAYS', 0, 0, 365);

  /** Chặn gia hạn khi cuốn sách đang có độc giả khác đặt trước hợp lệ. */
  readonly blockRenewWhenReserved = this.readBool('LOAN_RENEW_BLOCK_WHEN_RESERVED', true);

  /** Chặn mượn mới khi độc giả còn nợ tiền phạt chưa thanh toán. */
  readonly blockBorrowOnUnpaidFine = this.readBool('LOAN_BLOCK_BORROW_ON_UNPAID_FINE', true);

  /** Chặn mượn mới khi độc giả đang có sách quá hạn chưa trả. */
  readonly blockBorrowOnOverdue = this.readBool('LOAN_BLOCK_BORROW_ON_OVERDUE', true);

  /** Hạn mức mượn mặc định khi tạo thẻ độc giả mới. */
  readonly defaultMaxBorrowLimit = this.readInt('MEMBER_DEFAULT_BORROW_LIMIT', 5, 1, 100);

  /** Số ngày giữ sách cho độc giả đặt trước kể từ lúc phiếu chuyển sang READY. */
  readonly reservationHoldDays = this.readInt('RESERVATION_HOLD_DAYS', 3, 1, 60);

  /** Số phiếu đặt trước đang hoạt động tối đa của một độc giả. */
  readonly maxActiveReservations = this.readInt('RESERVATION_MAX_ACTIVE', 3, 1, 50);

  /**
   * Số ngày quá hạn, tính theo mốc đầu ngày để tránh lỗi "trễ 1 phút = phạt 1 ngày"
   * của cách làm cũ (`Math.ceil` trên hiệu milli-giây).
   */
  countOverdueDays(dueDate: Date | string, actualDate: Date | string = new Date()): number {
    const due = this.startOfDay(dueDate);
    const actual = this.startOfDay(actualDate);
    const rawDays = Math.floor((actual.getTime() - due.getTime()) / MS_PER_DAY);
    return Math.max(0, rawDays - this.fineGraceDays);
  }

  /**
   * Tiền phạt trễ hạn = Số ngày quá hạn × Mức phạt mỗi ngày × Số lượng sách quá hạn.
   */
  calculateLateFee(
    dueDate: Date | string,
    actualDate: Date | string = new Date(),
    quantity = 1,
  ): number {
    const safeQuantity = Math.max(0, Math.trunc(quantity));
    return this.countOverdueDays(dueDate, actualDate) * this.finePerDayPerBook * safeQuantity;
  }

  /** Hạn trả = ngày mượn + số ngày mượn (đã kẹp trong khoảng cho phép). */
  resolveDueDate(borrowDate: Date, requestedDays?: number): Date {
    const days = this.resolveLoanDays(requestedDays);
    return new Date(borrowDate.getTime() + days * MS_PER_DAY);
  }

  resolveLoanDays(requestedDays?: number): number {
    const days = requestedDays ?? this.defaultLoanDays;
    return Math.min(Math.max(1, Math.trunc(days)), this.maxLoanDays);
  }

  resolveRenewDays(requestedDays?: number): number {
    const days = requestedDays ?? this.defaultRenewDays;
    return Math.min(Math.max(1, Math.trunc(days)), this.maxRenewDays);
  }

  /** Hạn giữ sách cho phiếu đặt trước khi sách về kho. */
  resolveReservationExpiry(readyAt: Date): Date {
    return new Date(readyAt.getTime() + this.reservationHoldDays * MS_PER_DAY);
  }

  isOverdue(dueDate: Date | string, actualDate: Date | string = new Date()): boolean {
    return this.countOverdueDays(dueDate, actualDate) > 0;
  }

  /** Chuẩn hóa về 00:00:00 để so sánh theo đơn vị ngày. */
  private startOfDay(value: Date | string): Date {
    const date = new Date(value);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  private readInt(key: string, fallback: number, min: number, max: number): number {
    const raw = process.env[key];
    if (raw === undefined || raw.trim() === '') {
      return fallback;
    }

    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < min || parsed > max) {
      this.logger.warn(
        `Biến môi trường ${key}="${raw}" không hợp lệ (cần số nguyên trong [${min}, ${max}]). Dùng giá trị mặc định ${fallback}`,
      );
      return fallback;
    }

    return parsed;
  }

  private readBool(key: string, fallback: boolean): boolean {
    const raw = process.env[key];
    if (raw === undefined || raw.trim() === '') {
      return fallback;
    }

    const normalized = raw.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'off'].includes(normalized)) {
      return false;
    }

    this.logger.warn(
      `Biến môi trường ${key}="${raw}" không hợp lệ (cần true/false). Dùng giá trị mặc định ${fallback}`,
    );
    return fallback;
  }
}
