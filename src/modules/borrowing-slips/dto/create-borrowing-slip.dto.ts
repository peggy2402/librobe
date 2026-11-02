import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class BorrowingItemRequestDto {
  @ApiProperty({
    description: 'Mã ID của cuốn sách cần mượn',
    example: 'book-01',
  })
  @IsNotEmpty({ message: 'Mã sách không được để trống' })
  @IsString({ message: 'Mã sách phải là chuỗi' })
  bookId!: string;

  @ApiProperty({
    description: 'Số lượng cuốn cần mượn của đầu sách này',
    example: 1,
    minimum: 1,
    default: 1,
  })
  @IsInt({ message: 'Số lượng sách phải là số nguyên' })
  @Min(1, { message: 'Số lượng mượn tối thiểu là 1 cuốn' })
  @Max(5, { message: 'Số lượng mượn tối đa cho một đầu sách là 5 cuốn' })
  quantity!: number;
}

export class CreateBorrowingSlipDto {
  @ApiProperty({
    description: 'Mã ID của độc giả lập phiếu mượn',
    example: 'mem-01',
  })
  @IsNotEmpty({ message: 'Mã độc giả không được để trống' })
  @IsString({ message: 'Mã độc giả phải là chuỗi' })
  memberId!: string;

  @ApiProperty({
    description: 'Danh sách các dòng sách cần mượn trong đơn (Master - Detail)',
    type: [BorrowingItemRequestDto],
  })
  @IsArray({ message: 'Danh sách sách mượn phải là mảng' })
  @ArrayMinSize(1, { message: 'Phiếu mượn phải chứa ít nhất 1 đầu sách' })
  @ValidateNested({ each: true })
  @Type(() => BorrowingItemRequestDto)
  items!: BorrowingItemRequestDto[];

  @ApiPropertyOptional({
    description: 'Thời hạn mượn tính theo số ngày (mặc định 14 ngày, tối đa 30 ngày)',
    example: 14,
    default: 14,
  })
  @IsOptional()
  @IsInt({ message: 'Số ngày mượn phải là số nguyên' })
  @Min(1, { message: 'Thời hạn mượn tối thiểu là 1 ngày' })
  @Max(30, { message: 'Thời hạn mượn tối đa là 30 ngày' })
  expectedReturnDays?: number;

  @ApiPropertyOptional({
    description: 'Ghi chú thêm về mục đích mượn hoặc tình trạng bàn giao',
    example: 'Mượn phục vụ nghiên cứu đề tài đồ án tốt nghiệp',
  })
  @IsOptional()
  @IsString({ message: 'Ghi chú phải là chuỗi ký tự' })
  notes?: string;
}

