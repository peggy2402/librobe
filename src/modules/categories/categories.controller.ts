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
import { CategoriesService } from './categories.service.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { UpdateCategoryDto } from './dto/update-category.dto.js';
import { Category } from './entities/category.entity.js';

@ApiTags('Categories - Quản lý Thể loại Sách')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @ApiOperation({
    summary: 'Lấy danh sách các thể loại sách',
    description: 'Hỗ trợ phân trang, tìm kiếm theo tên hoặc mô tả, và sắp xếp linh hoạt.',
  })
  @ApiOkResponse({
    description: 'Danh sách thể loại kèm thông tin phân trang',
    type: [Category],
  })
  findAll(@Query() pagination: PaginationDto) {
    return this.categoriesService.findAll(pagination);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Lấy chi tiết một thể loại theo ID',
    description: 'Trả về thông tin chi tiết của thể loại cùng số lượng sách hiện có.',
  })
  @ApiParam({
    name: 'id',
    description: 'Mã ID của thể loại (ví dụ: cat-01)',
    example: 'cat-01',
  })
  @ApiOkResponse({
    description: 'Thông tin chi tiết thể loại',
    type: Category,
  })
  @ApiNotFoundResponse({
    description: 'Không tìm thấy thể loại tương ứng',
  })
  findOne(@Param('id') id: string): Promise<Category> {
    return this.categoriesService.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Tạo mới một thể loại sách',
    description: 'Thêm một thể loại mới vào hệ thống thư viện. Tên thể loại không được trùng lặp.',
  })
  @ApiCreatedResponse({
    description: 'Thể loại sách đã được tạo thành công',
    type: Category,
  })
  @ApiBadRequestResponse({
    description: 'Dữ liệu đầu vào không hợp lệ (sai định dạng hoặc thiếu trường bắt buộc)',
  })
  @ApiConflictResponse({
    description: 'Tên thể loại đã tồn tại trong hệ thống',
  })
  create(@Body() dto: CreateCategoryDto): Promise<Category> {
    return this.categoriesService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Cập nhật thông tin thể loại sách',
    description: 'Cập nhật tên hoặc mô tả của thể loại dựa theo mã ID.',
  })
  @ApiParam({
    name: 'id',
    description: 'Mã ID của thể loại cần cập nhật',
    example: 'cat-01',
  })
  @ApiOkResponse({
    description: 'Thể loại sau khi được cập nhật',
    type: Category,
  })
  @ApiNotFoundResponse({
    description: 'Không tìm thấy thể loại cần cập nhật',
  })
  @ApiConflictResponse({
    description: 'Tên thể loại cập nhật bị trùng với một thể loại khác',
  })
  update(@Param('id') id: string, @Body() dto: UpdateCategoryDto): Promise<Category> {
    return this.categoriesService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Xóa một thể loại sách',
    description: 'Xóa thể loại khỏi hệ thống nếu không còn sách nào thuộc thể loại này.',
  })
  @ApiParam({
    name: 'id',
    description: 'Mã ID của thể loại cần xóa',
    example: 'cat-05',
  })
  @ApiOkResponse({
    description: 'Thể loại đã được xóa thành công',
  })
  @ApiNotFoundResponse({
    description: 'Không tìm thấy thể loại cần xóa',
  })
  @ApiConflictResponse({
    description: 'Không thể xóa vì vẫn còn sách thuộc thể loại này',
  })
  remove(@Param('id') id: string): Promise<{ message: string; deletedId: string }> {
    return this.categoriesService.remove(id);
  }
}
