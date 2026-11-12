import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { MemberStatus } from '../../common/enums/member-status.enum.js';
import { UserRole } from '../../common/enums/user-role.enum.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthResponseDto, UserProfileDto } from './dto/auth-response.dto.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { MailService } from './mail.service.js';

@Injectable()
export class AuthService {
  private readonly JWT_EXPIRES_IN_SECONDS = 86400; // 24 giờ

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
  ) {}

  async requestPasswordReset(dto: ForgotPasswordDto): Promise<{ message: string; success: boolean }> {
    const response = {
      success: true,
      message: 'Nếu email tồn tại, hướng dẫn đặt lại mật khẩu đã được gửi.',
    };
    const cleanEmail = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email: cleanEmail } });

    if (!user || !user.isActive) {
      return response;
    }

    const recentToken = await this.prisma.passwordResetToken.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });
    if (recentToken && Date.now() - recentToken.createdAt.getTime() < 60_000) {
      return response;
    }

    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const configuredTtl = Number.parseInt(process.env.RESET_TOKEN_TTL_MINUTES || '20', 10);
    const ttlMinutes = Number.isFinite(configuredTtl) ? Math.max(5, configuredTtl) : 20;
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

    await this.prisma.$transaction([
      this.prisma.passwordResetToken.deleteMany({ where: { userId: user.id } }),
      this.prisma.passwordResetToken.create({
        data: { userId: user.id, tokenHash, expiresAt },
      }),
    ]);

    try {
      await this.mailService.sendPasswordResetEmail(user.email, rawToken);
    } catch (error) {
      // Keep the public response generic to prevent account enumeration.
      // The error is still surfaced to server logs for operational monitoring.
      console.error('[password-reset] Không thể gửi email', error);
    }

    return response;
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string; success: boolean }> {
    const tokenHash = createHash('sha256').update(dto.token).digest('hex');
    const now = new Date();
    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt <= now) {
      throw new BadRequestException('Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);

    try {
      await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.passwordResetToken.updateMany({
          where: {
            id: resetToken.id,
            usedAt: null,
            expiresAt: { gt: now },
          },
          data: { usedAt: now },
        });

        if (claimed.count !== 1) {
          throw new BadRequestException('Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn');
        }

        await tx.user.update({
          where: { id: resetToken.userId },
          data: { password: hashedPassword },
        });

        await tx.passwordResetToken.deleteMany({
          where: { userId: resetToken.userId, id: { not: resetToken.id } },
        });
      });
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Không thể đặt lại mật khẩu lúc này');
    }

    return {
      success: true,
      message: 'Mật khẩu đã được đặt lại thành công. Vui lòng đăng nhập lại.',
    };
  }

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const cleanEmail = dto.email.trim().toLowerCase();
    const cleanPhone = dto.phone.trim();

    // 1. Kiểm tra trùng Email
    const existingByEmail = await this.prisma.user.findUnique({
      where: { email: cleanEmail },
    });
    if (existingByEmail) {
      throw new ConflictException(`Địa chỉ email "${dto.email}" đã được đăng ký tài khoản khác`);
    }

    // 2. Kiểm tra trùng Số điện thoại
    const existingByPhone = await this.prisma.user.findUnique({
      where: { phone: cleanPhone },
    });
    if (existingByPhone) {
      throw new ConflictException(`Số điện thoại "${dto.phone}" đã được liên kết với tài khoản khác`);
    }

    // 3. Băm mật khẩu bằng bcrypt
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(dto.password, salt);

    const now = new Date();
    // Vai trò KHÔNG lấy từ dữ liệu client gửi lên. Đăng ký công khai luôn tạo
    // tài khoản MEMBER; nâng lên LIBRARIAN/ADMIN là việc của ADMIN qua
    // `PATCH /api/users/:id/role`.
    const role = UserRole.MEMBER;
    let memberId: string | undefined;

    // 4. Người dùng đăng ký là Độc giả (MEMBER), tự động liên kết hoặc tạo thẻ thư viện
    if (role === UserRole.MEMBER) {
      const existingMember = await this.prisma.member.findUnique({
        where: { email: cleanEmail },
      });
      if (existingMember) {
        memberId = existingMember.id;
      } else {
        const memberCount = (await this.prisma.member.count()) + 1;
        const cardNumber = `LIB-${now.getFullYear()}-${memberCount.toString().padStart(4, '0')}`;
        const expiryDate = new Date(now);
        expiryDate.setFullYear(expiryDate.getFullYear() + 1);

        const newMember = await this.prisma.member.create({
          data: {
            cardNumber,
            fullName: dto.fullName.trim(),
            email: cleanEmail,
            phone: cleanPhone,
            address: 'Chưa cập nhật địa chỉ',
            membershipExpiry: expiryDate,
            status: MemberStatus.ACTIVE,
            maxBorrowLimit: 5,
            currentBorrowedCount: 0,
          },
        });
        memberId = newMember.id;
      }
    }

    const newUser = await this.prisma.user.create({
      data: {
        email: cleanEmail,
        phone: cleanPhone,
        password: hashedPassword,
        fullName: dto.fullName.trim(),
        role,
        isActive: true,
        memberId: memberId || null,
      },
    });

    const accessToken = await this.generateToken(newUser);

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: this.JWT_EXPIRES_IN_SECONDS,
      user: this.toProfileDto(newUser),
    };
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const accountIdentifier = dto.identifier || dto.email || dto.phone;

    if (!accountIdentifier) {
      throw new BadRequestException('Vui lòng cung cấp email hoặc số điện thoại để đăng nhập');
    }

    const cleanIdentifier = accountIdentifier.trim();

    // 1. Kiểm tra tài khoản Quản trị viên cấp cao từ biến môi trường (.env: ADMIN_USERNAME & ADMIN_PASSWORD)
    const envAdminUser = process.env.ADMIN_USERNAME?.trim();
    const envAdminPass = process.env.ADMIN_PASSWORD;

    if (
      envAdminUser &&
      envAdminPass &&
      cleanIdentifier.toLowerCase() === envAdminUser.toLowerCase() &&
      dto.password === envAdminPass
    ) {
      let adminUser = await this.prisma.user.findFirst({
        where: {
          OR: [
            { email: `${envAdminUser.toLowerCase()}@librobe.com` },
            { email: 'admin@librobe.com' },
          ],
        },
      });

      if (!adminUser) {
        const hashedPassword = await bcrypt.hash(envAdminPass, 10);
        adminUser = await this.prisma.user.create({
          data: {
            email: `${envAdminUser.toLowerCase()}@librobe.com`,
            phone: '0909000001',
            password: hashedPassword,
            fullName: `Quản Trị Viên (${envAdminUser})`,
            role: UserRole.ADMIN,
            isActive: true,
          },
        });
      }

      const accessToken = await this.generateToken(adminUser);
      return {
        accessToken,
        tokenType: 'Bearer',
        expiresIn: this.JWT_EXPIRES_IN_SECONDS,
        user: this.toProfileDto(adminUser),
      };
    }

    // 2. Tìm kiếm người dùng qua Email hoặc Số điện thoại trên Supabase Postgres
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: cleanIdentifier.toLowerCase() },
          { phone: cleanIdentifier },
        ],
      },
    });

    if (!user) {
      throw new UnauthorizedException('Email/Số điện thoại hoặc mật khẩu không chính xác');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Tài khoản của bạn đã bị vô hiệu hóa hoặc tạm khóa');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Email/Số điện thoại hoặc mật khẩu không chính xác');
    }

    const accessToken = await this.generateToken(user);

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: this.JWT_EXPIRES_IN_SECONDS,
      user: this.toProfileDto(user),
    };
  }

  async getProfile(userId: string): Promise<UserProfileDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new NotFoundException('Không tìm thấy thông tin người dùng');
    }
    return this.toProfileDto(user);
  }

  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
  ): Promise<{ message: string; success: boolean }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new NotFoundException('Không tìm thấy tài khoản người dùng');
    }

    const isMatch = await bcrypt.compare(dto.currentPassword, user.password);
    if (!isMatch) {
      throw new BadRequestException('Mật khẩu hiện tại không chính xác');
    }

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('Mật khẩu mới không được trùng với mật khẩu hiện tại');
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(dto.newPassword, salt);

    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    return {
      success: true,
      message: 'Mật khẩu đã được thay đổi thành công',
    };
  }

  private async generateToken(user: any): Promise<string> {
    const payload = {
      sub: user.id,
      email: user.email,
      phone: user.phone,
      role: user.role,
      fullName: user.fullName,
      memberId: user.memberId,
    };

    return this.jwtService.signAsync(payload, {
      expiresIn: this.JWT_EXPIRES_IN_SECONDS,
    });
  }

  private toProfileDto(user: any): UserProfileDto {
    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      fullName: user.fullName,
      role: user.role as UserRole,
      memberId: user.memberId ?? null,
      isActive: user.isActive,
      createdAt: user.createdAt,
    };
  }
}
