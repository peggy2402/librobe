import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { MemberStatus } from '../../common/enums/member-status.enum.js';
import { UserRole } from '../../common/enums/user-role.enum.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthResponseDto, UserProfileDto } from './dto/auth-response.dto.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';

@Injectable()
export class AuthService {
  private readonly JWT_EXPIRES_IN_SECONDS = 86400; // 24 giờ

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

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
    const role = (dto.role as any) ?? UserRole.MEMBER;
    let memberId: string | undefined;

    // 4. Nếu người dùng đăng ký vai trò Độc giả (MEMBER), tự động liên kết hoặc tạo thẻ thư viện
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

    // Tìm kiếm người dùng qua Email hoặc Số điện thoại trên Supabase Postgres
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
      isActive: user.isActive,
      createdAt: user.createdAt,
    };
  }
}
