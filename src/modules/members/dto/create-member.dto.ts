import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateMemberDto {
  @ApiProperty({
    description: 'Họ và tên đầy đủ của độc giả',
    example: 'Vũ Minh Trí',
    maxLength: 100,
  })
  @IsNotEmpty({ message: 'Họ tên độc giả không được để trống' })
  @IsString({ message: 'Họ tên độc giả phải là chuỗi ký tự' })
  @MaxLength(100, { message: 'Họ tên độc giả không được vượt quá 100 ký tự' })
  fullName!: string;

  @ApiProperty({
    description: 'Địa chỉ email của độc giả (duy nhất)',
    example: 'tri.vu@example.com',
  })
  @IsNotEmpty({ message: 'Email không được để trống' })
  @IsEmail({}, { message: 'Địa chỉ email không đúng định dạng' })
  email!: string;

  @ApiProperty({
    description: 'Số điện thoại liên hệ (10 chữ số)',
    example: '0988112233',
  })
  @IsNotEmpty({ message: 'Số điện thoại không được để trống' })
  @Matches(/^(0[3|5|7|8|9])+([0-9]{8})$/, {
    message: 'Số điện thoại phải là số điện thoại Việt Nam hợp lệ (10 chữ số)',
  })
  phone!: string;

  @ApiProperty({
    description: 'Địa chỉ liên hệ thường trú của độc giả',
    example: '254 Đường Lê Duẩn, Quận Thanh Khê, TP. Đà Nẵng',
    maxLength: 250,
  })
  @IsNotEmpty({ message: 'Địa chỉ không được để trống' })
  @IsString({ message: 'Địa chỉ phải là chuỗi ký tự' })
  @MaxLength(250, { message: 'Địa chỉ không được vượt quá 250 ký tự' })
  address!: string;

  @ApiPropertyOptional({
    description: 'Số lượng sách tối đa độc giả được mượn cùng thời điểm',
    default: 5,
    minimum: 1,
    maximum: 10,
    example: 5,
  })
  @IsOptional()
  @IsInt({ message: 'Giới hạn mượn phải là số nguyên' })
  @Min(1, { message: 'Giới hạn mượn tối thiểu là 1 cuốn' })
  @Max(10, { message: 'Giới hạn mượn tối đa là 10 cuốn' })
  maxBorrowLimit?: number = 5;

  @ApiPropertyOptional({
    description: 'Thời hạn hiệu lực của thẻ thành viên (tính theo tháng)',
    default: 12,
    minimum: 1,
    maximum: 36,
    example: 12,
  })
  @IsOptional()
  @IsInt({ message: 'Thời hạn thẻ phải là số nguyên' })
  @Min(1, { message: 'Thời hạn thẻ tối thiểu 1 tháng' })
  @Max(36, { message: 'Thời hạn thẻ tối đa 36 tháng' })
  membershipDurationMonths?: number = 12;
}
