import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import { UserRole } from '../../../common/enums/user-role.enum.js';

export class User {
  @ApiProperty({
    description: 'Mã định danh duy nhất của người dùng',
    example: 'user-01',
  })
  id!: string;

  @ApiProperty({
    description: 'Địa chỉ email của người dùng (dùng để đăng nhập)',
    example: 'admin@librobe.com',
  })
  email!: string;

  @ApiProperty({
    description: 'Số điện thoại của người dùng (dùng để liên hệ hoặc đăng nhập)',
    example: '0901234567',
  })
  phone!: string;

  @Exclude()
  password!: string;

  @ApiProperty({
    description: 'Họ và tên đầy đủ',
    example: 'Nguyễn Văn Quản Trị',
  })
  fullName!: string;

  @ApiProperty({
    description: 'Vai trò phân quyền trong hệ thống',
    enum: UserRole,
    example: UserRole.MEMBER,
  })
  role!: UserRole;

  @ApiProperty({
    description: 'Trạng thái hoạt động của tài khoản',
    example: true,
  })
  isActive!: boolean;

  @ApiPropertyOptional({
    description: 'Mã định danh thẻ độc giả liên kết (nếu người dùng là bạn đọc)',
    example: 'mem-01',
  })
  memberId?: string;

  @ApiProperty({
    description: 'Thời điểm tạo tài khoản',
    example: '2026-01-01T00:00:00.000Z',
  })
  createdAt!: Date;

  @ApiProperty({
    description: 'Thời điểm cập nhật tài khoản gần nhất',
    example: '2026-01-01T00:00:00.000Z',
  })
  updatedAt!: Date;
}
