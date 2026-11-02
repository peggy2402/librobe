import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BorrowingItemStatus, BorrowingSlipStatus, ReturnCondition } from '@prisma/client';

export class BorrowingSlipItemEntity {
  @ApiProperty({
    description: 'Mã ID của dòng chi tiết mượn sách',
    example: 'item-01',
  })
  id!: string;

  @ApiProperty({
    description: 'Mã ID của phiếu mượn cha',
    example: 'slip-01',
  })
  slipId!: string;

  @ApiProperty({
    description: 'Mã ID của cuốn sách',
    example: 'book-01',
  })
  bookId!: string;

  @ApiProperty({
    description: 'Tựa đề cuốn sách',
    example: 'Clean Code',
  })
  bookTitle!: string;

  @ApiProperty({
    description: 'Số lượng sách mượn của dòng này',
    example: 1,
  })
  quantity!: number;

  @ApiProperty({
    description: 'Số lượng sách đã hoàn trả về kho',
    example: 0,
  })
  returnedQuantity!: number;

  @ApiProperty({
    description: 'Số lượng sách bị báo mất hoặc hư hỏng nặng',
    example: 0,
  })
  lostQuantity!: number;

  @ApiProperty({
    description: 'Đơn giá sách tại thời điểm lập phiếu (VNĐ)',
    example: 250000,
  })
  bookPrice!: number;

  @ApiProperty({
    description: 'Trạng thái của dòng mượn sách',
    enum: BorrowingItemStatus,
    example: BorrowingItemStatus.BORROWING,
  })
  status!: BorrowingItemStatus;

  @ApiPropertyOptional({
    description: 'Ngày hoàn trả thực tế',
    example: '2026-11-02T08:30:00.000Z',
  })
  returnDate?: Date;

  @ApiPropertyOptional({
    description: 'Tình trạng sách khi hoàn trả',
    enum: ReturnCondition,
    example: ReturnCondition.GOOD,
  })
  returnCondition?: ReturnCondition;

  @ApiProperty({
    description: 'Tiền phạt hoặc bồi thường tính riêng cho dòng này (VNĐ)',
    example: 0,
  })
  fineAmount!: number;

  @ApiPropertyOptional({
    description: 'Ghi chú thêm',
    example: 'Sách bìa hơi sờn',
  })
  notes?: string;

  @ApiProperty({
    description: 'Thời điểm tạo dòng chi tiết',
  })
  createdAt!: Date;

  @ApiProperty({
    description: 'Thời điểm cập nhật dòng chi tiết',
  })
  updatedAt!: Date;
}

export class BorrowingSlipEntity {
  @ApiProperty({
    description: 'Mã định danh duy nhất của phiếu mượn',
    example: 'slip-01',
  })
  id!: string;

  @ApiProperty({
    description: 'Số chứng từ phiếu mượn (định dạng SLIP-YYYY-XXXX)',
    example: 'SLIP-2026-0001',
  })
  slipNumber!: string;

  @ApiProperty({
    description: 'Mã ID của độc giả',
    example: 'mem-01',
  })
  memberId!: string;

  @ApiProperty({
    description: 'Họ và tên của độc giả',
    example: 'Nguyễn Văn A',
  })
  memberName!: string;

  @ApiProperty({
    description: 'Số thẻ thư viện của độc giả',
    example: 'LIB-2026-0001',
  })
  memberCardNumber!: string;

  @ApiProperty({
    description: 'Trạng thái vòng đời chứng từ',
    enum: BorrowingSlipStatus,
    example: BorrowingSlipStatus.PENDING_APPROVAL,
  })
  status!: BorrowingSlipStatus;

  @ApiPropertyOptional({
    description: 'Ngày bắt đầu mượn / xuất kho',
    example: '2026-11-02T08:30:00.000Z',
  })
  borrowDate?: Date;

  @ApiProperty({
    description: 'Ngày hẹn trả chót của toàn bộ phiếu',
    example: '2026-11-16T08:30:00.000Z',
  })
  dueDate!: Date;

  @ApiPropertyOptional({
    description: 'Thời điểm thủ thư phê duyệt xuất kho',
  })
  approvedAt?: Date;

  @ApiPropertyOptional({
    description: 'Người phê duyệt',
    example: 'admin@librobe.vn',
  })
  approvedBy?: string;

  @ApiPropertyOptional({
    description: 'Lý do từ chối phiếu (nếu có)',
  })
  rejectReason?: string;

  @ApiPropertyOptional({
    description: 'Lý do hủy phiếu (nếu có)',
  })
  cancelReason?: string;

  @ApiPropertyOptional({
    description: 'Ghi chú chung của phiếu mượn',
  })
  notes?: string;

  @ApiProperty({
    description: 'Tổng tiền phạt quá hạn và bồi thường mất mát (VNĐ)',
    example: 0,
  })
  totalFine!: number;

  @ApiProperty({
    description: 'Trạng thái đã thanh toán tiền phạt hay chưa',
    example: false,
  })
  finePaid!: boolean;

  @ApiProperty({
    description: 'Danh sách các dòng sách chi tiết trong phiếu (Master - Detail)',
    type: [BorrowingSlipItemEntity],
  })
  items!: BorrowingSlipItemEntity[];

  @ApiProperty({
    description: 'Thời điểm tạo phiếu',
  })
  createdAt!: Date;

  @ApiProperty({
    description: 'Thời điểm cập nhật phiếu gần nhất',
  })
  updatedAt!: Date;
}

