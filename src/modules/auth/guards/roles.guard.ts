import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../../../common/enums/user-role.enum.js';
import { ROLES_METADATA_KEY } from '../decorators/roles.decorator.js';

/**
 * Kiểm tra vai trò của tài khoản đang đăng nhập.
 *
 * Trước đây hệ thống chỉ có `JwtAuthGuard` — xác minh token hợp lệ, tài khoản
 * tồn tại và đang hoạt động — nhưng KHÔNG hề xét `role`. Hệ quả là một tài
 * khoản `MEMBER` vẫn phê duyệt được phiếu mượn (kể cả phiếu của chính mình),
 * xóa được sách, sửa được hồ sơ độc giả. Guard này bịt lỗ hổng đó.
 *
 * Nguyên tắc: không có `@Roles(...)` thì mặc định cho qua, để các endpoint đọc
 * và các thao tác tự phục vụ của độc giả không bị ảnh hưởng.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[] | undefined>(
      ROLES_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const user = context.switchToHttp().getRequest<{ user?: { role?: UserRole } }>().user;

    // Trường hợp này chỉ xảy ra nếu quên đặt JwtAuthGuard trước RolesGuard.
    if (!user) {
      throw new ForbiddenException('Không xác định được tài khoản thực hiện yêu cầu');
    }

    if (!user.role || !requiredRoles.includes(user.role)) {
      throw new ForbiddenException(
        `Chức năng này chỉ dành cho ${requiredRoles.join(' hoặc ')}. ` +
          `Tài khoản của bạn đang có vai trò ${user.role ?? 'không xác định'}`,
      );
    }

    return true;
  }
}
