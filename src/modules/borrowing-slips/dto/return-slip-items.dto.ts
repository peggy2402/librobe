import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReturnCondition } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class ReturnSlipSingleItemDto {
  @ApiProperty({
    description: 'Mã ID của dòng chi tiết sách trong phiếu (itemId)',
    example: 'item-01',
  })
  @IsNotEmpty({ message: 'Mã dòng chi tiết không được để trống' })
  @IsString({ message: 'Mã dòng chi tiết phải là chuỗi' })
  itemId!: string;

  @ApiPropertyOptional({
    description: 'Số lượng trả trong đợt này (mặc định là 1)',
    example: 1,
    default: 1,
  })
  @IsOptional()
  @IsInt({ message: 'Số lượng sách trả phải là số nguyên' })
  @Min(1, { message: 'Số lượng sách trả tối thiểu là 1' })
  quantity?: number;

  @ApiProperty({
    description: 'Tình trạng sách khi tiếp nhận (GOOD: bình thường hoàn kho, LOST: mất mát bồi thường giá trị, DAMAGED: hư hỏng)',
    enum: ReturnCondition,
    example: ReturnCondition.GOOD,
  })
  @IsEnum(ReturnCondition, { message: 'Tình trạng sách trả không hợp lệ (chọn GOOD, LOST hoặc DAMAGED)' })
  returnCondition!: ReturnCondition;

  @ApiPropertyOptional({
    description: 'Ghi chú về tình trạng vật lý của cuốn sách khi nhận lại',
    example: 'Sách nguyên vẹn, không rách nát',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class ReturnSlipItemsDto {
  @ApiProperty({
    description: 'Danh sách các cuốn sách mang đến trả trong đợt này',
    type: [ReturnSlipSingleItemDto],
  })
  @IsArray({ message: 'Danh sách sách trả phải là mảng' })
  @ArrayMinSize(1, { message: 'Cần chọn ít nhất 1 cuốn sách để thực hiện hoàn trả' })
  @ValidateNested({ each: true })
  @Type(() => ReturnSlipSingleItemDto)
  items!: ReturnSlipSingleItemDto[];

  @ApiPropertyOptional({
    description: 'Xác nhận độc giả đã thanh toán toàn bộ số tiền phạt và đền bù phát sinh ngay tại quầy',
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean({ message: 'isPaidNow phải là kiểu boolean' })
  isPaidNow?: boolean;

  @ApiPropertyOptional({
    description: 'Ghi chú biên bản trả sách',
    example: 'Độc giả hoàn trả trước 2 cuốn, cuốn còn lại tiếp tục mượn',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}

