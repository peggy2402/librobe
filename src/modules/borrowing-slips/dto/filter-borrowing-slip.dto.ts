import { ApiPropertyOptional } from '@nestjs/swagger';
import { BorrowingSlipStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto.js';

export class FilterBorrowingSlipDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Lọc theo ID độc giả',
    example: 'mem-01',
  })
  @IsOptional()
  @IsString()
  memberId?: string;

  @ApiPropertyOptional({
    description: 'Lọc theo trạng thái vòng đời phiếu',
    enum: BorrowingSlipStatus,
    example: BorrowingSlipStatus.PENDING_APPROVAL,
  })
  @IsOptional()
  @IsEnum(BorrowingSlipStatus, { message: 'Trạng thái phiếu mượn không hợp lệ' })
  status?: BorrowingSlipStatus;
}
