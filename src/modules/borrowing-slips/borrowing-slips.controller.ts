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
  Req,
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
import { BorrowingSlipsService } from './borrowing-slips.service.js';
import { CreateBorrowingSlipDto } from './dto/create-borrowing-slip.dto.js';
import { FilterBorrowingSlipDto } from './dto/filter-borrowing-slip.dto.js';
import { CancelBorrowingSlipDto, RejectBorrowingSlipDto } from './dto/reject-borrowing-slip.dto.js';
import { ReturnSlipItemsDto } from './dto/return-slip-items.dto.js';
import { BorrowingSlipEntity } from './entities/borrowing-slip.entity.js';

@ApiTags('Borrowing Slips - Quản lý Phiếu Mượn Sách ERP (Master - Detail & Workflow)')
@ApiBearerAuth('JWT-auth')
@ApiUnauthorizedResponse({
  description: 'Thiếu Bearer Token hoặc Token không hợp lệ/hết hạn',
})
@Controller('borrowing-slips')
@UseGuards(JwtAuthGuard)
export class BorrowingSlipsController {
  constructor(private readonly slipsService: BorrowingSlipsService) {}

  @Get()
  @ApiOperation({
    summary: 'Lấy danh sách phiếu mượn Master - Detail',
    description:
      'Hỗ trợ phân trang, tìm kiếm theo mã chứng từ, tên độc giả hoặc tên sách; lọc theo memberId và trạng thái vòng đời chứng từ.',
  })
  @ApiOkResponse({
    description: 'Danh sách phiếu mượn kèm metadata phân trang',
    type: [BorrowingSlipEntity],
  })
  findAll(@Query() filters: FilterBorrowingSlipDto) {
    return this.slipsService.findAll(filters);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Lấy thông tin chi tiết một phiếu mượn kèm các dòng sách',
    description: 'Trả về toàn bộ thông tin phiếu mượn cha và danh sách các dòng sách chi tiết con.',
  })
  @ApiParam({
    name: 'id',
    description: 'Mã ID của phiếu mượn',
    example: 'slip-01',
  })
  @ApiOkResponse({
    description: 'Chi tiết phiếu mượn Master - Detail',
    type: BorrowingSlipEntity,
  })
  @ApiNotFoundResponse({
    description: 'Không tìm thấy phiếu mượn với ID chỉ định',
  })
  findOne(@Param('id') id: string): Promise<BorrowingSlipEntity> {
    return this.slipsService.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Lập phiếu mượn sách mới (Đơn hàng Master - Detail)',
    description:
      'Độc giả hoặc thủ thư tạo phiếu mượn gồm nhiều cuốn sách. Hệ thống kiểm tra hạn mức mượn, kiểm tra số lượng tồn kho từng cuốn và tạo chứng từ ở trạng thái PENDING_APPROVAL.',
  })
  @ApiCreatedResponse({
    description: 'Phiếu mượn đã được tạo thành công ở trạng thái chờ duyệt',
    type: BorrowingSlipEntity,
  })
  @ApiBadRequestResponse({
    description: 'Độc giả không đủ điều kiện hoặc yêu cầu vượt quá hạn mức mượn',
  })
  @ApiConflictResponse({
    description: 'Số lượng sách trong kho không đủ đáp ứng',
  })
  create(@Body() dto: CreateBorrowingSlipDto): Promise<BorrowingSlipEntity> {
    return this.slipsService.create(dto);
  }

  @Patch(':id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Phê duyệt xuất kho phiếu mượn (Approval Workflow)',
    description:
      'Thủ thư duyệt phiếu mượn: kiểm tra khóa tồn kho chống Race Condition, trừ số lượng khả dụng trong kho và chuyển trạng thái sang BORROWED.',
  })
  @ApiParam({
    name: 'id',
    description: 'Mã ID phiếu mượn cần duyệt',
    example: 'slip-01',
  })
  @ApiOkResponse({
    description: 'Phiếu mượn đã được phê duyệt và xuất kho thành công',
    type: BorrowingSlipEntity,
  })
  @ApiConflictResponse({
    description: 'Phiếu đã được xử lý trước đó (409) hoặc sách bị hết do xung đột đồng thời',
  })
  approve(@Param('id') id: string, @Req() req: any): Promise<BorrowingSlipEntity> {
    const approver = req.user?.email || 'Librarian';
    return this.slipsService.approve(id, approver);
  }

  @Patch(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Từ chối phê duyệt phiếu mượn',
    description: 'Thủ thư từ chối cấp mượn sách kèm theo lý do cụ thể.',
  })
  @ApiParam({
    name: 'id',
    description: 'Mã ID phiếu mượn cần từ chối',
    example: 'slip-01',
  })
  @ApiOkResponse({
    description: 'Phiếu mượn đã bị từ chối thành công',
    type: BorrowingSlipEntity,
  })
  @ApiConflictResponse({
    description: 'Phiếu mượn không ở trạng thái chờ duyệt',
  })
  reject(@Param('id') id: string, @Body() dto: RejectBorrowingSlipDto): Promise<BorrowingSlipEntity> {
    return this.slipsService.reject(id, dto);
  }

  @Patch(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Hủy phiếu mượn sách',
    description:
      'Hủy phiếu mượn khi độc giả đổi ý. Nếu sách đã xuất kho, hệ thống tự động hoàn lại tồn kho khả dụng.',
  })
  @ApiParam({
    name: 'id',
    description: 'Mã ID phiếu mượn cần hủy',
    example: 'slip-01',
  })
  @ApiOkResponse({
    description: 'Phiếu mượn đã được hủy thành công',
    type: BorrowingSlipEntity,
  })
  @ApiConflictResponse({
    description: 'Phiếu mượn đã hoàn tất hoặc đã bị hủy trước đó',
  })
  cancel(@Param('id') id: string, @Body() dto: CancelBorrowingSlipDto): Promise<BorrowingSlipEntity> {
    return this.slipsService.cancel(id, dto);
  }

  @Post(':id/return-items')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Trả sách từng phần & Quyết toán bồi thường (Partial Return & Fine Settlement)',
    description:
      'Cho phép hoàn trả một phần hoặc toàn bộ số sách trong phiếu. Tự động tính tiền phạt quá hạn và tiền bồi thường nếu báo mất sách, tự động hoàn kho và cập nhật trạng thái phiếu (PARTIAL_RETURNED hoặc COMPLETED).',
  })
  @ApiParam({
    name: 'id',
    description: 'Mã ID phiếu mượn đang diễn ra',
    example: 'slip-01',
  })
  @ApiOkResponse({
    description: 'Đợt trả sách đã được ghi nhận và cập nhật vào chứng từ',
    type: BorrowingSlipEntity,
  })
  @ApiBadRequestResponse({
    description: 'Phiếu không ở trạng thái đang mượn hoặc dữ liệu trả sách không hợp lệ',
  })
  returnItems(@Param('id') id: string, @Body() dto: ReturnSlipItemsDto): Promise<BorrowingSlipEntity> {
    return this.slipsService.returnItems(id, dto);
  }
}

