import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserRole } from '../../common/enums/user-role.enum.js';
import { UsersService } from './users.service.js';

const ADMIN_ID = 'user-admin';

function buildUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-03',
    email: 'doc.gia@librobe.vn',
    phone: '0909000003',
    fullName: 'Độc Giả Thường',
    role: UserRole.MEMBER,
    isActive: true,
    memberId: 'mem-01',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('UsersService - Quản trị tài khoản & phân quyền', () => {
  let service: UsersService;
  let prismaMock: any;

  beforeEach(() => {
    prismaMock = {
      user: {
        findUnique: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        update: vi.fn(),
      },
      passwordResetToken: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      $transaction: vi.fn(),
    };
    prismaMock.$transaction.mockImplementation((arg: any) =>
      typeof arg === 'function' ? arg(prismaMock) : Promise.all(arg),
    );
    service = new UsersService(prismaMock);
  });

  describe('updateRole - Nâng độc giả lên thủ thư', () => {
    it('nâng MEMBER lên LIBRARIAN thành công và GIỮ NGUYÊN liên kết thẻ độc giả', async () => {
      prismaMock.user.findUnique.mockResolvedValue(buildUser());
      prismaMock.user.update.mockResolvedValue(
        buildUser({ role: UserRole.LIBRARIAN }),
      );

      const result = await service.updateRole(
        'user-03',
        { role: UserRole.LIBRARIAN },
        ADMIN_ID,
      );

      expect(result.role).toBe(UserRole.LIBRARIAN);
      expect(result.memberId).toBe('mem-01');
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'user-03' },
        data: { role: UserRole.LIBRARIAN },
      });
    });

    it('không bao giờ trả về mật khẩu trong response', async () => {
      prismaMock.user.findUnique.mockResolvedValue(buildUser());
      prismaMock.user.update.mockResolvedValue(
        buildUser({ role: UserRole.LIBRARIAN, password: '$2b$10$hash-khong-duoc-lo' }),
      );

      const result = await service.updateRole(
        'user-03',
        { role: UserRole.LIBRARIAN },
        ADMIN_ID,
      );

      expect(result).not.toHaveProperty('password');
    });

    it('tài khoản không tồn tại -> 404', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      await expect(
        service.updateRole('khong-ton-tai', { role: UserRole.LIBRARIAN }, ADMIN_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('đã có đúng vai trò đó -> 400, không gọi update', async () => {
      prismaMock.user.findUnique.mockResolvedValue(buildUser({ role: UserRole.LIBRARIAN }));
      await expect(
        service.updateRole('user-03', { role: UserRole.LIBRARIAN }, ADMIN_ID),
      ).rejects.toThrow(/đã có vai trò/);
      expect(prismaMock.user.update).not.toHaveBeenCalled();
    });

    it('ADMIN tự hạ vai trò của chính mình -> 400 (chống tự khóa mình ra ngoài)', async () => {
      prismaMock.user.findUnique.mockResolvedValue(
        buildUser({ id: ADMIN_ID, role: UserRole.ADMIN }),
      );

      await expect(
        service.updateRole(ADMIN_ID, { role: UserRole.MEMBER }, ADMIN_ID),
      ).rejects.toThrow(/tự hạ vai trò của chính mình/);
      expect(prismaMock.user.update).not.toHaveBeenCalled();
    });

    it('hạ vai trò ADMIN hoạt động cuối cùng -> 409', async () => {
      prismaMock.user.findUnique.mockResolvedValue(
        buildUser({ id: 'user-other-admin', role: UserRole.ADMIN }),
      );
      prismaMock.user.count.mockResolvedValue(0); // không còn ADMIN nào khác

      await expect(
        service.updateRole('user-other-admin', { role: UserRole.LIBRARIAN }, ADMIN_ID),
      ).rejects.toThrow(ConflictException);
      expect(prismaMock.user.update).not.toHaveBeenCalled();
    });

    it('hạ vai trò một ADMIN khi vẫn còn ADMIN khác -> cho phép', async () => {
      prismaMock.user.findUnique.mockResolvedValue(
        buildUser({ id: 'user-other-admin', role: UserRole.ADMIN }),
      );
      prismaMock.user.count.mockResolvedValue(1); // còn 1 ADMIN khác
      prismaMock.user.update.mockResolvedValue(
        buildUser({ id: 'user-other-admin', role: UserRole.LIBRARIAN }),
      );

      const result = await service.updateRole(
        'user-other-admin',
        { role: UserRole.LIBRARIAN },
        ADMIN_ID,
      );
      expect(result.role).toBe(UserRole.LIBRARIAN);
    });

    it('nâng MEMBER lên ADMIN không bị chặn bởi luật "ADMIN cuối cùng"', async () => {
      prismaMock.user.findUnique.mockResolvedValue(buildUser());
      prismaMock.user.update.mockResolvedValue(buildUser({ role: UserRole.ADMIN }));

      const result = await service.updateRole('user-03', { role: UserRole.ADMIN }, ADMIN_ID);

      expect(result.role).toBe(UserRole.ADMIN);
      expect(prismaMock.user.count).not.toHaveBeenCalled();
    });
  });

  describe('updateStatus - Khóa / mở tài khoản', () => {
    it('khóa tài khoản và vô hiệu mọi token đặt lại mật khẩu đang treo', async () => {
      prismaMock.user.findUnique.mockResolvedValue(buildUser());
      prismaMock.user.update.mockResolvedValue(buildUser({ isActive: false }));

      const result = await service.updateStatus('user-03', { isActive: false }, ADMIN_ID);

      expect(result.isActive).toBe(false);
      expect(prismaMock.passwordResetToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-03' },
      });
    });

    it('tự khóa chính mình -> 400', async () => {
      prismaMock.user.findUnique.mockResolvedValue(buildUser({ id: ADMIN_ID }));
      await expect(
        service.updateStatus(ADMIN_ID, { isActive: false }, ADMIN_ID),
      ).rejects.toThrow(/tự khóa tài khoản của chính mình/);
    });

    it('khóa ADMIN hoạt động cuối cùng -> 409', async () => {
      prismaMock.user.findUnique.mockResolvedValue(
        buildUser({ id: 'user-other-admin', role: UserRole.ADMIN }),
      );
      prismaMock.user.count.mockResolvedValue(0);

      await expect(
        service.updateStatus('user-other-admin', { isActive: false }, ADMIN_ID),
      ).rejects.toThrow(ConflictException);
    });

    it('mở lại tài khoản đang bị khóa -> không xóa token', async () => {
      prismaMock.user.findUnique.mockResolvedValue(buildUser({ isActive: false }));
      prismaMock.user.update.mockResolvedValue(buildUser({ isActive: true }));

      const result = await service.updateStatus('user-03', { isActive: true }, ADMIN_ID);

      expect(result.isActive).toBe(true);
      expect(prismaMock.passwordResetToken.deleteMany).not.toHaveBeenCalled();
    });

    it('đã ở trạng thái đó -> 400', async () => {
      prismaMock.user.findUnique.mockResolvedValue(buildUser({ isActive: true }));
      await expect(
        service.updateStatus('user-03', { isActive: true }, ADMIN_ID),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
