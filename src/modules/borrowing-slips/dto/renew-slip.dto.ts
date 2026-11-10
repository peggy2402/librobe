import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class RenewSlipDto {
  @ApiPropertyOptional({
    description:
      'Số ngày muốn gia hạn thêm cho cả phiếu. Bỏ trống sẽ dùng cấu hình LOAN_RENEW_DAYS (mặc định 7 ngày)',
    default: 7,
    minimum: 1,
    maximum: 90,
    example: 7,
  })
  @IsOptional()
  @IsInt({ message: 'Số ngày gia hạn phải là số nguyên' })
  @Min(1, { message: 'Thời gian gia hạn tối thiểu 1 ngày' })
  @Max(90, { message: 'Số ngày gia hạn yêu cầu không hợp lệ' })
  extraDays?: number;

  @ApiPropertyOptional({
    description: 'Lý do gia hạn, được lưu vào lịch sử gia hạn',
    example: 'Độc giả xin thêm thời gian hoàn thành đồ án.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Lý do gia hạn tối đa 500 ký tự' })
  notes?: string;

  @ApiPropertyOptional({
    description: 'Thủ thư thực hiện gia hạn (phục vụ audit)',
    example: 'Thủ thư Lan',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Tên người gia hạn tối đa 100 ký tự' })
  renewedBy?: string;
}
