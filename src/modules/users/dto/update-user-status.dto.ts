import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateUserStatusDto {
  @ApiProperty({
    description:
      'true = mở lại tài khoản, false = khóa tài khoản. Khi khóa, mọi token đặt lại ' +
      'mật khẩu đang treo của tài khoản đó cũng bị vô hiệu.',
    example: false,
  })
  @IsBoolean({ message: 'Trạng thái hoạt động phải là kiểu boolean (true/false)' })
  isActive!: boolean;
}
