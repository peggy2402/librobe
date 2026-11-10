import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto.js';
import { ReservationStatus } from '../../../common/enums/reservation-status.enum.js';

export class FilterReservationDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Lọc phiếu đặt trước theo mã độc giả',
    example: 'mem-02',
  })
  @IsOptional()
  @IsString()
  memberId?: string;

  @ApiPropertyOptional({
    description: 'Lọc phiếu đặt trước theo mã cuốn sách',
    example: 'book-01',
  })
  @IsOptional()
  @IsString()
  bookId?: string;

  @ApiPropertyOptional({
    description: 'Lọc theo trạng thái phiếu đặt trước',
    enum: ReservationStatus,
    example: ReservationStatus.PENDING,
  })
  @IsOptional()
  @IsEnum(ReservationStatus, { message: 'Trạng thái phiếu đặt trước không hợp lệ' })
  status?: ReservationStatus;
}
