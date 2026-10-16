import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { MemberStatus } from '../../common/enums/member-status.enum.js';
import { UserRole } from '../../common/enums/user-role.enum.js';
import { DatabaseService } from '../database/database.service.js';
import { Member } from '../members/entities/member.entity.js';
import { User } from '../users/entities/user.entity.js';
import { AuthResponseDto, UserProfileDto } from './dto/auth-response.dto.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';

@Injectable()
export class AuthService {
  private readonly JWT_EXPIRES_IN_SECONDS = 86400; // 24 giờ

  constructor(
    private readonly db: DatabaseService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const cleanEmail = dto.email.trim().toLowerCase();
    const cleanPhone = dto.phone.trim();

    // 1. Kiểm tra trùng Email
    const existingByEmail = this.db.getUserByEmail(cleanEmail);
    if (existingByEmail) {
      throw new ConflictException(`Địa chỉ email "${dto.email}" đã được đăng ký tài khoản khác`);
    }

    // 2. Kiểm tra trùng Số điện thoại
    const existingByPhone = this.db.getUserByPhone(cleanPhone);
    if (existingByPhone) {
      throw new ConflictException(`Số điện thoại "${dto.phone}" đã được liên kết với tài khoản khác`);
    }

    // 3. Băm mật khẩu bằng bcrypt
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(dto.password, salt);

    const now = new Date();
    const userId = `user-${randomUUID().substring(0, 8)}`;
    const role = dto.role ?? UserRole.MEMBER;
    let memberId: string | undefined;

    // 4. Nếu người dùng đăng ký vai trò Độc giả (MEMBER), tự động liên kết hoặc tạo thẻ thư viện
    if (role === UserRole.MEMBER) {
      const existingMember = this.db.getMemberByEmail(cleanEmail);
      if (existingMember) {
        memberId = existingMember.id;
      } else {
        const memberCount = this.db.getMembers().length + 1;
        const cardNumber = `LIB-${now.getFullYear()}-${memberCount.toString().padStart(4, '0')}`;
        const expiryDate = new Date(now);
        expiryDate.setFullYear(expiryDate.getFullYear() + 1);

        const newMember: Member = {
          id: `mem-${randomUUID().substring(0, 8)}`,
          cardNumber,
          fullName: dto.fullName.trim(),
          email: cleanEmail,
          phone: cleanPhone,
          address: 'Chưa cập nhật địa chỉ',
          membershipExpiry: expiryDate,
          status: MemberStatus.ACTIVE,
          maxBorrowLimit: 5,
          currentBorrowedCount: 0,
          createdAt: now,
          updatedAt: now,
        };
        this.db.setMember(newMember);
        memberId = newMember.id;
      }
    }

    const newUser: User = {
      id: userId,
      email: cleanEmail,
      phone: cleanPhone,
      password: hashedPassword,
      fullName: dto.fullName.trim(),
      role,
      isActive: true,
      memberId,
      createdAt: now,
      updatedAt: now,
    };

    this.db.setUser(newUser);

    // 5. Sinh JWT Token
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

    // Tìm kiếm người dùng qua Email hoặc Số điện thoại
    const user =
      this.db.getUserByEmail(cleanIdentifier) || this.db.getUserByPhone(cleanIdentifier);

    if (!user) {
      throw new UnauthorizedException('Email/Số điện thoại hoặc mật khẩu không chính xác');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Tài khoản của bạn đã bị vô hiệu hóa hoặc tạm khóa');
    }

    // So khớp mật khẩu
    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Email/Số điện thoại hoặc mật khẩu không chính xác');
    }

    // Sinh JWT Token
    const accessToken = await this.generateToken(user);

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: this.JWT_EXPIRES_IN_SECONDS,
      user: this.toProfileDto(user),
    };
  }

  getProfile(userId: string): UserProfileDto {
    const user = this.db.getUserById(userId);
    if (!user) {
      throw new NotFoundException('Không tìm thấy thông tin người dùng');
    }
    return this.toProfileDto(user);
  }

  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
  ): Promise<{ message: string; success: boolean }> {
    const user = this.db.getUserById(userId);
    if (!user) {
      throw new NotFoundException('Không tìm thấy tài khoản người dùng');
    }

    // Kiểm tra mật khẩu cũ
    const isMatch = await bcrypt.compare(dto.currentPassword, user.password);
    if (!isMatch) {
      throw new BadRequestException('Mật khẩu hiện tại không chính xác');
    }

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('Mật khẩu mới không được trùng với mật khẩu hiện tại');
    }

    // Băm mật khẩu mới
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(dto.newPassword, salt);
    user.updatedAt = new Date();

    this.db.setUser(user);

    return {
      success: true,
      message: 'Mật khẩu đã được thay đổi thành công',
    };
  }

  private async generateToken(user: User): Promise<string> {
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

  private toProfileDto(user: User): UserProfileDto {
    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      fullName: user.fullName,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
    };
  }
}
