import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { BorrowingsService } from './borrowings.service.js';
import { BorrowBookDto } from './dto/borrow-book.dto.js';
import { FilterBorrowingDto } from './dto/filter-borrowing.dto.js';
import { RenewLoanDto } from './dto/renew-loan.dto.js';
import { ReturnBookDto } from './dto/return-book.dto.js';
import { Borrowing } from './entities/borrowing.entity.js';

@ApiTags('Borrowings - Quản lý Mượn / Trả Sách')
@Controller('borrowings')
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
  getOverdueLoans(): Borrowing[] {
    return this.borrowingsService.getOverdueLoans();
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Lấy chi tiết một phiếu mượn sách',
    description: 'Trả về thông tin chi tiết phiếu mượn, ngày hẹn trả, hạn phạt và lịch sử gia hạn.',
  })
  @ApiParam({
    name: 'id',
    description: 'Mã ID của phiếu mượn (ví dụ: brw-01)',
    example: 'brw-01',
  })
  @ApiOkResponse({
    description: 'Chi tiết phiếu mượn',
    type: Borrowing,
  })
  @ApiNotFoundResponse({
    description: 'Không tìm thấy phiếu mượn',
  })
  findOne(@Param('id') id: string): Borrowing {
    return this.borrowingsService.findOne(id);
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
    description: 'Độc giả không đủ điều kiện (thẻ hết hạn, sách hết hàng, vượt quá hạn mức)',
  })
  @ApiNotFoundResponse({
    description: 'Không tìm thấy độc giả hoặc cuốn sách',
  })
  borrowBook(@Body() dto: BorrowBookDto): Borrowing {
    return this.borrowingsService.borrowBook(dto);
  }

  @Post(':id/return')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Trả sách (Hoàn tất phiếu mượn)',
    description:
      'Độc giả trả sách về thư viện, hệ thống tự động hoàn lại số lượng bản in vào kho, giảm số sách đang mượn của bạn đọc và tính toán tiền phạt nếu trễ hạn (5.000 VNĐ/ngày).',
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
    description: 'Phiếu mượn đã hoàn tất trước đó',
  })
  @ApiNotFoundResponse({
    description: 'Không tìm thấy phiếu mượn để trả sách',
  })
  returnBook(@Param('id') id: string, @Body() dto: ReturnBookDto): Borrowing {
    return this.borrowingsService.returnBook(id, dto);
  }

  @Post(':id/renew')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Gia hạn thời gian mượn sách',
    description:
      'Cho phép gia hạn thêm thời gian mượn (mặc định 7 ngày, tối đa 14 ngày). Yêu cầu: phiếu mượn chưa quá hạn và chưa vượt quá 2 lần gia hạn.',
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
    description: 'Phiếu mượn đã quá hạn hoặc đã vượt quá 2 lần gia hạn tối đa',
  })
  @ApiNotFoundResponse({
    description: 'Không tìm thấy phiếu mượn để gia hạn',
  })
  renewLoan(@Param('id') id: string, @Body() dto: RenewLoanDto): Borrowing {
    return this.borrowingsService.renewLoan(id, dto);
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
  payFine(@Param('id') id: string): Borrowing {
    return this.borrowingsService.payFine(id);
  }
}
