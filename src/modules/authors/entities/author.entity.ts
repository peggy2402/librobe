import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class Author {
  @ApiProperty({
    description: 'Mã định danh duy nhất của tác giả',
    example: 'auth-01',
  })
  id!: string;

  @ApiProperty({
    description: 'Họ và tên tác giả',
    example: 'Robert C. Martin',
  })
  name!: string;

  @ApiProperty({
    description: 'Tiểu sử tóm tắt của tác giả',
    example: 'Kỹ sư phần mềm nổi tiếng thế giới, tác giả của Clean Code và Clean Architecture.',
  })
  biography!: string;

  @ApiProperty({
    description: 'Quốc tịch',
    example: 'Mỹ',
  })
  nationality!: string;

  @ApiPropertyOptional({
    description: 'Năm sinh',
    example: 1952,
  })
  birthYear?: number;

  @ApiProperty({
    description: 'Tổng số sách của tác giả có trong thư viện',
    example: 5,
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
