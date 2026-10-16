import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { DatabaseService } from '../../database/database.service.js';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly db: DatabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('Yêu cầu cần có mã Access Token để xác thực (Bearer Token)');
    }

    try {
      const payload = await this.jwtService.verifyAsync(token);
      const user = this.db.getUserById(payload.sub);

      if (!user) {
        throw new UnauthorizedException('Người dùng liên kết với Token không tồn tại');
      }

      if (!user.isActive) {
        throw new UnauthorizedException('Tài khoản này hiện đang bị khóa hoặc ngưng hoạt động');
      }

      // Gán user vào request object để controller sử dụng
      (request as any).user = user;
    } catch {
      throw new UnauthorizedException('Mã Access Token không hợp lệ hoặc đã hết hạn');
    }

    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
