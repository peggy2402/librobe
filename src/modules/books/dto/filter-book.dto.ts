import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto.js';
import { BookStatus } from '../../../common/enums/book-status.enum.js';

export class FilterBookDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Lọc sách theo thể loại (ID thể loại)',
    example: 'cat-01',
  })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({
    description: 'Lọc sách theo tác giả (ID tác giả)',
    example: 'auth-01',
  })
  @IsOptional()
  @IsString()
  authorId?: string;

  @ApiPropertyOptional({
    description: 'Lọc sách theo trạng thái tồn kho',
    enum: BookStatus,
    example: BookStatus.AVAILABLE,
  })
  @IsOptional()
  @IsEnum(BookStatus)
  status?: BookStatus;

  @ApiPropertyOptional({
    description: 'Lọc sách theo năm xuất bản',
    example: 2020,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  publishYear?: number;
}
