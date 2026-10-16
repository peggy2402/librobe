import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateCategoryDto {
  @ApiProperty({
    description: 'Tên thể loại sách',
    example: 'Tâm lý học ứng dụng',
    maxLength: 100,
  })
  @IsNotEmpty({ message: 'Tên thể loại không được để trống' })
  @IsString({ message: 'Tên thể loại phải là chuỗi ký tự' })
  @MaxLength(100, { message: 'Tên thể loại không được vượt quá 100 ký tự' })
  name!: string;

  @ApiPropertyOptional({
    description: 'Mô tả chi tiết về thể loại sách',
    example: 'Các đầu sách nghiên cứu về tâm lý con người, hành vi xã hội và tâm lý trị liệu.',
    maxLength: 500,
  })
  @IsOptional()
  @IsString({ message: 'Mô tả phải là chuỗi ký tự' })
  @MaxLength(500, { message: 'Mô tả không được vượt quá 500 ký tự' })
  description?: string;
}
