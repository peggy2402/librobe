import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service.js';

function createService() {
  const prisma = {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    passwordResetToken: {
      deleteMany: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  const jwtService = {};
  const mailService = { sendPasswordResetEmail: vi.fn() };

  return {
    service: new AuthService(prisma as any, jwtService as any, mailService as any),
    prisma,
    mailService,
  };
}

describe('AuthService password reset', () => {
  it('returns a generic response without touching the database for an unknown email', async () => {
    const { service, prisma, mailService } = createService();
    prisma.user.findUnique.mockResolvedValue(null);

    const result = await service.requestPasswordReset({ email: 'unknown@example.com' });

    expect(result).toEqual({
      success: true,
      message: 'Nếu email tồn tại, hướng dẫn đặt lại mật khẩu đã được gửi.',
    });
    expect(prisma.passwordResetToken.deleteMany).not.toHaveBeenCalled();
    expect(mailService.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('creates a hashed reset token and sends the raw token through the mail service', async () => {
    const { service, prisma, mailService } = createService();
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'user@example.com', isActive: true });
    prisma.passwordResetToken.findFirst.mockResolvedValue(null);
    prisma.passwordResetToken.deleteMany.mockResolvedValue({ count: 0 });
    prisma.passwordResetToken.create.mockResolvedValue({});
    prisma.$transaction.mockResolvedValue([]);
    mailService.sendPasswordResetEmail.mockResolvedValue(undefined);

    await service.requestPasswordReset({ email: ' USER@EXAMPLE.COM ' });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const [deleteOperation, createOperation] = prisma.$transaction.mock.calls[0][0];
    await Promise.all([deleteOperation, createOperation]);
    expect(prisma.passwordResetToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        expiresAt: expect.any(Date),
      }),
    });
    expect(mailService.sendPasswordResetEmail).toHaveBeenCalledWith(
      'user@example.com',
      expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
    );
  });

  it('rejects an expired or already-used token', async () => {
    const { service, prisma } = createService();
    prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: 'reset-1',
      userId: 'user-1',
      usedAt: null,
      expiresAt: new Date(Date.now() - 1_000),
    });

    await expect(service.resetPassword({ token: 'expired-token', newPassword: 'NewPass@123' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('atomically claims the token, updates the password and removes older tokens', async () => {
    const { service, prisma } = createService();
    const tx = {
      passwordResetToken: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      user: {
        update: vi.fn().mockResolvedValue({}),
      },
    };
    prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: 'reset-1',
      userId: 'user-1',
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    prisma.$transaction.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx));

    const result = await service.resetPassword({ token: 'valid-token', newPassword: 'NewPass@123' });

    expect(result.success).toBe(true);
    expect(tx.passwordResetToken.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: 'reset-1', usedAt: null }),
      data: { usedAt: expect.any(Date) },
    });
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { password: expect.stringMatching(/^\$2[aby]?\$/) },
    });
    expect(tx.passwordResetToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', id: { not: 'reset-1' } },
    });
  });
});
