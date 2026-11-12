import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class RenewLoanDto {
  @ApiPropertyOptional({
    description:
      'Số ngày muốn gia hạn thêm. Bỏ trống sẽ dùng cấu hình LOAN_RENEW_DAYS (mặc định 7 ngày), giới hạn trên theo LOAN_RENEW_MAX_DAYS (mặc định 14 ngày)',
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
    description: 'Lý do xin gia hạn mượn sách (được lưu vào lịch sử gia hạn)',
    example: 'Độc giả cần thêm thời gian để hoàn thành bài tập lớn môn công nghệ phần mềm.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Lý do gia hạn tối đa 500 ký tự' })
  notes?: string;

  @ApiPropertyOptional({
    description:
      'Không còn sử dụng: người gia hạn được lấy từ tài khoản đã xác thực (JWT)',
    deprecated: true,
    example: 'Thủ thư Lan',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Tên người gia hạn tối đa 100 ký tự' })
  renewedBy?: string;
}
