import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CancelReservationDto } from './dto/cancel-reservation.dto.js';
import { CreateReservationDto } from './dto/create-reservation.dto.js';
import { FilterReservationDto } from './dto/filter-reservation.dto.js';
import { Reservation } from './entities/reservation.entity.js';
import { ReservationsService } from './reservations.service.js';

@ApiTags('Reservations - Đặt trước (Giữ chỗ) Sách')
@ApiBearerAuth('JWT-auth')
@ApiUnauthorizedResponse({ description: 'Thiếu Bearer Token hoặc Token không hợp lệ/hết hạn' })
@Controller('reservations')
@UseGuards(JwtAuthGuard)
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Get()
  @ApiOperation({
    summary: 'Lấy danh sách phiếu đặt trước sách',
    description:
      'Hỗ trợ phân trang, tìm kiếm theo số phiếu / tên độc giả / tựa sách và lọc theo memberId, bookId, status.',
  })
  @ApiOkResponse({ description: 'Danh sách phiếu đặt trước kèm phân trang', type: [Reservation] })
  findAll(@Query() filters: FilterReservationDto) {
    return this.reservationsService.findAll(filters);
  }

  @Get('book/:bookId/queue')
  @ApiOperation({
    summary: 'Hàng đợi đặt trước của một cuốn sách',
    description:
      'Trả về các phiếu đặt trước còn hiệu lực (PENDING, READY) theo thứ tự đăng ký. Thủ thư dùng để quyết định cho gia hạn hay thu hồi sách.',
  })
  @ApiParam({ name: 'bookId', description: 'Mã ID cuốn sách', example: 'book-01' })
  @ApiOkResponse({ description: 'Hàng đợi đặt trước của cuốn sách', type: [Reservation] })
  @ApiNotFoundResponse({ description: 'Không tìm thấy cuốn sách' })
  findQueueByBook(@Param('bookId') bookId: string): Promise<Reservation[]> {
    return this.reservationsService.findQueueByBook(bookId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lấy chi tiết một phiếu đặt trước' })
  @ApiParam({ name: 'id', description: 'Mã ID phiếu đặt trước', example: 'rsv-01' })
  @ApiOkResponse({ description: 'Chi tiết phiếu đặt trước', type: Reservation })
  @ApiNotFoundResponse({ description: 'Không tìm thấy phiếu đặt trước' })
  findOne(@Param('id') id: string): Promise<Reservation> {
    return this.reservationsService.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Đặt trước (giữ chỗ) một cuốn sách',
    description:
      'Nếu sách còn trên kệ, phiếu được tạo ở trạng thái READY kèm hạn nhận sách. Nếu sách đã được mượn hết, phiếu vào hàng đợi ở trạng thái PENDING và sẽ tự chuyển READY khi có bản sách được trả về.',
  })
  @ApiCreatedResponse({ description: 'Đã tạo phiếu đặt trước', type: Reservation })
  @ApiBadRequestResponse({
    description: 'Thẻ độc giả không hợp lệ, sách ngừng lưu hành hoặc vượt số phiếu đặt trước tối đa',
  })
  @ApiConflictResponse({ description: 'Độc giả đã có phiếu đặt trước còn hiệu lực cho sách này' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy độc giả hoặc cuốn sách' })
  create(@Body() dto: CreateReservationDto): Promise<Reservation> {
    return this.reservationsService.create(dto);
  }

  @Patch(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Hủy phiếu đặt trước',
    description: 'Chỉ hủy được phiếu còn hiệu lực (PENDING hoặc READY).',
  })
  @ApiParam({ name: 'id', description: 'Mã ID phiếu đặt trước cần hủy', example: 'rsv-01' })
  @ApiOkResponse({ description: 'Đã hủy phiếu đặt trước', type: Reservation })
  @ApiConflictResponse({ description: 'Phiếu đã hoàn tất / đã hủy / đã hết hạn trước đó' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy phiếu đặt trước' })
  cancel(@Param('id') id: string, @Body() dto: CancelReservationDto): Promise<Reservation> {
    return this.reservationsService.cancel(id, dto);
  }
}
