import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { BorrowingSlipStatus } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto.js';

/**
 * Các DTO của nhóm `/api/me/*` CỐ TÌNH không có field `memberId`.
 *
 * `memberId` luôn được lấy từ JWT. Nhờ vậy không tồn tại đường nào để client
 * mobile khai thẻ độc giả của người khác — nếu có gửi kèm `memberId` thì
 * ValidationPipe (`whitelist: true`) sẽ loại bỏ im lặng.
 */

export class MyBorrowingItemDto {
  @ApiProperty({ description: 'Mã cuốn sách muốn mượn', example: 'book-01' })
  @IsNotEmpty({ message: 'Mã sách không được để trống' })
  @IsString({ message: 'Mã sách phải là chuỗi ký tự' })
  bookId!: string;

  @ApiProperty({ description: 'Số lượng bản sách muốn mượn', example: 1, minimum: 1 })
  @IsInt({ message: 'Số lượng phải là số nguyên' })
  @Min(1, { message: 'Số lượng tối thiểu là 1' })
  quantity!: number;
}

export class CreateMyBorrowingSlipDto {
  @ApiProperty({
    description: 'Danh sách sách muốn mượn trong cùng một phiếu',
    type: [MyBorrowingItemDto],
  })
  @IsArray({ message: 'Danh sách sách phải là mảng' })
  @ArrayMinSize(1, { message: 'Cần chọn ít nhất 1 cuốn sách' })
  @ValidateNested({ each: true })
  @Type(() => MyBorrowingItemDto)
  items!: MyBorrowingItemDto[];

  @ApiPropertyOptional({
    description: 'Số ngày dự kiến mượn. Bỏ trống dùng cấu hình LOAN_DEFAULT_DAYS (14 ngày)',
    example: 14,
  })
  @IsOptional()
  @IsInt({ message: 'Số ngày mượn phải là số nguyên' })
  @Min(1, { message: 'Thời hạn mượn tối thiểu 1 ngày' })
  @Max(365, { message: 'Thời hạn mượn yêu cầu không hợp lệ' })
  expectedReturnDays?: number;

  @ApiPropertyOptional({ description: 'Ghi chú của độc giả', example: 'Đặt từ mobile app' })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Ghi chú tối đa 500 ký tự' })
  notes?: string;
}

export class CreateMyReservationDto {
  @ApiProperty({ description: 'Mã cuốn sách muốn đặt trước', example: 'book-01' })
  @IsNotEmpty({ message: 'Mã sách không được để trống' })
  @IsString({ message: 'Mã sách phải là chuỗi ký tự' })
  bookId!: string;

  @ApiPropertyOptional({ description: 'Ghi chú', example: 'Cần cho kỳ thi cuối khóa' })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Ghi chú tối đa 500 ký tự' })
  notes?: string;
}

export class CancelMyRequestDto {
  @ApiPropertyOptional({
    description: 'Lý do hủy. Bỏ trống sẽ ghi "Độc giả tự hủy qua ứng dụng"',
    example: 'Đổi ý, không cần mượn nữa',
  })
  @IsOptional()
  @IsString({ message: 'Lý do hủy phải là chuỗi ký tự' })
  @MaxLength(500, { message: 'Lý do hủy tối đa 500 ký tự' })
  reason?: string;
}

export class RenewMyBorrowingSlipDto {
  @ApiPropertyOptional({
    description: 'Số ngày xin gia hạn. Bỏ trống dùng cấu hình LOAN_RENEW_DAYS (7 ngày)',
    example: 7,
  })
  @IsOptional()
  @IsInt({ message: 'Số ngày gia hạn phải là số nguyên' })
  @Min(1, { message: 'Thời gian gia hạn tối thiểu 1 ngày' })
  @Max(90, { message: 'Số ngày gia hạn yêu cầu không hợp lệ' })
  extraDays?: number;

  @ApiPropertyOptional({ description: 'Lý do xin gia hạn' })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Lý do gia hạn tối đa 500 ký tự' })
  notes?: string;
}

export class FilterMySlipDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Lọc theo trạng thái phiếu mượn',
    enum: BorrowingSlipStatus,
  })
  @IsOptional()
  @IsEnum(BorrowingSlipStatus, { message: 'Trạng thái phiếu mượn không hợp lệ' })
  status?: BorrowingSlipStatus;
}
