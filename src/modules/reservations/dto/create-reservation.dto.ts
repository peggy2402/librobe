import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateReservationDto {
  @ApiProperty({
    description: 'Mã định danh của độc giả đặt trước sách',
    example: 'mem-01',
  })
  @IsNotEmpty({ message: 'Mã độc giả không được để trống' })
  @IsString({ message: 'Mã độc giả phải là chuỗi ký tự' })
  memberId!: string;

  @ApiProperty({
    description: 'Mã định danh của cuốn sách muốn đặt trước',
    example: 'book-01',
  })
  @IsNotEmpty({ message: 'Mã sách không được để trống' })
  @IsString({ message: 'Mã sách phải là chuỗi ký tự' })
  bookId!: string;

  @ApiPropertyOptional({
    description: 'Ghi chú của độc giả hoặc thủ thư khi đặt trước',
    example: 'Độc giả cần sách cho kỳ thi cuối khóa, ưu tiên giữ ngay khi có bản trả về.',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
