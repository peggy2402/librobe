import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../../../common/enums/user-role.enum.js';

export const ROLES_METADATA_KEY = 'librobe:required-roles';

/**
 * Giới hạn endpoint cho một số vai trò nhất định.
 *
 * Dùng kèm `RolesGuard` và PHẢI đặt sau `JwtAuthGuard` trong `@UseGuards`,
 * vì `RolesGuard` đọc `request.user` do `JwtAuthGuard` gán vào.
 *
 * Endpoint không có decorator này thì mọi tài khoản đã đăng nhập đều gọi được.
 *
 * @example
 * ```ts
 * @Roles(UserRole.ADMIN, UserRole.LIBRARIAN)
 * @Patch(':id/approve')
 * approve() { ... }
 * ```
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_METADATA_KEY, roles);
