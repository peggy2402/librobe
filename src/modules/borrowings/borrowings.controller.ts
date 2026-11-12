import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiConflictResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { BorrowingsService } from './borrowings.service.js';
import { BorrowBookDto } from './dto/borrow-book.dto.js';
import { FilterBorrowingDto } from './dto/filter-borrowing.dto.js';
import { RenewLoanDto } from './dto/renew-loan.dto.js';
import { ReturnBookDto } from './dto/return-book.dto.js';
import { Borrowing, BorrowingDetail } from './entities/borrowing.entity.js';
import { LoanRenewalHistory } from './entities/loan-renewal.entity.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { RenewalActor } from '../loan-policy/loan-eligibility.service.js';

@ApiTags('Borrowings - Quản lý Mượn / Trả Sách')
@ApiBearerAuth('JWT-auth')
@ApiUnauthorizedResponse({
  description: 'Thiếu Bearer Token hoặc Token không hợp lệ/hết hạn',
})
@Controller('borrowings')
@UseGuards(JwtAuthGuard)
export class BorrowingsController {
  constructor(private readonly borrowingsService: BorrowingsService) {}

  @Get()
  @ApiOperation({
    summary: 'Lấy danh sách các phiếu mượn sách',
    description:
      'Hỗ trợ phân trang, tìm kiếm theo tên độc giả, tựa đề sách hoặc mã giao dịch, lọc theo memberId, bookId, status và cờ quá hạn.',
  })
  @ApiOkResponse({
    description: 'Danh sách phiếu mượn kèm thông tin phân trang',
    type: [Borrowing],
  })
  findAll(@Query() filters: FilterBorrowingDto) {
    return this.borrowingsService.findAll(filters);
  }

  @Get('overdue')
  @ApiOperation({
    summary: 'Danh sách các lượt mượn sách đã quá hạn chót trả',
    description:
      'Tra cứu toàn bộ phiếu mượn trễ hạn cùng số tiền phạt tích lũy để thủ thư tiến hành gửi thông báo đôn đốc thu hồi sách.',
  })
  @ApiOkResponse({
    description: 'Danh sách các phiếu mượn quá hạn',
    type: [Borrowing],
  })
  getOverdueLoans(): Promise<Borrowing[]> {
    return this.borrowingsService.getOverdueLoans();
  }

  @Get('fines/unpaid')
  @ApiOperation({
    summary: 'Danh sách khoản phạt chưa thanh toán',
    description:
      'Liệt kê các phiếu mượn còn nợ tiền phạt kèm tổng số tiền. Lọc theo một độc giả bằng query `memberId`. ' +
      'Khoản phạt tồn tại độc lập với việc sách đã được trả hay chưa.',
  })
  @ApiQuery({
    name: 'memberId',
    required: false,
    description: 'Chỉ lấy khoản phạt của một độc giả',
    example: 'mem-01',
  })
  @ApiOkResponse({
    description: 'Tổng tiền phạt chưa thu và danh sách phiếu mượn liên quan',
  })
  getUnpaidFines(@Query('memberId') memberId?: string) {
    return this.borrowingsService.getUnpaidFines(memberId);
  }

  @Get(':id/renewals')
  @ApiOperation({
    summary: 'Lịch sử gia hạn của một phiếu mượn',
    description:
      'Trả về audit trail từng lần gia hạn: hạn trả cũ, hạn trả mới, số ngày, người thực hiện.',
  })
  @ApiParam({
    name: 'id',
    description: 'Mã ID của phiếu mượn',
    example: 'brw-01',
  })
  @ApiOkResponse({
    description: 'Danh sách lần gia hạn',
    type: [LoanRenewalHistory],
  })
  @ApiNotFoundResponse({ description: 'Không tìm thấy phiếu mượn' })
  getRenewalHistory(@Param('id') id: string): Promise<LoanRenewalHistory[]> {
    return this.borrowingsService.getRenewalHistory(id);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Lấy chi tiết một phiếu mượn sách',
    description:
      'Trả về chi tiết phiếu mượn và canRenew, reasonCode, message theo người gọi và chính sách gia hạn hiện tại.',
  })
  @ApiParam({
    name: 'id',
    description: 'Mã ID của phiếu mượn (ví dụ: brw-01)',
    example: 'brw-01',
  })
  @ApiOkResponse({
    description: 'Chi tiết phiếu mượn',
    type: BorrowingDetail,
  })
  @ApiNotFoundResponse({
    description: 'Không tìm thấy phiếu mượn',
  })
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: RenewalActor,
  ): Promise<BorrowingDetail> {
    return this.borrowingsService.findOne(id, user);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Mượn sách (Tạo phiếu mượn mới)',
    description:
      'Kiểm tra tính hợp lệ của thẻ độc giả (ACTIVE, còn hạn, không nợ quá hạn, chưa vượt giới hạn mượn), kiểm tra sách còn trong kho, trừ kho và sinh mã phiếu mượn.',
  })
  @ApiCreatedResponse({
    description: 'Phiếu mượn đã được tạo thành công, sách đã xuất kho',
    type: Borrowing,
  })
  @ApiBadRequestResponse({
    description:
      'Độc giả không đủ điều kiện: thẻ không ACTIVE, thẻ hết hạn, đang có sách quá hạn, còn nợ tiền phạt, ' +
      'vượt hạn mức mượn, hoặc sách đã hết bản khả dụng tại thời điểm nhận request',
  })
  @ApiConflictResponse({
    description:
      'Tranh chấp tồn kho: bản sách cuối cùng vừa bị độc giả khác mượn trong lúc giao dịch đang xử lý. ' +
      'Toàn bộ giao dịch đã được rollback (không tạo phiếu, không trừ kho)',
  })
  @ApiNotFoundResponse({
    description: 'Không tìm thấy độc giả hoặc cuốn sách',
  })
  borrowBook(@Body() dto: BorrowBookDto): Promise<Borrowing> {
    return this.borrowingsService.borrowBook(dto);
  }

  @Post(':id/return')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Trả sách (Hoàn tất phiếu mượn)',
    description:
      'Hoàn sách về kho, giảm số sách đang giữ của độc giả và chốt tiền phạt = số ngày quá hạn × mức phạt mỗi ngày ' +
      '(cấu hình LOAN_FINE_PER_DAY, mặc định 5.000 VNĐ/ngày/cuốn). Trạng thái chuyển RETURNED; ' +
      'tiền phạt chỉ được đánh dấu đã thu khi truyền `finePaid: true`, ngược lại ghi nhận thành nợ. ' +
      'Nếu sách đang có người đặt trước thì phiếu đặt trước đầu hàng đợi được chuyển sang READY.',
  })
  @ApiParam({
    name: 'id',
    description: 'Mã ID của phiếu mượn cần hoàn trả',
    example: 'brw-01',
  })
  @ApiOkResponse({
    description: 'Sách đã được hoàn trả thành công',
    type: Borrowing,
  })
  @ApiBadRequestResponse({
    description: 'Phiếu mượn đã hoàn tất trước đó (chống trả sách trùng, không cộng phạt lần hai)',
  })
  @ApiConflictResponse({
    description: 'Phiếu mượn vừa được một giao dịch khác xử lý trả sách đồng thời',
  })
  @ApiNotFoundResponse({
    description: 'Không tìm thấy phiếu mượn để trả sách',
  })
  returnBook(
    @Param('id') id: string,
    @Body() dto: ReturnBookDto,
  ): Promise<Borrowing> {
    return this.borrowingsService.returnBook(id, dto);
  }

  @Post(':id/renew')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Gia hạn thời gian mượn sách',
    description:
      'ADMIN/LIBRARIAN được gia hạn thay độc giả; MEMBER chỉ được gia hạn lượt mượn của chính mình. ' +
      'Gia hạn thêm thời gian mượn (mặc định LOAN_RENEW_DAYS = 7 ngày, tối đa LOAN_RENEW_MAX_DAYS = 14 ngày mỗi lần). ' +
      'Điều kiện kiểm tra theo thứ tự: chưa trả sách -> chưa quá hạn -> chưa dùng hết số lần gia hạn ' +
      '(LOAN_RENEW_MAX_COUNT, mặc định 1 lần) -> cuốn sách không có độc giả khác đang đặt trước. ' +
      'Mỗi lần gia hạn được ghi vào lịch sử, xem tại GET /api/borrowings/:id/renewals.',
  })
  @ApiParam({
    name: 'id',
    description: 'Mã ID của phiếu mượn cần gia hạn',
    example: 'brw-01',
  })
  @ApiOkResponse({
    description: 'Gia hạn thời hạn mượn sách thành công',
    type: Borrowing,
  })
  @ApiBadRequestResponse({
    description: 'Phiếu mượn đã trả sách, đã quá hạn, hoặc đã dùng hết số lần gia hạn cho phép',
  })
  @ApiConflictResponse({
    description:
      'Cuốn sách đang có độc giả khác đặt trước hợp lệ nên không được gia hạn, hoặc phiếu vừa được gia hạn bởi giao dịch khác',
  })
  @ApiNotFoundResponse({
    description: 'Không tìm thấy phiếu mượn để gia hạn',
  })
  @ApiForbiddenResponse({
    description: 'MEMBER không có thẻ độc giả hoặc không phải chủ phiếu mượn',
  })
  renewLoan(
    @Param('id') id: string,
    @Body() dto: RenewLoanDto,
    @CurrentUser() user: RenewalActor,
  ): Promise<Borrowing> {
    return this.borrowingsService.renewLoan(id, dto, user);
  }

  @Post(':id/pay-fine')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Thanh toán tiền phạt quá hạn',
    description: 'Ghi nhận độc giả đã nộp đủ số tiền phạt phát sinh do trễ hạn trả sách.',
  })
  @ApiParam({
    name: 'id',
    description: 'Mã ID của phiếu mượn có phát sinh tiền phạt',
    example: 'brw-04',
  })
  @ApiOkResponse({
    description: 'Tiền phạt đã được thanh toán thành công',
    type: Borrowing,
  })
  @ApiBadRequestResponse({
    description: 'Phiếu mượn không có tiền phạt hoặc đã thanh toán xong',
  })
  payFine(@Param('id') id: string): Promise<Borrowing> {
    return this.borrowingsService.payFine(id);
  }
}
