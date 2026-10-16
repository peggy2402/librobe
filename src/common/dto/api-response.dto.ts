import { ApiProperty } from '@nestjs/swagger';

export class MessageResponseDto {
  @ApiProperty({
    description: 'Trạng thái xử lý thành công',
    example: true,
  })
  success!: boolean;

  @ApiProperty({
    description: 'Thông báo kết quả thực hiện',
    example: 'Thao tác đã được thực hiện thành công',
  })
  message!: string;

  @ApiProperty({
    description: 'Thời điểm phản hồi (ISO 8601)',
    example: '2026-10-16T12:00:00.000Z',
  })
  timestamp!: string;
}

export class ErrorResponseDto {
  @ApiProperty({ example: 400 })
  statusCode!: number;

  @ApiProperty({
    example: 'Bad Request',
    description: 'Loại lỗi HTTP',
  })
  error!: string;

  @ApiProperty({
    example: 'Thông tin dữ liệu gửi lên không hợp lệ',
    description: 'Chi tiết thông báo lỗi',
  })
  message!: string | string[];

  @ApiProperty({
    example: '2026-10-16T12:00:00.000Z',
  })
  timestamp!: string;

  @ApiProperty({
    example: '/api/books',
  })
  path!: string;
}
