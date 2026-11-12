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
import { UserRole } from '../../common/enums/user-role.enum.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { BorrowingSlipsService } from './borrowing-slips.service.js';
import type { CancelSlipActor, SlipActor } from './borrowing-slips.service.js';
import { ApiBorrowConflictResponse } from '../loan-policy/decorators/borrow-conflict-response.decorator.js';
import { CreateBorrowingSlipDto } from './dto/create-borrowing-slip.dto.js';
import { FilterBorrowingSlipDto } from './dto/filter-borrowing-slip.dto.js';
import {
  CancelBorrowingSlipDto,
  RejectBorrowingSlipDto,
} from './dto/reject-borrowing-slip.dto.js';
import { RenewSlipDto } from './dto/renew-slip.dto.js';
import { ReturnSlipItemsDto } from './dto/return-slip-items.dto.js';
import {
  BorrowingSlipDetail,
  BorrowingSlipEntity,
} from './entities/borrowing-slip.entity.js';
import { LoanRenewalHistory } from '../borrowings/entities/loan-renewal.entity.js';
import type { RenewalActor } from '../loan-policy/loan-eligibility.service.js';

@ApiTags(
  'Borrowing Slips - Quản lý Phiếu Mượn Sách ERP (Master - Detail & Workflow)',
)
@ApiBearerAuth('JWT-auth')
@ApiUnauthorizedResponse({
  description: 'Thiếu Bearer Token hoặc Token không hợp lệ/hết hạn',
})
@ApiForbiddenResponse({
  description:
    'Thao tác tại quầy dành cho ADMIN/LIBRARIAN; MEMBER chỉ được hủy phiếu của chính mình khi còn chờ duyệt',
})
@Controller('borrowing-slips')
@UseGuards(JwtAuthGuard, RolesGuard)
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
    description:
      'Trả về phiếu mượn, các dòng sách và canRenew, reasonCode, message theo người gọi và chính sách gia hạn hiện tại.',
  })
  @ApiParam({
    name: 'id',
    description: 'Mã ID của phiếu mượn',
    example: 'slip-01',
  })
  @ApiOkResponse({
    description: 'Chi tiết phiếu mượn Master - Detail',
    type: BorrowingSlipDetail,
  })
  @ApiNotFoundResponse({
    description: 'Không tìm thấy phiếu mượn với ID chỉ định',
  })
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: RenewalActor,
  ): Promise<BorrowingSlipDetail> {
    return this.slipsService.findOne(id, user);
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
    description: 'Độc giả không đủ điều kiện mượn sách',
  })
  @ApiBorrowConflictResponse(
    'BORROW_LIMIT_EXCEEDED kèm details hạn mức, hoặc số lượng sách trong kho không đủ đáp ứng',
  )
  create(@Body() dto: CreateBorrowingSlipDto): Promise<BorrowingSlipEntity> {
    return this.slipsService.create(dto);
  }

  @Roles(UserRole.ADMIN, UserRole.LIBRARIAN)
  @Patch(':id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Phê duyệt xuất kho phiếu mượn (Approval Workflow)',
    description:
      'Khóa độc giả, kiểm tra lại điều kiện và hạn mức mượn, trừ kho atomic và chuyển phiếu sang BORROWED trong cùng transaction.',
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
  @ApiBorrowConflictResponse(
    'BORROW_LIMIT_EXCEEDED kèm details hạn mức; phiếu đã được xử lý hoặc sách hết do xung đột đồng thời',
  )
  @ApiBadRequestResponse({
    description:
      'Độc giả không đủ điều kiện: thẻ không hợp lệ, quá hạn hoặc còn nợ phạt',
  })
  approve(
    @Param('id') id: string,
    @CurrentUser() actor: SlipActor,
  ): Promise<BorrowingSlipEntity> {
    return this.slipsService.approve(id, actor);
  }

  @Roles(UserRole.ADMIN, UserRole.LIBRARIAN)
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
  reject(
    @Param('id') id: string,
    @Body() dto: RejectBorrowingSlipDto,
    @CurrentUser() actor: SlipActor,
  ): Promise<BorrowingSlipEntity> {
    return this.slipsService.reject(id, dto, actor);
  }

  @Roles(UserRole.ADMIN, UserRole.LIBRARIAN, UserRole.MEMBER)
  @Patch(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Hủy phiếu mượn sách',
    description:
      'MEMBER chỉ được hủy phiếu của chính mình ở trạng thái PENDING_APPROVAL. ADMIN/LIBRARIAN được hủy theo quy trình tại quầy; phiếu đã xuất kho được hoàn số sách còn lại.',
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
    description:
      'Phiếu đã kết thúc, vừa được xử lý, hoặc MEMBER hủy phiếu không còn chờ duyệt',
  })
  @ApiForbiddenResponse({
    description: 'MEMBER không có thẻ độc giả hoặc không phải chủ phiếu',
  })
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelBorrowingSlipDto,
    @CurrentUser() actor: CancelSlipActor,
  ): Promise<BorrowingSlipEntity> {
    return this.slipsService.cancel(id, dto, actor);
  }

  @Roles(UserRole.ADMIN, UserRole.LIBRARIAN)
  @Post(':id/return-items')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Trả sách từng phần & Quyết toán bồi thường (Partial Return & Fine Settlement)',
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
    description:
      'Phiếu không ở trạng thái đang mượn hoặc dữ liệu trả sách không hợp lệ',
  })
  returnItems(
    @Param('id') id: string,
    @Body() dto: ReturnSlipItemsDto,
  ): Promise<BorrowingSlipEntity> {
    return this.slipsService.returnItems(id, dto);
  }

  @Roles(UserRole.ADMIN, UserRole.LIBRARIAN, UserRole.MEMBER)
  @Patch(':id/renew')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Gia hạn hạn trả của phiếu mượn',
    description:
      'ADMIN/LIBRARIAN được gia hạn thay độc giả; MEMBER chỉ được gia hạn phiếu mượn của chính mình. ' +
      'Cộng thêm số ngày vào hạn trả của toàn bộ phiếu (mặc định LOAN_RENEW_DAYS = 7 ngày). ' +
      'Điều kiện: phiếu đang BORROWED/PARTIAL_RETURNED, chưa quá hạn, chưa dùng hết số lần gia hạn ' +
      '(LOAN_RENEW_MAX_COUNT, mặc định 1 lần) và không cuốn nào trong phiếu đang có độc giả khác đặt trước.',
  })
  @ApiParam({
    name: 'id',
    description: 'Mã ID phiếu mượn cần gia hạn',
    example: 'slip-01',
  })
  @ApiOkResponse({
    description: 'Gia hạn thành công, dueDate đã được cập nhật',
    type: BorrowingSlipEntity,
  })
  @ApiBadRequestResponse({
    description:
      'Phiếu không ở trạng thái đang mượn, đã quá hạn, hoặc đã dùng hết số lần gia hạn',
  })
  @ApiConflictResponse({
    description:
      'Sách trong phiếu đang có độc giả khác đặt trước, hoặc phiếu vừa được gia hạn bởi giao dịch khác',
  })
  @ApiNotFoundResponse({ description: 'Không tìm thấy phiếu mượn' })
  @ApiForbiddenResponse({
    description: 'MEMBER không có thẻ độc giả hoặc không phải chủ phiếu mượn',
  })
  renew(
    @Param('id') id: string,
    @Body() dto: RenewSlipDto,
    @CurrentUser() user: RenewalActor,
  ): Promise<BorrowingSlipEntity> {
    return this.slipsService.renew(id, dto, user);
  }

  @Get(':id/renewals')
  @ApiOperation({
    summary: 'Lịch sử gia hạn của phiếu mượn',
    description:
      'Audit trail từng lần gia hạn: hạn trả cũ, hạn trả mới, số ngày, người thực hiện.',
  })
  @ApiParam({ name: 'id', description: 'Mã ID phiếu mượn', example: 'slip-01' })
  @ApiOkResponse({
    description: 'Danh sách lần gia hạn',
    type: [LoanRenewalHistory],
  })
  @ApiNotFoundResponse({ description: 'Không tìm thấy phiếu mượn' })
  getRenewalHistory(@Param('id') id: string): Promise<LoanRenewalHistory[]> {
    return this.slipsService.getRenewalHistory(id);
  }

  @Roles(UserRole.ADMIN, UserRole.LIBRARIAN)
  @Post(':id/pay-fine')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Thanh toán tiền phạt của phiếu mượn',
    description:
      'Ghi nhận độc giả đã nộp đủ tiền phạt và bồi thường của phiếu. Thao tác này độc lập với việc trả sách: ' +
      'phiếu đã COMPLETED vẫn có thể còn finePaid = false cho tới khi thu đủ tiền.',
  })
  @ApiParam({
    name: 'id',
    description: 'Mã ID phiếu mượn có phát sinh tiền phạt',
    example: 'slip-01',
  })
  @ApiOkResponse({
    description: 'Đã ghi nhận thanh toán tiền phạt',
    type: BorrowingSlipEntity,
  })
  @ApiBadRequestResponse({
    description: 'Phiếu không có tiền phạt hoặc đã thanh toán trước đó',
  })
  @ApiNotFoundResponse({ description: 'Không tìm thấy phiếu mượn' })
  payFine(@Param('id') id: string): Promise<BorrowingSlipEntity> {
    return this.slipsService.payFine(id);
  }
}
