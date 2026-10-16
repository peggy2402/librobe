import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class PaginationDto {
  @ApiPropertyOptional({
    description: 'Số trang hiện tại (bắt đầu từ 1)',
    default: 1,
    minimum: 1,
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({
    description: 'Số lượng mục trên mỗi trang',
    default: 10,
    minimum: 1,
    maximum: 100,
    example: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 10;

  @ApiPropertyOptional({
    description: 'Từ khóa tìm kiếm (hỗ trợ tìm kiếm theo tiêu đề, tên, mã số, v.v.)',
    example: 'Harry Potter',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Trường dùng để sắp xếp',
    example: 'createdAt',
  })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({
    description: 'Thứ tự sắp xếp: ASC (tăng dần) hoặc DESC (giảm dần)',
    enum: ['ASC', 'DESC'],
    default: 'DESC',
    example: 'DESC',
  })
  @IsOptional()
  @IsString()
  sortOrder: 'ASC' | 'DESC' = 'DESC';
}

export class PaginatedResultMeta {
  @ApiPropertyOptional({ example: 1 })
  page!: number;

  @ApiPropertyOptional({ example: 10 })
  limit!: number;

  @ApiPropertyOptional({ example: 25 })
  totalItems!: number;

  @ApiPropertyOptional({ example: 3 })
  totalPages!: number;

  @ApiPropertyOptional({ example: true })
  hasNextPage!: boolean;

  @ApiPropertyOptional({ example: false })
  hasPreviousPage!: boolean;
}

export class PaginatedResponseDto<T> {
  data!: T[];
  meta!: PaginatedResultMeta;
}
