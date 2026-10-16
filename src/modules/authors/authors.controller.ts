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
import { PaginationDto } from '../../common/dto/pagination.dto.js';
import { AuthorsService } from './authors.service.js';
import { CreateAuthorDto } from './dto/create-author.dto.js';
import { UpdateAuthorDto } from './dto/update-author.dto.js';
import { Author } from './entities/author.entity.js';

@ApiTags('Authors - Quản lý Tác giả')
@Controller('authors')
export class AuthorsController {
  constructor(private readonly authorsService: AuthorsService) {}

  @Get()
  @ApiOperation({
    summary: 'Lấy danh sách các tác giả',
    description: 'Hỗ trợ phân trang, tìm kiếm tác giả theo tên, quốc tịch hoặc tiểu sử.',
  })
  @ApiOkResponse({
    description: 'Danh sách tác giả kèm thông tin phân trang',
    type: [Author],
  })
  findAll(@Query() pagination: PaginationDto) {
    return this.authorsService.findAll(pagination);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Lấy thông tin chi tiết một tác giả',
    description: 'Trả về hồ sơ tác giả và số lượng đầu sách đang có trong thư viện.',
  })
  @ApiParam({
    name: 'id',
    description: 'Mã ID của tác giả (ví dụ: auth-01)',
    example: 'auth-01',
  })
  @ApiOkResponse({
    description: 'Thông tin chi tiết của tác giả',
    type: Author,
  })
  @ApiNotFoundResponse({
    description: 'Không tìm thấy tác giả với ID được chỉ định',
  })
  findOne(@Param('id') id: string): Author {
    return this.authorsService.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Thêm mới một tác giả',
    description: 'Tạo hồ sơ tác giả mới trong hệ thống thư viện.',
  })
  @ApiCreatedResponse({
    description: 'Tác giả đã được thêm thành công',
    type: Author,
  })
  @ApiBadRequestResponse({
    description: 'Dữ liệu tác giả không hợp lệ',
  })
  @ApiConflictResponse({
    description: 'Tên tác giả đã tồn tại trong hệ thống',
  })
  create(@Body() dto: CreateAuthorDto): Author {
    return this.authorsService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Cập nhật thông tin tác giả',
    description: 'Sửa đổi tiểu sử, quốc tịch hoặc năm sinh của tác giả.',
  })
  @ApiParam({
    name: 'id',
    description: 'Mã ID của tác giả cần cập nhật',
    example: 'auth-01',
  })
  @ApiOkResponse({
    description: 'Thông tin tác giả sau khi cập nhật',
    type: Author,
  })
  @ApiNotFoundResponse({
    description: 'Không tìm thấy tác giả để cập nhật',
  })
  @ApiConflictResponse({
    description: 'Tên tác giả mới bị trùng lặp',
  })
  update(@Param('id') id: string, @Body() dto: UpdateAuthorDto): Author {
    return this.authorsService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Xóa một tác giả',
    description: 'Chỉ xóa được tác giả khi không còn cuốn sách nào của tác giả này trong thư viện.',
  })
  @ApiParam({
    name: 'id',
    description: 'Mã ID của tác giả cần xóa',
    example: 'auth-05',
  })
  @ApiOkResponse({
    description: 'Tác giả đã được xóa thành công',
  })
  @ApiNotFoundResponse({
    description: 'Không tìm thấy tác giả để xóa',
  })
  @ApiConflictResponse({
    description: 'Không thể xóa vì thư viện còn sách của tác giả này',
  })
  remove(@Param('id') id: string) {
    return this.authorsService.remove(id);
  }
}
