import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RejectBorrowingSlipDto {
  @ApiProperty({
    description: 'Lý do từ chối phê duyệt phiếu mượn',
    example: 'Độc giả chưa hoàn tất thủ tục bàn giao sách của đợt mượn trước',
    maxLength: 500,
  })
  @IsNotEmpty({ message: 'Lý do từ chối không được để trống' })
  @IsString({ message: 'Lý do từ chối phải là chuỗi' })
  @MaxLength(500, { message: 'Lý do từ chối không được vượt quá 500 ký tự' })
  reason!: string;
}

export class CancelBorrowingSlipDto {
  @ApiProperty({
    description: 'Lý do hủy bỏ phiếu mượn',
    example: 'Độc giả đổi ý không muốn mượn nữa',
    maxLength: 500,
  })
  @IsNotEmpty({ message: 'Lý do hủy phiếu không được để trống' })
  @IsString({ message: 'Lý do hủy phiếu phải là chuỗi' })
  @MaxLength(500, { message: 'Lý do hủy phiếu không được vượt quá 500 ký tự' })
  reason!: string;
}

