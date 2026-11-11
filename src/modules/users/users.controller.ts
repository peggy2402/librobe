import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
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
import { FilterUserDto } from './dto/filter-user.dto.js';
import { UpdateUserRoleDto } from './dto/update-user-role.dto.js';
import { UpdateUserStatusDto } from './dto/update-user-status.dto.js';
import { UserAccount } from './entities/user-account.entity.js';
import { UsersService } from './users.service.js';

@ApiTags('Users - Quản trị Tài khoản & Phân quyền')
@ApiBearerAuth('JWT-auth')
@ApiUnauthorizedResponse({ description: 'Thiếu Bearer Token hoặc Token không hợp lệ/hết hạn' })
@ApiForbiddenResponse({ description: 'Tài khoản không có vai trò ADMIN' })
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({
    summary: 'Danh sách tài khoản đăng nhập',
    description:
      'Chỉ ADMIN. Hỗ trợ phân trang, tìm kiếm theo email/số điện thoại/họ tên, lọc theo `role` và `isActive`. ' +
      'Dùng để tra ID tài khoản trước khi đổi vai trò. Response không bao giờ chứa mật khẩu.',
  })
  @ApiOkResponse({ description: 'Danh sách tài khoản kèm phân trang', type: [UserAccount] })
  findAll(@Query() filters: FilterUserDto) {
    return this.usersService.findAll(filters);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết một tài khoản', description: 'Chỉ ADMIN.' })
  @ApiParam({ name: 'id', description: 'Mã ID tài khoản', example: 'user-02' })
  @ApiOkResponse({ description: 'Thông tin tài khoản', type: UserAccount })
  @ApiNotFoundResponse({ description: 'Không tìm thấy tài khoản' })
  findOne(@Param('id') id: string): Promise<UserAccount> {
    return this.usersService.findOne(id);
  }

  @Patch(':id/role')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Đổi vai trò tài khoản (nâng độc giả lên thủ thư)',
    description:
      'Chỉ ADMIN. Ví dụ nâng một tài khoản MEMBER lên LIBRARIAN để người đó được phê duyệt phiếu mượn. ' +
      'Liên kết thẻ độc giả (`memberId`) được giữ nguyên — một thủ thư vẫn có thể là độc giả của thư viện. ' +
      'Hai chốt an toàn: không thể tự hạ vai trò của chính mình, và không thể hạ vai trò của ADMIN đang hoạt động cuối cùng.',
  })
  @ApiParam({ name: 'id', description: 'Mã ID tài khoản cần đổi vai trò', example: 'user-03' })
  @ApiOkResponse({ description: 'Đã đổi vai trò thành công', type: UserAccount })
  @ApiBadRequestResponse({
    description: 'Vai trò không hợp lệ, tài khoản đã có vai trò đó, hoặc đang tự hạ vai trò của chính mình',
  })
  @ApiConflictResponse({ description: 'Đang hạ vai trò của ADMIN hoạt động duy nhất' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy tài khoản' })
  updateRole(
    @Param('id') id: string,
    @Body() dto: UpdateUserRoleDto,
    @CurrentUser() actor: { id: string },
  ): Promise<UserAccount> {
    return this.usersService.updateRole(id, dto, actor.id);
  }

  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Khóa hoặc mở lại tài khoản',
    description:
      'Chỉ ADMIN. Khóa tài khoản (`isActive: false`) sẽ chặn đăng nhập và vô hiệu mọi token đặt lại mật khẩu đang treo. ' +
      'Không thể tự khóa chính mình, và không thể khóa ADMIN đang hoạt động cuối cùng.',
  })
  @ApiParam({ name: 'id', description: 'Mã ID tài khoản', example: 'user-03' })
  @ApiOkResponse({ description: 'Đã cập nhật trạng thái tài khoản', type: UserAccount })
  @ApiBadRequestResponse({ description: 'Tài khoản đã ở trạng thái đó, hoặc đang tự khóa chính mình' })
  @ApiConflictResponse({ description: 'Đang khóa ADMIN hoạt động duy nhất' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy tài khoản' })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto,
    @CurrentUser() actor: { id: string },
  ): Promise<UserAccount> {
    return this.usersService.updateStatus(id, dto, actor.id);
  }
}
