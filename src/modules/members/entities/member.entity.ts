import { ApiProperty } from '@nestjs/swagger';
import { MemberStatus } from '../../../common/enums/member-status.enum.js';

export class Member {
  @ApiProperty({
    description: 'Mã định danh duy nhất của độc giả (UUID)',
    example: 'mem-01',
  })
  id!: string;

  @ApiProperty({
    description: 'Mã số thẻ thư viện của độc giả',
    example: 'LIB-2026-0001',
  })
  cardNumber!: string;

  @ApiProperty({
    description: 'Họ và tên đầy đủ của độc giả',
    example: 'Nguyễn Văn An',
  })
  fullName!: string;

  @ApiProperty({
    description: 'Địa chỉ email liên hệ',
    example: 'an.nguyen@example.com',
  })
  email!: string;

  @ApiProperty({
    description: 'Số điện thoại liên hệ',
    example: '0901234567',
  })
  phone!: string;

  @ApiProperty({
    description: 'Địa chỉ thường trú / liên hệ',
    example: '123 Đường Nguyễn Trãi, Quận 1, TP. Hồ Chí Minh',
  })
  address!: string;

  @ApiProperty({
    description: 'Ngày hết hạn thẻ thành viên (ISO 8601)',
    example: '2027-01-01T00:00:00.000Z',
  })
  membershipExpiry!: Date;

  @ApiProperty({
    description: 'Trạng thái hoạt động của thẻ độc giả',
    enum: MemberStatus,
    example: MemberStatus.ACTIVE,
  })
  status!: MemberStatus;

  @ApiProperty({
    description: 'Số lượng sách tối đa được mượn cùng một lúc',
    example: 5,
  })
  maxBorrowLimit!: number;

  @ApiProperty({
    description: 'Số lượng sách hiện đang mượn chưa trả',
    example: 2,
  })
  currentBorrowedCount!: number;

  @ApiProperty({
    description: 'Thời điểm đăng ký thẻ thư viện',
    example: '2026-01-01T08:00:00.000Z',
  })
  createdAt!: Date;

  @ApiProperty({
    description: 'Thời điểm cập nhật thông tin thẻ gần nhất',
    example: '2026-01-01T08:00:00.000Z',
  })
  updatedAt!: Date;
}
