import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Một dòng lịch sử gia hạn (audit trail). Dùng chung cho phiếu mượn lẻ
 * (`borrowingId`) và phiếu mượn ERP master-detail (`slipId`).
 */
export class LoanRenewalHistory {
  @ApiProperty({ description: 'Mã định danh bản ghi lịch sử gia hạn' })
  id!: string;

  @ApiPropertyOptional({ description: 'ID phiếu mượn lẻ được gia hạn', example: 'brw-01' })
  borrowingId?: string;

  @ApiPropertyOptional({ description: 'ID phiếu mượn ERP được gia hạn', example: 'slip-01' })
  slipId?: string;

  @ApiProperty({ description: 'Lần gia hạn thứ mấy của lượt mượn', example: 1 })
  sequence!: number;

  @ApiProperty({
    description: 'Hạn trả trước khi gia hạn',
    example: '2026-11-12T08:00:00.000Z',
  })
  previousDueDate!: Date;

  @ApiProperty({
    description: 'Hạn trả sau khi gia hạn',
    example: '2026-11-19T08:00:00.000Z',
  })
  newDueDate!: Date;

  @ApiProperty({ description: 'Số ngày được gia hạn thêm', example: 7 })
  extraDays!: number;

  @ApiProperty({ description: 'Thời điểm thực hiện gia hạn' })
  renewedAt!: Date;

  @ApiPropertyOptional({ description: 'Người thực hiện gia hạn', example: 'Thủ thư Lan' })
  renewedBy?: string;

  @ApiPropertyOptional({
    description: 'Lý do gia hạn',
    example: 'Độc giả cần thêm thời gian hoàn thành bài tập lớn.',
  })
  reason?: string;
}
