import { ApiProperty } from '@nestjs/swagger';

export class Category {
  @ApiProperty({
    description: 'Mã định danh duy nhất của thể loại (UUID)',
    example: 'cat-01',
  })
  id!: string;

  @ApiProperty({
    description: 'Tên thể loại sách',
    example: 'Công nghệ thông tin & Lập trình',
  })
  name!: string;

  @ApiProperty({
    description: 'Mô tả chi tiết về thể loại sách',
    example: 'Các tài liệu, giáo trình và sách chuyên ngành về khoa học máy tính và kỹ thuật phần mềm.',
  })
  description!: string;

  @ApiProperty({
    description: 'Số lượng đầu sách thuộc thể loại này',
    example: 12,
  })
  bookCount!: number;

  @ApiProperty({
    description: 'Thời điểm tạo bản ghi',
    example: '2026-01-01T00:00:00.000Z',
  })
  createdAt!: Date;

  @ApiProperty({
    description: 'Thời điểm cập nhật bản ghi gần nhất',
    example: '2026-01-01T00:00:00.000Z',
  })
  updatedAt!: Date;
}
