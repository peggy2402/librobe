import { ApiProperty } from '@nestjs/swagger';

export class BorrowLimitDetailsDto {
  @ApiProperty({ type: 'integer', minimum: 0, example: 5 })
  maxBorrowLimit!: number;

  @ApiProperty({ type: 'integer', minimum: 0, example: 3 })
  currentBorrowedCount!: number;

  @ApiProperty({ type: 'integer', minimum: 1, example: 3 })
  requestedQuantity!: number;

  @ApiProperty({ type: 'integer', minimum: 0, example: 2 })
  remainingBorrowLimit!: number;
}

export class BorrowLimitErrorDto {
  @ApiProperty({ type: 'integer', enum: [409], example: 409 })
  statusCode!: number;

  @ApiProperty({
    type: String,
    enum: ['BORROW_LIMIT_EXCEEDED'],
    example: 'BORROW_LIMIT_EXCEEDED',
  })
  code!: string;

  @ApiProperty({ type: String, example: 'Vượt hạn mức mượn sách' })
  message!: string;

  @ApiProperty({ type: BorrowLimitDetailsDto })
  details!: BorrowLimitDetailsDto;
}
