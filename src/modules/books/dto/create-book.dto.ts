import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { BookStatus } from '../../../common/enums/book-status.enum.js';
import { normalizeIsbn } from '../../../common/utils/isbn.util.js';

export class CreateBookDto {
  @ApiProperty({
    description: 'Mã số tiêu chuẩn quốc tế cho sách (ISBN-13, tự động chuẩn hóa về 13 chữ số không dấu gạch)',
    example: '9780132350884',
  })
  @Transform(({ value }) => (typeof value === 'string' ? normalizeIsbn(value) : value))
  @IsNotEmpty({ message: 'ISBN không được để trống' })
  @IsString({ message: 'ISBN phải là chuỗi ký tự' })
  @Matches(/^\d{13}$/, {
    message: 'ISBN phải gồm đúng 13 chữ số theo chuẩn ISBN-13',
  })
  isbn!: string;

  @ApiProperty({
    description: 'Tựa đề cuốn sách',
    example: 'Clean Code: A Handbook of Agile Software Craftsmanship',
    maxLength: 250,
  })
  @IsNotEmpty({ message: 'Tựa đề sách không được để trống' })
  @IsString({ message: 'Tựa đề sách phải là chuỗi ký tự' })
  @MaxLength(250, { message: 'Tựa đề sách không được dài quá 250 ký tự' })
  title!: string;

  @ApiProperty({
    description: 'Mã định danh tác giả (phải tồn tại trong hệ thống)',
    example: 'auth-01',
  })
  @IsNotEmpty({ message: 'Mã tác giả không được để trống' })
  @IsString({ message: 'Mã tác giả phải là chuỗi ký tự' })
  authorId!: string;

  @ApiProperty({
    description: 'Mã định danh thể loại sách (phải tồn tại trong hệ thống)',
    example: 'cat-01',
  })
  @IsNotEmpty({ message: 'Mã thể loại không được để trống' })
  @IsString({ message: 'Mã thể loại phải là chuỗi ký tự' })
  categoryId!: string;

  @ApiProperty({
    description: 'Nhà xuất bản',
    example: 'Prentice Hall',
    maxLength: 150,
  })
  @IsNotEmpty({ message: 'Nhà xuất bản không được để trống' })
  @IsString({ message: 'Nhà xuất bản phải là chuỗi ký tự' })
  @MaxLength(150, { message: 'Nhà xuất bản không được vượt quá 150 ký tự' })
  publisher!: string;

  @ApiProperty({
    description: 'Năm xuất bản',
    example: 2008,
    minimum: 1500,
    maximum: 2026,
  })
  @IsInt({ message: 'Năm xuất bản phải là số nguyên' })
  @Min(1500, { message: 'Năm xuất bản không hợp lệ' })
  @Max(2026, { message: 'Năm xuất bản không được lớn hơn năm hiện tại' })
  publishYear!: number;

  @ApiProperty({
    description: 'Tổng số lượng bản in nhập về thư viện',
    example: 10,
    minimum: 1,
    default: 1,
  })
  @IsInt({ message: 'Tổng số lượng bản in phải là số nguyên' })
  @Min(1, { message: 'Số lượng sách nhập kho tối thiểu là 1 cuốn' })
  copiesTotal!: number;

  @ApiProperty({
    description: 'Vị trí kệ sách trong thư viện (Kệ - Tầng - Ô)',
    example: 'Kệ A3 - Tầng 2 - Ô 14',
  })
  @IsNotEmpty({ message: 'Vị trí kệ sách không được để trống' })
  @IsString({ message: 'Vị trí kệ sách phải là chuỗi ký tự' })
  shelfLocation!: string;

  @ApiPropertyOptional({
    description: 'Trạng thái sách trong thư viện',
    enum: BookStatus,
    default: BookStatus.AVAILABLE,
    example: BookStatus.AVAILABLE,
  })
  @IsOptional()
  @IsEnum(BookStatus, { message: 'Trạng thái sách không hợp lệ' })
  status?: BookStatus;

  @ApiPropertyOptional({
    description: 'Đường dẫn ảnh bìa sách',
    example: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c',
  })
  @IsOptional()
  @IsUrl({}, { message: 'Đường dẫn ảnh bìa phải là URL hợp lệ' })
  coverUrl?: string;

  @ApiProperty({
    description: 'Mô tả nội dung tóm tắt của cuốn sách',
    example: 'Tác phẩm hướng dẫn chi tiết cách tổ chức và viết mã nguồn phần mềm tinh gọn, dễ bảo trì.',
  })
  @IsNotEmpty({ message: 'Mô tả sách không được để trống' })
  @IsString({ message: 'Mô tả sách phải là chuỗi ký tự' })
  description!: string;
}
