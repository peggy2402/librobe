import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto.js';
import { BorrowingStatus } from '../../../common/enums/borrowing-status.enum.js';

export class FilterBorrowingDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Lọc phiếu mượn theo mã độc giả',
    example: 'mem-01',
  })
  @IsOptional()
  @IsString()
  memberId?: string;

  @ApiPropertyOptional({
    description: 'Lọc phiếu mượn theo mã cuốn sách',
    example: 'book-01',
  })
  @IsOptional()
  @IsString()
  bookId?: string;

  @ApiPropertyOptional({
    description: 'Lọc phiếu mượn theo trạng thái',
    enum: BorrowingStatus,
    example: BorrowingStatus.BORROWED,
  })
  @IsOptional()
  @IsEnum(BorrowingStatus)
  status?: BorrowingStatus;

  @ApiPropertyOptional({
    description: 'Chỉ lọc các phiếu mượn đã quá hạn',
    example: true,
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isOverdue?: boolean;
}
