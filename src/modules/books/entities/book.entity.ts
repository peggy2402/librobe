import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BookStatus } from '../../../common/enums/book-status.enum.js';

export class Book {
  @ApiProperty({
    description: 'Mã định danh duy nhất của cuốn sách',
    example: 'book-01',
  })
  id!: string;

  @ApiProperty({
    description: 'Mã số tiêu chuẩn quốc tế cho sách (ISBN-10 hoặc ISBN-13)',
    example: '978-0132350884',
  })
  isbn!: string;

  @ApiProperty({
    description: 'Tiêu đề / Tựa đề cuốn sách',
    example: 'Clean Code: A Handbook of Agile Software Craftsmanship',
  })
  title!: string;

  @ApiProperty({
    description: 'ID của tác giả chính',
    example: 'auth-01',
  })
  authorId!: string;

  @ApiProperty({
    description: 'Tên tác giả chính',
    example: 'Robert C. Martin',
  })
  authorName!: string;

  @ApiProperty({
    description: 'ID thể loại sách',
    example: 'cat-01',
  })
  categoryId!: string;

  @ApiProperty({
    description: 'Tên thể loại sách',
    example: 'Công nghệ thông tin & Lập trình',
  })
  categoryName!: string;

  @ApiProperty({
    description: 'Nhà xuất bản',
    example: 'Prentice Hall',
  })
  publisher!: string;

  @ApiProperty({
    description: 'Năm xuất bản',
    example: 2008,
  })
  publishYear!: number;

  @ApiProperty({
    description: 'Tổng số lượng bản in thư viện sở hữu',
    example: 10,
  })
  copiesTotal!: number;

  @ApiProperty({
    description: 'Số lượng bản in hiện còn sẵn trong kho để mượn',
    example: 7,
  })
  copiesAvailable!: number;

  @ApiProperty({
    description: 'Vị trí lưu trữ trong thư viện (Kệ - Tầng - Ngăn)',
    example: 'Kệ A3 - Tầng 2 - Ô 14',
  })
  shelfLocation!: string;

  @ApiProperty({
    description: 'Trạng thái hiện tại của sách',
    enum: BookStatus,
    example: BookStatus.AVAILABLE,
  })
  status!: BookStatus;

  @ApiPropertyOptional({
    description: 'Đường dẫn ảnh bìa sách',
    example: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c',
  })
  coverUrl?: string;

  @ApiProperty({
    description: 'Mô tả tóm tắt nội dung cuốn sách',
    example: 'Cuốn sách kinh điển hướng dẫn các kỹ thuật viết code sạch, dễ bảo trì và mở rộng cho lập trình viên.',
  })
  description!: string;

  @ApiProperty({
    description: 'Thời điểm nhập sách vào hệ thống',
    example: '2026-01-10T08:00:00.000Z',
  })
  createdAt!: Date;

  @ApiProperty({
    description: 'Thời điểm cập nhật thông tin sách',
    example: '2026-01-10T08:00:00.000Z',
  })
  updatedAt!: Date;
}
