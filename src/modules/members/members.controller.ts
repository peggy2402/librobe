import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CreateMemberDto } from './dto/create-member.dto.js';
import { FilterMemberDto } from './dto/filter-member.dto.js';
import { UpdateMemberDto } from './dto/update-member.dto.js';
import { Member } from './entities/member.entity.js';
import { MembersService } from './members.service.js';

@ApiTags('Members - Quản lý Độc Giả & Thẻ Thư Viện')
@Controller('members')
export class MembersController {
  constructor(private readonly membersService: MembersService) {}

  @Get()
  @ApiOperation({
    summary: 'Lấy danh sách độc giả thư viện',
    description:
      'Hỗ trợ tìm kiếm theo tên, email, số điện thoại, số thẻ thư viện; lọc theo trạng thái thẻ và phân trang.',
  })
  @ApiOkResponse({
    description: 'Danh sách độc giả kèm thông tin phân trang',
    type: [Member],
  })
  findAll(@Query() filters: FilterMemberDto) {
    return this.membersService.findAll(filters);
  }

  @Get('card/:cardNumber')
  @ApiOperation({
    summary: 'Tra cứu thông tin độc giả theo số thẻ thư viện',
    description: 'Tìm kiếm thông tin thẻ và hồ sơ độc giả bằng mã thẻ thư viện (ví dụ: LIB-2026-0001).',
  })
  @ApiParam({
    name: 'cardNumber',
    description: 'Mã số in trên thẻ thư viện của độc giả',
    example: 'LIB-2026-0001',
  })
  @ApiOkResponse({
    description: 'Thông tin độc giả tìm thấy',
    type: Member,
  })
  @ApiNotFoundResponse({
    description: 'Không tìm thấy độc giả với số thẻ này',
  })
  findByCardNumber(@Param('cardNumber') cardNumber: string): Promise<Member> {
    return this.membersService.findByCardNumber(cardNumber);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Lấy thông tin chi tiết một độc giả',
    description: 'Trả về hồ sơ độc giả, hạn thẻ, số sách đang mượn và hạn mức mượn sách.',
  })
  @ApiParam({
    name: 'id',
    description: 'Mã ID độc giả',
    example: 'mem-01',
  })
  @ApiOkResponse({
    description: 'Chi tiết hồ sơ độc giả',
    type: Member,
  })
  @ApiNotFoundResponse({
    description: 'Không tìm thấy độc giả với ID chỉ định',
  })
  findOne(@Param('id') id: string): Promise<Member> {
    return this.membersService.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Đăng ký làm thẻ độc giả mới',
    description:
      'Đăng ký độc giả mới, hệ thống tự động sinh số thẻ thư viện (LIB-2026-XXXX) và tính ngày hết hạn thẻ.',
  })
  @ApiCreatedResponse({
    description: 'Thẻ độc giả đã được tạo thành công',
    type: Member,
  })
  @ApiBadRequestResponse({
    description: 'Dữ liệu độc giả không hợp lệ (sai định dạng email, số điện thoại)',
  })
  @ApiConflictResponse({
    description: 'Email độc giả đã tồn tại trong hệ thống',
  })
  create(@Body() dto: CreateMemberDto): Promise<Member> {
    return this.membersService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Cập nhật thông tin độc giả hoặc gia hạn thẻ',
    description: 'Cập nhật số điện thoại, địa chỉ, trạng thái thẻ (ACTIVE, SUSPENDED, EXPIRED) hoặc hạn thẻ.',
  })
  @ApiParam({
    name: 'id',
    description: 'Mã ID của độc giả',
    example: 'mem-01',
  })
  @ApiOkResponse({
    description: 'Hồ sơ độc giả sau khi cập nhật',
    type: Member,
  })
  @ApiNotFoundResponse({
    description: 'Không tìm thấy độc giả để cập nhật',
  })
  @ApiConflictResponse({
    description: 'Địa chỉ email mới bị trùng lặp',
  })
  update(@Param('id') id: string, @Body() dto: UpdateMemberDto): Promise<Member> {
    return this.membersService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Xóa hoặc hủy hồ sơ độc giả',
    description: 'Chỉ xóa được độc giả khi không còn sách mượn nào chưa hoàn trả.',
  })
  @ApiParam({
    name: 'id',
    description: 'Mã ID độc giả cần xóa',
    example: 'mem-04',
  })
  @ApiOkResponse({
    description: 'Độc giả đã được xóa thành công',
  })
  @ApiNotFoundResponse({
    description: 'Không tìm thấy độc giả để xóa',
  })
  @ApiConflictResponse({
    description: 'Không thể xóa vì độc giả vẫn đang mượn sách chưa trả',
  })
  remove(@Param('id') id: string): Promise<{ message: string; deletedId: string }> {
    return this.membersService.remove(id);
  }
}
