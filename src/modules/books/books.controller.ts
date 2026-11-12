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
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiForbiddenResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { UserRole } from '../../common/enums/user-role.enum.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';

import { BooksService } from './books.service.js';
import { CreateBookDto } from './dto/create-book.dto.js';
import { FilterBookDto } from './dto/filter-book.dto.js';
import { UpdateBookDto } from './dto/update-book.dto.js';
import { Book } from './entities/book.entity.js';

@ApiTags('Books - Quản lý Sách & Kho Thư Viện')
@ApiBearerAuth('JWT-auth')
@ApiUnauthorizedResponse({ description: 'Thiếu Bearer Token hoặc Token không hợp lệ/hết hạn' })
@ApiForbiddenResponse({ description: 'Tài khoản không có vai trò phù hợp để thực hiện thao tác này' })
@Controller('books')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BooksController {
  constructor(private readonly booksService: BooksService) {}

  @Get()
  @ApiOperation({
    summary: 'Tìm kiếm và lấy danh sách sách trong thư viện',
    description:
      'Hỗ trợ tìm kiếm từ khóa (tựa đề, ISBN, vị trí kệ...), lọc theo tác giả, thể loại, trạng thái, năm xuất bản và phân trang.',
  })
  @ApiOkResponse({
    description: 'Danh sách sách phù hợp bộ lọc kèm thông tin phân trang',
    type: [Book],
  })
  findAll(@Query() filters: FilterBookDto) {
    return this.booksService.findAll(filters);
  }

  @Get('isbn/:isbn')
  @ApiOperation({
    summary: 'Tra cứu sách theo mã ISBN',
    description:
      'Tìm kiếm thông tin sách dựa vào mã số tiêu chuẩn quốc tế ISBN-13 (hỗ trợ cả chuỗi có dấu gạch ngang hoặc 13 chữ số liền nhau từ máy quét EAN-13).',
  })
  @ApiParam({
    name: 'isbn',
    description: 'Mã ISBN cuốn sách',
    example: '9780132350884',
  })
  @ApiOkResponse({
    description: 'Thông tin cuốn sách tìm thấy',
    type: Book,
  })
  @ApiNotFoundResponse({
    description: 'Không tìm thấy cuốn sách với mã ISBN này',
  })
  findByIsbn(@Param('isbn') isbn: string): Promise<Book> {
    return this.booksService.findByIsbn(isbn);
  }

  @Get(':id/stock-check')
  @ApiOperation({
    summary: 'Kiểm tra tồn kho tức thời của cuốn sách (Stock Check)',
    description:
      'Dành cho Flutter Client kiểm tra số lượng bản in khả dụng trước khi người dùng xác nhận mượn, tránh xung đột tồn kho.',
  })
  @ApiParam({
    name: 'id',
    description: 'Mã định danh ID của cuốn sách',
    example: 'book-01',
  })
  @ApiOkResponse({
    description: 'Thông tin tồn kho tức thời',
    schema: {
      type: 'object',
      properties: {
        bookId: { type: 'string', example: 'book-01' },
        title: { type: 'string', example: 'Clean Code' },
        copiesTotal: { type: 'number', example: 8 },
        copiesAvailable: { type: 'number', example: 6 },
        price: { type: 'number', example: 250000 },
        status: { type: 'string', example: 'AVAILABLE' },
        isAvailable: { type: 'boolean', example: true },
      },
    },
  })
  stockCheck(@Param('id') id: string) {
    return this.booksService.stockCheck(id);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Lấy thông tin chi tiết một cuốn sách',
    description: 'Trả về toàn bộ thông tin sách, số lượng tồn kho, vị trí kệ và tác giả.',
  })
  @ApiParam({
    name: 'id',
    description: 'Mã định danh ID của cuốn sách',
    example: 'book-01',
  })
  @ApiOkResponse({
    description: 'Thông tin chi tiết cuốn sách',
    type: Book,
  })
  @ApiNotFoundResponse({
    description: 'Không tìm thấy cuốn sách với ID chỉ định',
  })
  findOne(@Param('id') id: string): Promise<Book> {
    return this.booksService.findOne(id);
  }

  @Roles(UserRole.ADMIN, UserRole.LIBRARIAN)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Nhập sách mới vào thư viện',
    description:
      'Tạo mới một cuốn sách kèm kiểm tra tính hợp lệ của ISBN, tác giả và thể loại.',
  })
  @ApiCreatedResponse({
    description: 'Sách đã được nhập vào hệ thống thành công',
    type: Book,
  })
  @ApiBadRequestResponse({
    description: 'Tác giả hoặc thể loại không tồn tại hoặc dữ liệu không hợp lệ',
  })
  @ApiConflictResponse({
    description: 'Mã ISBN đã tồn tại trong thư viện',
  })
  create(@Body() dto: CreateBookDto): Promise<Book> {
    return this.booksService.create(dto);
  }

  @Roles(UserRole.ADMIN, UserRole.LIBRARIAN)
  @Patch(':id')
  @ApiOperation({
    summary: 'Cập nhật thông tin cuốn sách',
    description: 'Cập nhật tựa đề, số lượng bản in, vị trí kệ sách hoặc tình trạng sách.',
  })
  @ApiParam({
    name: 'id',
    description: 'Mã ID cuốn sách cần cập nhật',
    example: 'book-01',
  })
  @ApiOkResponse({
    description: 'Thông tin sách sau khi cập nhật',
    type: Book,
  })
  @ApiNotFoundResponse({
    description: 'Không tìm thấy cuốn sách cần cập nhật',
  })
  @ApiConflictResponse({
    description: 'Mã ISBN mới bị trùng lặp với cuốn sách khác',
  })
  update(@Param('id') id: string, @Body() dto: UpdateBookDto): Promise<Book> {
    return this.booksService.update(id, dto);
  }

  @Roles(UserRole.ADMIN)
  @Delete(':id')
  @ApiOperation({
    summary: 'Xóa cuốn sách khỏi hệ thống thư viện',
    description: 'Chỉ xóa được sách khi không còn bất kỳ bạn đọc nào đang mượn cuốn sách này.',
  })
  @ApiParam({
    name: 'id',
    description: 'Mã ID cuốn sách cần xóa',
    example: 'book-06',
  })
  @ApiOkResponse({
    description: 'Cuốn sách đã được xóa thành công',
  })
  @ApiNotFoundResponse({
    description: 'Không tìm thấy cuốn sách để xóa',
  })
  @ApiConflictResponse({
    description: 'Không thể xóa vì sách vẫn đang nằm trong phiếu mượn chưa trả',
  })
  remove(@Param('id') id: string): Promise<{ message: string; deletedId: string }> {
    return this.booksService.remove(id);
  }
}
