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
    description: 'Độc giả đã thanh toán tiền phạt quá hạn hay chưa (nếu có phát sinh tiền phạt)',
    default: true,
    example: true,
  })
  @IsOptional()
  @IsBoolean({ message: 'Trạng thái nộp phạt phải là kiểu boolean (true/false)' })
  finePaid?: boolean = true;
}
