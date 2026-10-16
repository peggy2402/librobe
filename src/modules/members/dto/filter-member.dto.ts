import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto.js';
import { MemberStatus } from '../../../common/enums/member-status.enum.js';

export class FilterMemberDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Lọc theo trạng thái thẻ độc giả',
    enum: MemberStatus,
    example: MemberStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(MemberStatus)
  status?: MemberStatus;

  @ApiPropertyOptional({
    description: 'Tìm kiếm chính xác theo số thẻ độc giả',
    example: 'LIB-2026-0001',
  })
  @IsOptional()
  @IsString()
  cardNumber?: string;
}
