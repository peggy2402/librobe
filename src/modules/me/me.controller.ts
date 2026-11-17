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
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { BorrowingSlipEntity } from '../borrowing-slips/entities/borrowing-slip.entity.js';
import { LoanRenewalHistory } from '../borrowings/entities/loan-renewal.entity.js';
import { Reservation } from '../reservations/entities/reservation.entity.js';
import {
  CancelMyRequestDto,
  CreateMyBorrowingSlipDto,
  CreateMyReservationDto,
  FilterMySlipDto,
  RenewMyBorrowingSlipDto,
} from './dto/me-request.dto.js';
import { MemberCardGuard } from './guards/member-card.guard.js';
import { MeService } from './me.service.js';
import type { MeActor } from './me.service.js';

@ApiTags('Me - Kênh Tự Phục Vụ cho Độc Giả (Mobile App)')
@ApiBearerAuth('JWT-auth')
@ApiUnauthorizedResponse({ description: 'Thiếu Bearer Token hoặc Token không hợp lệ/hết hạn' })
@ApiForbiddenResponse({ description: 'Tài khoản chưa được liên kết với thẻ độc giả nào' })
@Controller('me')
@UseGuards(JwtAuthGuard, MemberCardGuard)
export class MeController {
  constructor(private readonly meService: MeService) {}

  @Get('profile')
  @ApiOperation({
    summary: 'Hồ sơ thẻ độc giả của chính mình',
    description:
      'Trả về số thẻ, hạn thẻ, hạn mức mượn, số sách đang giữ, tổng nợ phạt và liệu có đủ điều kiện mượn tiếp. ' +
      'Dữ liệu luôn là của tài khoản đang đăng nhập — không có tham số nào để xem hồ sơ người khác.',
  })
  @ApiOkResponse({ description: 'Hồ sơ và tình trạng mượn của độc giả' })
  getProfile(@CurrentUser() user: MeActor) {
    return this.meService.getProfile(user);
  }

  // =========================================================================
  // Phiếu mượn
  // =========================================================================

  @Get('borrowing-slips')
  @ApiOperation({
    summary: 'Danh sách phiếu mượn của chính mình',
    description: 'Hỗ trợ phân trang và lọc theo trạng thái. Chỉ trả phiếu thuộc tài khoản đang đăng nhập.',
  })
  @ApiOkResponse({ description: 'Danh sách phiếu mượn kèm phân trang', type: [BorrowingSlipEntity] })
  listMySlips(@CurrentUser() user: MeActor, @Query() filters: FilterMySlipDto) {
    return this.meService.listMySlips(user, filters);
  }

  @Get('borrowing-slips/:id')
  @ApiOperation({
    summary: 'Chi tiết một phiếu mượn của chính mình',
    description: 'Phiếu không thuộc tài khoản đang đăng nhập sẽ trả 404 để không tiết lộ phiếu đó có tồn tại.',
  })
  @ApiParam({ name: 'id', description: 'Mã ID phiếu mượn', example: 'slip-01' })
  @ApiOkResponse({ description: 'Chi tiết phiếu mượn', type: BorrowingSlipEntity })
  @ApiNotFoundResponse({ description: 'Không tìm thấy phiếu mượn của bạn với ID này' })
  getMySlip(@CurrentUser() user: MeActor, @Param('id') id: string): Promise<BorrowingSlipEntity> {
    return this.meService.getMySlip(user, id);
  }

  @Post('borrowing-slips')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Tự lập phiếu mượn sách (nhiều cuốn trong một phiếu)',
    description:
      'Phiếu được tạo ở trạng thái PENDING_APPROVAL và chờ thủ thư duyệt tại quầy. Lập phiếu CHƯA trừ tồn kho. ' +
      'Thẻ độc giả lấy từ token: body không có field `memberId` nên không thể lập phiếu bằng thẻ người khác.',
  })
  @ApiCreatedResponse({ description: 'Đã tạo phiếu mượn chờ duyệt', type: BorrowingSlipEntity })
  @ApiBadRequestResponse({
    description:
      'Không đủ điều kiện mượn: thẻ hết hạn/bị khóa, đang có sách quá hạn, còn nợ tiền phạt, hoặc vượt hạn mức mượn',
  })
  @ApiConflictResponse({ description: 'Một hoặc nhiều cuốn sách không còn đủ số lượng khả dụng' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy cuốn sách yêu cầu' })
  createMySlip(
    @CurrentUser() user: MeActor,
    @Body() dto: CreateMyBorrowingSlipDto,
  ): Promise<BorrowingSlipEntity> {
    return this.meService.createMySlip(user, dto);
  }

  @Patch('borrowing-slips/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Tự hủy phiếu mượn đang chờ duyệt',
    description:
      'Chỉ hủy được phiếu ở trạng thái PENDING_APPROVAL. Phiếu đã duyệt nghĩa là sách đã rời kệ — ' +
      'phải mang sách đến quầy để thủ thư xử lý trả, không thể hủy từ ứng dụng.',
  })
  @ApiParam({ name: 'id', description: 'Mã ID phiếu mượn cần hủy', example: 'slip-01' })
  @ApiOkResponse({ description: 'Đã hủy phiếu mượn', type: BorrowingSlipEntity })
  @ApiBadRequestResponse({ description: 'Phiếu không còn ở trạng thái chờ duyệt' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy phiếu mượn của bạn với ID này' })
  cancelMySlip(
    @CurrentUser() user: MeActor,
    @Param('id') id: string,
    @Body() dto: CancelMyRequestDto,
  ): Promise<BorrowingSlipEntity> {
    return this.meService.cancelMySlip(user, id, dto);
  }

  @Patch('borrowing-slips/:id/renew')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Tự xin gia hạn phiếu mượn',
    description:
      'Gia hạn được chấp nhận ngay nếu thỏa chính sách thư viện: phiếu chưa quá hạn, chưa dùng hết số lần ' +
      'gia hạn (LOAN_RENEW_MAX_COUNT, mặc định 1 lần), và không cuốn nào trong phiếu đang có độc giả khác đặt trước.',
  })
  @ApiParam({ name: 'id', description: 'Mã ID phiếu mượn cần gia hạn', example: 'slip-01' })
  @ApiOkResponse({ description: 'Gia hạn thành công, dueDate đã cập nhật', type: BorrowingSlipEntity })
  @ApiBadRequestResponse({
    description: 'Phiếu đã quá hạn, đã trả xong, hoặc đã dùng hết số lần gia hạn cho phép',
  })
  @ApiConflictResponse({ description: 'Sách trong phiếu đang có độc giả khác đặt trước' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy phiếu mượn của bạn với ID này' })
  renewMySlip(
    @CurrentUser() user: MeActor,
    @Param('id') id: string,
    @Body() dto: RenewMyBorrowingSlipDto,
  ): Promise<BorrowingSlipEntity> {
    return this.meService.renewMySlip(user, id, dto);
  }

  @Get('borrowing-slips/:id/renewals')
  @ApiOperation({ summary: 'Lịch sử gia hạn của phiếu mượn của chính mình' })
  @ApiParam({ name: 'id', description: 'Mã ID phiếu mượn', example: 'slip-01' })
  @ApiOkResponse({ description: 'Danh sách lần gia hạn', type: [LoanRenewalHistory] })
  @ApiNotFoundResponse({ description: 'Không tìm thấy phiếu mượn của bạn với ID này' })
  getMySlipRenewals(@CurrentUser() user: MeActor, @Param('id') id: string) {
    return this.meService.getMySlipRenewals(user, id);
  }

  // =========================================================================
  // Lịch sử mượn lẻ & khoản phạt
  // =========================================================================

  @Get('borrowings')
  @ApiOperation({
    summary: 'Lịch sử mượn/trả theo phiếu lẻ của chính mình',
    description: 'Dữ liệu từ luồng phiếu mượn đơn (1 phiếu = 1 cuốn), phục vụ tra cứu lịch sử.',
  })
  @ApiOkResponse({ description: 'Danh sách phiếu mượn lẻ kèm phân trang' })
  listMyBorrowings(@CurrentUser() user: MeActor, @Query() filters: FilterMySlipDto) {
    return this.meService.listMyBorrowings(user, filters);
  }

  @Get('fines')
  @ApiOperation({
    summary: 'Khoản phạt chưa thanh toán của chính mình',
    description:
      'Tổng nợ phạt cộng từ cả hai luồng mượn, kèm chi tiết từng phiếu. ' +
      'Thanh toán được thực hiện tại quầy, ứng dụng chỉ tra cứu.',
  })
  @ApiOkResponse({ description: 'Tổng nợ phạt và chi tiết theo từng phiếu' })
  getMyFines(@CurrentUser() user: MeActor) {
    return this.meService.getMyFines(user);
  }

  // =========================================================================
  // Đặt trước
  // =========================================================================

  @Get('reservations')
  @ApiOperation({
    summary: 'Danh sách phiếu đặt trước của chính mình',
    description: 'Chỉ trả phiếu thuộc tài khoản đang đăng nhập.',
  })
  @ApiOkResponse({ description: 'Danh sách phiếu đặt trước kèm phân trang', type: [Reservation] })
  listMyReservations(@CurrentUser() user: MeActor, @Query() filters: FilterMySlipDto) {
    return this.meService.listMyReservations(user, filters);
  }

  @Post('reservations')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Tự đặt trước một cuốn sách',
    description:
      'Sách còn trên kệ thì phiếu ở trạng thái READY kèm hạn nhận sách; sách đã hết thì vào hàng đợi PENDING ' +
      'và tự chuyển READY khi có bản được trả về. Thẻ độc giả lấy từ token.',
  })
  @ApiCreatedResponse({ description: 'Đã tạo phiếu đặt trước', type: Reservation })
  @ApiBadRequestResponse({
    description: 'Thẻ không hợp lệ, sách ngừng lưu hành, hoặc đã đạt số phiếu đặt trước tối đa',
  })
  @ApiConflictResponse({ description: 'Bạn đã có phiếu đặt trước còn hiệu lực cho cuốn sách này' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy cuốn sách' })
  createMyReservation(
    @CurrentUser() user: MeActor,
    @Body() dto: CreateMyReservationDto,
  ): Promise<Reservation> {
    return this.meService.createMyReservation(user, dto);
  }

  @Patch('reservations/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Tự hủy phiếu đặt trước của chính mình',
    description: 'Phiếu không thuộc tài khoản đang đăng nhập sẽ trả 404.',
  })
  @ApiParam({ name: 'id', description: 'Mã ID phiếu đặt trước', example: 'rsv-01' })
  @ApiOkResponse({ description: 'Đã hủy phiếu đặt trước', type: Reservation })
  @ApiConflictResponse({ description: 'Phiếu đã hoàn tất, đã hủy hoặc đã hết hạn trước đó' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy phiếu đặt trước của bạn với ID này' })
  cancelMyReservation(
    @CurrentUser() user: MeActor,
    @Param('id') id: string,
    @Body() dto: CancelMyRequestDto,
  ): Promise<Reservation> {
    return this.meService.cancelMyReservation(user, id, dto);
  }
}
