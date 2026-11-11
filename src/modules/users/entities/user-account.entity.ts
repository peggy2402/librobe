import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '../../../common/enums/user-role.enum.js';

/**
 * Tài khoản đăng nhập trả về cho API quản trị.
 * Tuyệt đối không chứa cột `password`.
 */
export class UserAccount {
  @ApiProperty({ description: 'Mã định danh tài khoản', example: 'user-02' })
  id!: string;

  @ApiProperty({ description: 'Email đăng nhập', example: 'librarian@librobe.com' })
  email!: string;

  @ApiProperty({ description: 'Số điện thoại', example: '0909000002' })
  phone!: string;

  @ApiProperty({ description: 'Họ và tên', example: 'Thủ Thư Thư Viện' })
  fullName!: string;

  @ApiProperty({
    description: 'Vai trò tài khoản',
    enum: UserRole,
    example: UserRole.LIBRARIAN,
  })
  role!: UserRole;

  @ApiProperty({ description: 'Tài khoản còn hoạt động hay đã bị khóa', example: true })
  isActive!: boolean;

  @ApiPropertyOptional({
    description: 'Thẻ độc giả được liên kết (nếu tài khoản này cũng là độc giả của thư viện)',
    example: 'mem-01',
  })
  memberId?: string;

  @ApiProperty({ description: 'Thời điểm tạo tài khoản' })
  createdAt!: Date;

  @ApiProperty({ description: 'Thời điểm cập nhật gần nhất' })
  updatedAt!: Date;
}
