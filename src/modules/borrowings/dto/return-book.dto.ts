import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class ReturnBookDto {
  @ApiPropertyOptional({
    description: 'Ghi chú về tình trạng cuốn sách khi trả (nguyên vẹn, rách bìa, mất trang...)',
    example: 'Sách trả nguyên vẹn, giữ gìn tốt.',
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    description:
      'Độc giả có nộp tiền phạt ngay tại quầy hay không. Bỏ trống (mặc định false) nghĩa là khoản phạt được ghi nhận thành nợ, ' +
      'phiếu vẫn chuyển sang RETURNED nhưng finePaid = false và phải thanh toán sau qua POST /api/borrowings/:id/pay-fine',
    default: false,
    example: false,
  })
  @IsOptional()
  @IsBoolean({ message: 'Trạng thái nộp phạt phải là kiểu boolean (true/false)' })
  finePaid?: boolean;
}
