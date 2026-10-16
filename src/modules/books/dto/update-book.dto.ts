import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsInt, IsOptional, Min } from 'class-validator';
import { CreateBookDto } from './create-book.dto.js';

export class UpdateBookDto extends PartialType(CreateBookDto) {
  @ApiPropertyOptional({
    description: 'Số lượng bản in sẵn có (dành cho thủ thư kiểm kê điều chỉnh)',
    example: 5,
    minimum: 0,
  })
  @IsOptional()
  @IsInt({ message: 'Số lượng bản in có sẵn phải là số nguyên' })
  @Min(0, { message: 'Số lượng không được âm' })
  copiesAvailable?: number;
}
