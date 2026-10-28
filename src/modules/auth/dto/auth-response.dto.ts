import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../../../common/enums/user-role.enum.js';

export class UserProfileDto {
  @ApiProperty({ example: 'user-01' })
  id!: string;

  @ApiProperty({ example: 'admin@librobe.com' })
  email!: string;

  @ApiProperty({ example: '0909000001' })
  phone!: string;

  @ApiProperty({ example: 'Quản Trị Viên Hệ Thống' })
  fullName!: string;

  @ApiProperty({ enum: UserRole, example: UserRole.ADMIN })
  role!: UserRole;

  @ApiProperty({
    description: 'Mã hồ sơ độc giả liên kết; null nếu tài khoản không phải MEMBER',
    example: 'mem-01',
    nullable: true,
  })
  memberId!: string | null;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  createdAt!: Date;
}

export class AuthResponseDto {
  @ApiProperty({
    description: 'Mã JSON Web Token (Bearer JWT) dùng để xác thực các request tiếp theo',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTAxIiwiZW1haWwiOiJhZG1pbkBsaWJyb2JlLmNvbSJ9...',
  })
  accessToken!: string;

  @ApiProperty({
    description: 'Loại token',
    example: 'Bearer',
  })
  tokenType!: string;

  @ApiProperty({
    description: 'Thời gian hết hạn của token (tính bằng giây)',
    example: 86400,
  })
  expiresIn!: number;

  @ApiProperty({
    description: 'Thông tin hồ sơ người dùng đăng nhập thành công',
    type: UserProfileDto,
  })
  user!: UserProfileDto;
}
