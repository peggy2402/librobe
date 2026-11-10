export enum ReservationStatus {
  /** Đã ghi nhận yêu cầu, đang chờ sách được trả về kho */
  PENDING = 'PENDING',
  /** Sách đã có sẵn và đang được giữ riêng cho độc giả */
  READY = 'READY',
  /** Đã chuyển thành phiếu mượn thực tế */
  FULFILLED = 'FULFILLED',
  /** Độc giả hoặc thủ thư đã hủy yêu cầu */
  CANCELLED = 'CANCELLED',
  /** Hết thời gian giữ sách mà độc giả không đến nhận */
  EXPIRED = 'EXPIRED',
}

/** Các trạng thái được coi là "đặt trước còn hiệu lực" khi xét chặn gia hạn. */
export const ACTIVE_RESERVATION_STATUSES = [
  ReservationStatus.PENDING,
  ReservationStatus.READY,
] as const;
