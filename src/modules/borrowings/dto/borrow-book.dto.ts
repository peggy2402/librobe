import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

export class BorrowBookDto {
  @ApiProperty({
    description: 'Mã định danh của độc giả mượn sách',
    example: 'mem-01',
  })
  @IsNotEmpty({ message: 'Mã độc giả không được để trống' })
  @IsString({ message: 'Mã độc giả phải là chuỗi ký tự' })
  memberId!: string;

  @ApiProperty({
    description: 'Mã định danh của cuốn sách muốn mượn',
    example: 'book-01',
  })
  @IsNotEmpty({ message: 'Mã sách không được để trống' })
  @IsString({ message: 'Mã sách phải là chuỗi ký tự' })
  bookId!: string;

  @ApiPropertyOptional({
    description:
      'Thời hạn mượn sách (ngày). Bỏ trống sẽ dùng cấu hình LOAN_DEFAULT_DAYS (mặc định 14 ngày); ' +
      'vượt quá LOAN_MAX_DAYS (mặc định 30 ngày) sẽ bị từ chối',
    default: 14,
    minimum: 1,
    maximum: 365,
    example: 14,
  })
  @IsOptional()
  @IsInt({ message: 'Số ngày mượn phải là số nguyên' })
  @Min(1, { message: 'Thời hạn mượn tối thiểu là 1 ngày' })
  @Max(365, { message: 'Thời hạn mượn yêu cầu không hợp lệ' })
  durationDays?: number;

  @ApiPropertyOptional({
    description: 'Ghi chú thêm của thủ thư hoặc độc giả khi tạo phiếu mượn',
    example: 'Độc giả mượn làm tài liệu tham khảo cho đề tài tốt nghiệp.',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
