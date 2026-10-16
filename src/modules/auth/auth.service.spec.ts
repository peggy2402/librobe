import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from '../../common/enums/user-role.enum.js';
import { DatabaseModule } from '../database/database.module.js';
import { DatabaseService } from '../database/database.service.js';
import { AuthService } from './auth.service.js';

describe('AuthService', () => {
  let service: AuthService;
  let db: DatabaseService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        DatabaseModule,
        JwtModule.register({
          secret: 'test-secret-key-123',
          signOptions: { expiresIn: '1h' },
        }),
      ],
      providers: [AuthService],
    }).compile();

    service = module.get<AuthService>(AuthService);
    db = module.get<DatabaseService>(DatabaseService);
    db.onModuleInit(); // nạp lại seed data
  });

  describe('Đăng ký tài khoản (register)', () => {
    it('nên đăng ký tài khoản thành công với email, sđt, mật khẩu và họ tên', async () => {
      const res = await service.register({
        email: 'hoang.le@example.com',
        phone: '0977889900',
        password: 'Password@123',
        fullName: 'Lê Văn Hoàng',
        role: UserRole.MEMBER,
      });

      expect(res.accessToken).toBeDefined();
      expect(res.tokenType).toBe('Bearer');
      expect(res.user.email).toBe('hoang.le@example.com');
      expect(res.user.phone).toBe('0977889900');
      expect(res.user.fullName).toBe('Lê Văn Hoàng');
      expect((res.user as any).password).toBeUndefined(); // không lộ password
    });

    it('nên từ chối đăng ký khi email đã tồn tại', async () => {
      await expect(
        service.register({
          email: 'admin@librobe.com', // đã có trong seed data
          phone: '0988776655',
          password: 'Password@123',
          fullName: 'Người Dùng Khác',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('nên từ chối đăng ký khi số điện thoại đã tồn tại', async () => {
      await expect(
        service.register({
          email: 'unique.email@example.com',
          phone: '0909000001', // sđt của admin đã có
          password: 'Password@123',
          fullName: 'Người Dùng Khác',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('Đăng nhập (login)', () => {
    it('nên đăng nhập thành công bằng email và mật khẩu', async () => {
      const res = await service.login({
        email: 'admin@librobe.com',
        password: 'Admin@123',
      });

      expect(res.accessToken).toBeDefined();
      expect(res.user.role).toBe(UserRole.ADMIN);
      expect(res.user.email).toBe('admin@librobe.com');
    });

    it('nên đăng nhập thành công bằng số điện thoại và mật khẩu', async () => {
      const res = await service.login({
        phone: '0909000001',
        password: 'Admin@123',
      });

      expect(res.accessToken).toBeDefined();
      expect(res.user.phone).toBe('0909000001');
    });

    it('nên đăng nhập thành công khi dùng trường identifier (chứa email)', async () => {
      const res = await service.login({
        identifier: 'librarian@librobe.com',
        password: 'Librarian@123',
      });

      expect(res.accessToken).toBeDefined();
      expect(res.user.role).toBe(UserRole.LIBRARIAN);
    });

    it('nên từ chối đăng nhập khi sai mật khẩu', async () => {
      await expect(
        service.login({
          email: 'admin@librobe.com',
          password: 'WrongPassword@999',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('nên từ chối đăng nhập khi tài khoản không tồn tại', async () => {
      await expect(
        service.login({
          email: 'khongtontai@librobe.com',
          password: 'AnyPassword@123',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('Đổi mật khẩu (changePassword)', () => {
    it('nên đổi mật khẩu thành công khi nhập đúng mật khẩu hiện tại', async () => {
      const result = await service.changePassword('user-03', {
        currentPassword: 'Member@123',
        newPassword: 'NewMemberPassword@456',
      });

      expect(result.success).toBe(true);

      // Đăng nhập lại bằng mật khẩu mới
      const loginRes = await service.login({
        email: 'an.nguyen@example.com',
        password: 'NewMemberPassword@456',
      });
      expect(loginRes.accessToken).toBeDefined();
    });

    it('nên từ chối đổi mật khẩu khi sai mật khẩu hiện tại', async () => {
      await expect(
        service.changePassword('user-03', {
          currentPassword: 'SaiMatKhau@000',
          newPassword: 'MatKhauMoi@123',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
