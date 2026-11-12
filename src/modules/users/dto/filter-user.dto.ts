import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto.js';
import { UserRole } from '../../../common/enums/user-role.enum.js';

export class FilterUserDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Lọc theo vai trò tài khoản',
    enum: UserRole,
    example: UserRole.LIBRARIAN,
  })
  @IsOptional()
  @IsEnum(UserRole, { message: 'Vai trò không hợp lệ' })
  role?: UserRole;

  @ApiPropertyOptional({
    description: 'Lọc theo trạng thái hoạt động của tài khoản',
    example: true,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  @IsBoolean({ message: 'Trạng thái hoạt động phải là true hoặc false' })
  isActive?: boolean;
}
