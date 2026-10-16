import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { UserRole } from '../../../common/enums/user-role.enum.js';

export class RegisterDto {
  @ApiProperty({
    description: 'Địa chỉ email đăng ký tài khoản (duy nhất)',
    example: 'user.test@librobe.com',
  })
  @IsNotEmpty({ message: 'Email không được để trống' })
  @IsEmail({}, { message: 'Địa chỉ email không đúng định dạng' })
  email!: string;

  @ApiProperty({
    description: 'Số điện thoại liên hệ (10 chữ số tại Việt Nam)',
    example: '0912345678',
  })
  @IsNotEmpty({ message: 'Số điện thoại không được để trống' })
  @Matches(/^(0[3|5|7|8|9])+([0-9]{8})$/, {
    message: 'Số điện thoại phải là số di động Việt Nam hợp lệ gồm 10 chữ số (đầu số 03, 05, 07, 08, 09)',
  })
  phone!: string;

  @ApiProperty({
    description: 'Mật khẩu tài khoản (tối thiểu 6 ký tự)',
    example: 'MatKhau@123',
    minLength: 6,
    maxLength: 50,
  })
  @IsNotEmpty({ message: 'Mật khẩu không được để trống' })
  @IsString({ message: 'Mật khẩu phải là chuỗi ký tự' })
  @MinLength(6, { message: 'Mật khẩu phải có độ dài tối thiểu 6 ký tự' })
  @MaxLength(50, { message: 'Mật khẩu không được vượt quá 50 ký tự' })
  password!: string;

  @ApiProperty({
    description: 'Họ và tên đầy đủ của người đăng ký',
    example: 'Trần Văn Nam',
    maxLength: 100,
  })
  @IsNotEmpty({ message: 'Họ tên không được để trống' })
  @IsString({ message: 'Họ tên phải là chuỗi ký tự' })
  @MaxLength(100, { message: 'Họ tên không được vượt quá 100 ký tự' })
  fullName!: string;

  @ApiPropertyOptional({
    description: 'Vai trò tài khoản (mặc định: MEMBER)',
    enum: UserRole,
    default: UserRole.MEMBER,
    example: UserRole.MEMBER,
  })
  @IsOptional()
  @IsEnum(UserRole, { message: 'Vai trò tài khoản không hợp lệ' })
  role?: UserRole = UserRole.MEMBER;
}
