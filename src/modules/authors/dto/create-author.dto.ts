import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateAuthorDto {
  @ApiProperty({
    description: 'Họ và tên tác giả',
    example: 'Haruki Murakami',
    maxLength: 150,
  })
  @IsNotEmpty({ message: 'Họ tên tác giả không được để trống' })
  @IsString({ message: 'Họ tên tác giả phải là chuỗi ký tự' })
  @MaxLength(150, { message: 'Họ tên tác giả không được vượt quá 150 ký tự' })
  name!: string;

  @ApiPropertyOptional({
    description: 'Tiểu sử tóm tắt về tác giả và sự nghiệp văn học',
    example: 'Nhà văn đương đại người Nhật Bản nổi tiếng với phong cách hiện thực huyền ảo và các tác phẩm như Rừng Na Uy, Biên Niên Ký Chim Vặn Dây Cót.',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString({ message: 'Tiểu sử phải là chuỗi ký tự' })
  @MaxLength(1000, { message: 'Tiểu sử không được vượt quá 1000 ký tự' })
  biography?: string;

  @ApiProperty({
    description: 'Quốc tịch của tác giả',
    example: 'Nhật Bản',
    maxLength: 100,
  })
  @IsNotEmpty({ message: 'Quốc tịch không được để trống' })
  @IsString({ message: 'Quốc tịch phải là chuỗi ký tự' })
  @MaxLength(100, { message: 'Quốc tịch không được vượt quá 100 ký tự' })
  nationality!: string;

  @ApiPropertyOptional({
    description: 'Năm sinh của tác giả',
    example: 1949,
    minimum: 1800,
    maximum: 2026,
  })
  @IsOptional()
  @IsInt({ message: 'Năm sinh phải là số nguyên' })
  @Min(1800, { message: 'Năm sinh phải từ năm 1800 trở về sau' })
  @Max(2026, { message: 'Năm sinh không hợp lệ' })
  birthYear?: number;
}
