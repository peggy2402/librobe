import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelReservationDto {
  @ApiPropertyOptional({
    description: 'Lý do hủy phiếu đặt trước',
    example: 'Độc giả đã tìm được sách ở nguồn khác nên xin hủy giữ chỗ.',
  })
  @IsOptional()
  @IsString({ message: 'Lý do hủy phải là chuỗi ký tự' })
  @MaxLength(500, { message: 'Lý do hủy tối đa 500 ký tự' })
  reason?: string;
}
