import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { MemberStatus } from '../../../common/enums/member-status.enum.js';
import { CreateMemberDto } from './create-member.dto.js';

export class UpdateMemberDto extends PartialType(CreateMemberDto) {
  @ApiPropertyOptional({
    description: 'Trạng thái hoạt động của thẻ độc giả',
    enum: MemberStatus,
    example: MemberStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(MemberStatus, { message: 'Trạng thái thẻ độc giả không hợp lệ' })
  status?: MemberStatus;

  @ApiPropertyOptional({
    description: 'Ngày hết hạn mới của thẻ độc giả (ISO 8601)',
    example: '2028-01-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString({}, { message: 'Ngày hết hạn thẻ phải đúng chuẩn định dạng ngày' })
  membershipExpiry?: string;
}
