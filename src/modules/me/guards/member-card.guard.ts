import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

/**
 * Bảo đảm tài khoản đang đăng nhập có liên kết thẻ độc giả.
 *
 * Nhóm `/api/me/*` làm việc trên thẻ độc giả (`members`), nên tài khoản không
 * có thẻ — ví dụ tài khoản quản trị tạo từ biến môi trường — không dùng được.
 * Chặn sớm ở guard để handler không phải xử lý `memberId` null.
 *
 * Phải đặt SAU `JwtAuthGuard` trong `@UseGuards` vì đọc `request.user`.
 */
@Injectable()
export class MemberCardGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<{ user?: { memberId?: string | null } }>().user;

    if (!user) {
      throw new ForbiddenException('Không xác định được tài khoản thực hiện yêu cầu');
    }

    if (!user.memberId) {
      throw new ForbiddenException(
        'Tài khoản của bạn chưa được liên kết với thẻ độc giả nào. ' +
          'Vui lòng liên hệ thủ thư để được cấp thẻ trước khi sử dụng chức năng này',
      );
    }

    return true;
  }
}
