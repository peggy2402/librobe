import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ description: 'Token nhận được trong email đặt lại mật khẩu' })
  @IsNotEmpty({ message: 'Token đặt lại mật khẩu không được để trống' })
  @IsString({ message: 'Token đặt lại mật khẩu phải là chuỗi ký tự' })
  token!: string;

  @ApiProperty({ example: 'MatKhauMoi@456', minLength: 6, maxLength: 50 })
  @IsNotEmpty({ message: 'Mật khẩu mới không được để trống' })
  @IsString({ message: 'Mật khẩu mới phải là chuỗi ký tự' })
  @MinLength(6, { message: 'Mật khẩu mới phải có tối thiểu 6 ký tự' })
  @MaxLength(50, { message: 'Mật khẩu mới không được dài quá 50 ký tự' })
  newPassword!: string;
}
