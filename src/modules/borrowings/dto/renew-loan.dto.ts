import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class RenewLoanDto {
  @ApiPropertyOptional({
    description: 'Số ngày muốn gia hạn thêm (mặc định: 7 ngày, tối đa: 14 ngày)',
    default: 7,
    minimum: 1,
    maximum: 14,
    example: 7,
  })
  @IsOptional()
  @IsInt({ message: 'Số ngày gia hạn phải là số nguyên' })
  @Min(1, { message: 'Thời gian gia hạn tối thiểu 1 ngày' })
  @Max(14, { message: 'Mỗi lần gia hạn tối đa 14 ngày' })
  extraDays?: number = 7;

  @ApiPropertyOptional({
    description: 'Lý do xin gia hạn mượn sách',
    example: 'Độc giả cần thêm thời gian để hoàn thành bài tập lớn môn công nghệ phần mềm.',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
