import { ApiProperty } from '@nestjs/swagger';

export class TopBorrowedBookDto {
  @ApiProperty({ example: 'book-01' })
  bookId!: string;

  @ApiProperty({ example: 'Clean Code: A Handbook of Agile Software Craftsmanship' })
  title!: string;

  @ApiProperty({ example: 'Robert C. Martin (Uncle Bob)' })
  authorName!: string;

  @ApiProperty({ example: 14 })
  borrowCount!: number;
}

export class LibraryStatsDto {
  @ApiProperty({ description: 'Tổng số đầu sách trong thư viện', example: 150 })
  totalBooks!: number;

  @ApiProperty({ description: 'Tổng số lượng bản in sách thực tế', example: 520 })
  totalCopies!: number;

  @ApiProperty({ description: 'Số lượng bản in còn sẵn trong kho', example: 450 })
  availableCopies!: number;

  @ApiProperty({ description: 'Số lượng bản in hiện đang được mượn', example: 70 })
  borrowedCopies!: number;

  @ApiProperty({ description: 'Tổng số thể loại sách', example: 12 })
  totalCategories!: number;

  @ApiProperty({ description: 'Tổng số tác giả', example: 45 })
  totalAuthors!: number;

  @ApiProperty({ description: 'Tổng số lượng độc giả đăng ký', example: 320 })
  totalMembers!: number;

  @ApiProperty({ description: 'Số lượng độc giả có thẻ đang hoạt động', example: 295 })
  activeMembers!: number;

  @ApiProperty({ description: 'Tổng số giao dịch mượn sách', example: 890 })
  totalLoans!: number;

  @ApiProperty({ description: 'Số lượt mượn sách đang diễn ra', example: 48 })
  activeLoans!: number;

  @ApiProperty({ description: 'Số lượt mượn sách đang bị trễ hạn', example: 5 })
  overdueLoans!: number;

  @ApiProperty({ description: 'Tổng số tiền phạt quá hạn phát sinh (VNĐ)', example: 250000 })
  totalFines!: number;

  @ApiProperty({ description: 'Tổng số tiền phạt đã thu về (VNĐ)', example: 180000 })
  finesCollected!: number;

  @ApiProperty({
    description: 'Danh sách 5 cuốn sách được mượn nhiều nhất',
    type: [TopBorrowedBookDto],
  })
  topBorrowedBooks!: TopBorrowedBookDto[];
}
