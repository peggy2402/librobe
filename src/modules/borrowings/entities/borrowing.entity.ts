import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BorrowingStatus } from '../../../common/enums/borrowing-status.enum.js';

export class Borrowing {
  @ApiProperty({
    description: 'Mã định danh duy nhất của lượt mượn trả',
    example: 'brw-01',
  })
  id!: string;

  @ApiProperty({
    description: 'Mã phiếu mượn sách',
    example: 'BRW-2026-0001',
  })
  transactionCode!: string;

  @ApiProperty({
    description: 'ID độc giả mượn sách',
    example: 'mem-01',
  })
  memberId!: string;

  @ApiProperty({
    description: 'Tên độc giả mượn sách',
    example: 'Nguyễn Văn An',
  })
  memberName!: string;

  @ApiProperty({
    description: 'ID cuốn sách được mượn',
    example: 'book-01',
  })
  bookId!: string;

  @ApiProperty({
    description: 'Tựa đề cuốn sách được mượn',
    example: 'Clean Code: A Handbook of Agile Software Craftsmanship',
  })
  bookTitle!: string;

  @ApiProperty({
    description: 'Ngày mượn sách',
    example: '2026-10-01T08:00:00.000Z',
  })
  borrowDate!: Date;

  @ApiProperty({
    description: 'Hạn chót phải trả sách',
    example: '2026-10-15T08:00:00.000Z',
  })
  dueDate!: Date;

  @ApiPropertyOptional({
    description: 'Ngày thực tế trả sách (nếu đã trả)',
    example: '2026-10-14T10:30:00.000Z',
  })
  returnDate?: Date;

  @ApiProperty({
    description: 'Số lần đã gia hạn mượn (tối đa 2 lần)',
    example: 0,
  })
  renewCount!: number;

  @ApiProperty({
    description: 'Số tiền phạt quá hạn phát sinh (VNĐ) (5.000 VNĐ / ngày trễ)',
    example: 0,
  })
  fineAmount!: number;

  @ApiProperty({
    description: 'Trạng thái nộp phạt đã hoàn tất hay chưa',
    example: false,
  })
  finePaid!: boolean;

  @ApiPropertyOptional({
    description: 'Ghi chú thêm về tình trạng sách lúc mượn/trả',
    example: 'Sách mới, gáy tốt, độc giả cam kết bảo quản cẩn thận.',
  })
  notes?: string;

  @ApiProperty({
    description: 'Trạng thái lượt mượn',
    enum: BorrowingStatus,
    example: BorrowingStatus.BORROWED,
  })
  status!: BorrowingStatus;

  @ApiProperty({
    description: 'Thời điểm tạo bản ghi phiếu mượn',
    example: '2026-10-01T08:00:00.000Z',
  })
  createdAt!: Date;

  @ApiProperty({
    description: 'Thời điểm cập nhật bản ghi phiếu mượn gần nhất',
    example: '2026-10-01T08:00:00.000Z',
  })
  updatedAt!: Date;
}
