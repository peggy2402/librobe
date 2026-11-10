import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReservationStatus } from '../../../common/enums/reservation-status.enum.js';

export class Reservation {
  @ApiProperty({ description: 'Mã định danh phiếu đặt trước', example: 'rsv-01' })
  id!: string;

  @ApiProperty({ description: 'Số phiếu đặt trước', example: 'RSV-2026-0001' })
  reservationCode!: string;

  @ApiProperty({ description: 'ID độc giả đặt trước', example: 'mem-02' })
  memberId!: string;

  @ApiProperty({ description: 'Tên độc giả đặt trước', example: 'Trần Thị Bình' })
  memberName!: string;

  @ApiProperty({ description: 'ID cuốn sách được đặt trước', example: 'book-01' })
  bookId!: string;

  @ApiProperty({ description: 'Tựa đề cuốn sách được đặt trước', example: 'Clean Code' })
  bookTitle!: string;

  @ApiProperty({
    description: 'Trạng thái phiếu đặt trước',
    enum: ReservationStatus,
    example: ReservationStatus.PENDING,
  })
  status!: ReservationStatus;

  @ApiProperty({ description: 'Thời điểm đặt trước', example: '2026-11-10T08:00:00.000Z' })
  reservedAt!: Date;

  @ApiPropertyOptional({
    description: 'Hạn cuối độc giả phải đến nhận sách (chỉ có khi phiếu ở trạng thái READY)',
    example: '2026-11-15T08:00:00.000Z',
  })
  expiresAt?: Date;

  @ApiPropertyOptional({ description: 'Thời điểm sách được giữ sẵn cho độc giả' })
  readyAt?: Date;

  @ApiPropertyOptional({ description: 'Thời điểm phiếu được chuyển thành phiếu mượn' })
  fulfilledAt?: Date;

  @ApiPropertyOptional({ description: 'Thời điểm phiếu bị hủy' })
  cancelledAt?: Date;

  @ApiPropertyOptional({ description: 'Lý do hủy phiếu' })
  cancelReason?: string;

  @ApiPropertyOptional({ description: 'Ghi chú' })
  notes?: string;

  @ApiProperty({ description: 'Thời điểm tạo bản ghi' })
  createdAt!: Date;

  @ApiProperty({ description: 'Thời điểm cập nhật gần nhất' })
  updatedAt!: Date;
}
