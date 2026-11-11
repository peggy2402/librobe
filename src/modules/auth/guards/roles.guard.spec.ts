import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserRole } from '../../../common/enums/user-role.enum.js';
import { RolesGuard } from './roles.guard.js';

function buildContext(user: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

describe('RolesGuard - Phân quyền theo vai trò', () => {
  let reflector: Reflector;
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = { getAllAndOverride: vi.fn() } as unknown as Reflector;
    guard = new RolesGuard(reflector);
  });

  const setRequired = (roles: UserRole[] | undefined) =>
    (reflector.getAllAndOverride as any).mockReturnValue(roles);

  describe('Endpoint không khai báo @Roles', () => {
    it('cho qua khi metadata là undefined (endpoint tự phục vụ / chỉ đọc)', () => {
      setRequired(undefined);
      expect(guard.canActivate(buildContext({ role: UserRole.MEMBER }))).toBe(true);
    });

    it('cho qua khi danh sách vai trò rỗng', () => {
      setRequired([]);
      expect(guard.canActivate(buildContext({ role: UserRole.MEMBER }))).toBe(true);
    });
  });

  describe('Endpoint yêu cầu ADMIN hoặc LIBRARIAN', () => {
    beforeEach(() => setRequired([UserRole.ADMIN, UserRole.LIBRARIAN]));

    it('ADMIN được phép', () => {
      expect(guard.canActivate(buildContext({ role: UserRole.ADMIN }))).toBe(true);
    });

    it('LIBRARIAN được phép', () => {
      expect(guard.canActivate(buildContext({ role: UserRole.LIBRARIAN }))).toBe(true);
    });

    it('MEMBER bị chặn — đây chính là lỗ hổng cũ cho phép độc giả tự duyệt phiếu mượn', () => {
      expect(() => guard.canActivate(buildContext({ role: UserRole.MEMBER }))).toThrow(
        ForbiddenException,
      );
    });

    it('thông điệp lỗi nêu rõ vai trò cần có và vai trò hiện tại', () => {
      expect(() => guard.canActivate(buildContext({ role: UserRole.MEMBER }))).toThrow(
        /ADMIN hoặc LIBRARIAN.*MEMBER/s,
      );
    });

    it('tài khoản không có trường role bị chặn', () => {
      expect(() => guard.canActivate(buildContext({}))).toThrow(ForbiddenException);
    });

    it('thiếu request.user bị chặn (trường hợp quên đặt JwtAuthGuard trước)', () => {
      expect(() => guard.canActivate(buildContext(undefined))).toThrow(ForbiddenException);
    });
  });

  describe('Endpoint chỉ dành cho ADMIN (thao tác phá hủy dữ liệu)', () => {
    beforeEach(() => setRequired([UserRole.ADMIN]));

    it('ADMIN được phép', () => {
      expect(guard.canActivate(buildContext({ role: UserRole.ADMIN }))).toBe(true);
    });

    it('LIBRARIAN bị chặn', () => {
      expect(() => guard.canActivate(buildContext({ role: UserRole.LIBRARIAN }))).toThrow(
        ForbiddenException,
      );
    });

    it('MEMBER bị chặn', () => {
      expect(() => guard.canActivate(buildContext({ role: UserRole.MEMBER }))).toThrow(
        ForbiddenException,
      );
    });
  });
});
