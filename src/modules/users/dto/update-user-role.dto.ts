import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { UserRole } from '../../../common/enums/user-role.enum.js';

export class UpdateUserRoleDto {
  @ApiProperty({
    description:
      'Vai trò mới của tài khoản. ADMIN: toàn quyền quản trị. LIBRARIAN: thủ thư, ' +
      'được phê duyệt phiếu mượn và quản lý kho sách/độc giả. MEMBER: độc giả thường.',
    enum: UserRole,
    example: UserRole.LIBRARIAN,
  })
  @IsEnum(UserRole, {
    message: 'Vai trò không hợp lệ (chọn ADMIN, LIBRARIAN hoặc MEMBER)',
  })
  role!: UserRole;
}
