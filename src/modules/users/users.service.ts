import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PaginatedResponseDto } from '../../common/dto/pagination.dto.js';
import { UserRole } from '../../common/enums/user-role.enum.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { FilterUserDto } from './dto/filter-user.dto.js';
import { UpdateUserRoleDto } from './dto/update-user-role.dto.js';
import { UpdateUserStatusDto } from './dto/update-user-status.dto.js';
import { UserAccount } from './entities/user-account.entity.js';

/**
 * Quản trị tài khoản đăng nhập (bảng `users`) — phân biệt với `MembersService`
 * quản lý thẻ độc giả (bảng `members`).
 *
 * Trước đây hệ thống không có module này: `role` chỉ được gán khi đăng ký
 * (client tự khai, là một lỗ hổng leo thang đặc quyền) hoặc phải sửa tay trong
 * database. Admin không có cách nào nâng một người lên thủ thư qua API.
 */
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters: FilterUserDto): Promise<PaginatedResponseDto<UserAccount>> {
    const page = filters.page || 1;
    const limit = filters.limit || 10;
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {};

    if (filters.role) {
      where.role = filters.role;
    }

    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }

    if (filters.search) {
      const term = filters.search.trim();
      where.OR = [
        { email: { contains: term, mode: 'insensitive' } },
        { phone: { contains: term, mode: 'insensitive' } },
        { fullName: { contains: term, mode: 'insensitive' } },
      ];
    }

    const [totalItems, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: filters.sortBy
          ? { [filters.sortBy]: (filters.sortOrder ?? 'DESC').toLowerCase() }
          : { createdAt: 'desc' },
      }),
    ]);

    const totalPages = Math.ceil(totalItems / limit) || 1;

    return {
      data: users.map((u) => this.mapToEntity(u)),
      meta: {
        page,
        limit,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  async findOne(id: string): Promise<UserAccount> {
    const user = await this.prisma.user.findUnique({ where: { id } });

    if (!user) {
      throw new NotFoundException(`Không tìm thấy tài khoản với ID "${id}"`);
    }

    return this.mapToEntity(user);
  }

  /**
   * Đổi vai trò tài khoản. Chỉ ADMIN được gọi (chặn ở tầng controller).
   *
   * Hai chốt an toàn chống tự khóa mình ra khỏi hệ thống:
   *  1. Không cho tự hạ vai trò của chính mình.
   *  2. Không cho hạ vai trò của ADMIN cuối cùng.
   *
   * Liên kết `memberId` tới thẻ độc giả được GIỮ NGUYÊN khi nâng vai trò —
   * một thủ thư vẫn có thể là độc giả của thư viện.
   */
  async updateRole(
    id: string,
    dto: UpdateUserRoleDto,
    actorId: string,
  ): Promise<UserAccount> {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id } });

      if (!user) {
        throw new NotFoundException(`Không tìm thấy tài khoản với ID "${id}"`);
      }

      if (user.role === dto.role) {
        throw new BadRequestException(`Tài khoản này đã có vai trò "${dto.role}"`);
      }

      const isDemotingAdmin = user.role === UserRole.ADMIN && dto.role !== UserRole.ADMIN;

      if (isDemotingAdmin && user.id === actorId) {
        throw new BadRequestException(
          'Không thể tự hạ vai trò của chính mình. Hãy nhờ một ADMIN khác thực hiện',
        );
      }

      if (isDemotingAdmin) {
        const remainingAdmins = await tx.user.count({
          where: { role: UserRole.ADMIN, isActive: true, id: { not: id } },
        });

        if (remainingAdmins === 0) {
          throw new ConflictException(
            'Đây là tài khoản ADMIN đang hoạt động duy nhất. Cần chỉ định một ADMIN khác trước khi hạ vai trò tài khoản này',
          );
        }
      }

      const updated = await tx.user.update({
        where: { id },
        data: { role: dto.role },
      });

      return this.mapToEntity(updated);
    });
  }

  /**
   * Khóa / mở tài khoản. Cũng áp dụng chốt an toàn như `updateRole`:
   * không tự khóa mình, không khóa ADMIN đang hoạt động cuối cùng.
   */
  async updateStatus(
    id: string,
    dto: UpdateUserStatusDto,
    actorId: string,
  ): Promise<UserAccount> {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id } });

      if (!user) {
        throw new NotFoundException(`Không tìm thấy tài khoản với ID "${id}"`);
      }

      if (user.isActive === dto.isActive) {
        throw new BadRequestException(
          `Tài khoản này đã ở trạng thái ${dto.isActive ? 'đang hoạt động' : 'bị khóa'}`,
        );
      }

      if (!dto.isActive) {
        if (user.id === actorId) {
          throw new BadRequestException('Không thể tự khóa tài khoản của chính mình');
        }

        if (user.role === UserRole.ADMIN) {
          const remainingAdmins = await tx.user.count({
            where: { role: UserRole.ADMIN, isActive: true, id: { not: id } },
          });

          if (remainingAdmins === 0) {
            throw new ConflictException(
              'Đây là tài khoản ADMIN đang hoạt động duy nhất, không thể khóa',
            );
          }
        }

        // Khóa tài khoản thì mọi token đặt lại mật khẩu đang treo phải mất hiệu lực,
        // tránh việc người đó vẫn đổi được mật khẩu sau khi bị khóa.
        await tx.passwordResetToken.deleteMany({ where: { userId: id } });
      }

      const updated = await tx.user.update({
        where: { id },
        data: { isActive: dto.isActive },
      });

      return this.mapToEntity(updated);
    });
  }

  /** Không bao giờ trả về cột `password`. */
  private mapToEntity(u: {
    id: string;
    email: string;
    phone: string;
    fullName: string;
    role: string;
    isActive: boolean;
    memberId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): UserAccount {
    return {
      id: u.id,
      email: u.email,
      phone: u.phone,
      fullName: u.fullName,
      role: u.role as UserRole,
      isActive: u.isActive,
      memberId: u.memberId ?? undefined,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    };
  }
}
