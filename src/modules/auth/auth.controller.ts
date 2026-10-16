import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { User } from '../users/entities/user.entity.js';
import { AuthService } from './auth.service.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { AuthResponseDto, UserProfileDto } from './dto/auth-response.dto.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';

@ApiTags('Auth - Xác thực & Phân quyền (Đăng ký / Đăng nhập)')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Đăng ký tài khoản người dùng mới',
    description:
      'Đăng ký tài khoản với đầy đủ Email, Số điện thoại, Mật khẩu và Họ tên. Mật khẩu được mã hóa an toàn bằng thuật toán Bcrypt. Nếu đăng ký vai trò Độc giả (MEMBER), hệ thống sẽ tự động khởi tạo hồ sơ thẻ thư viện.',
  })
  @ApiCreatedResponse({
    description: 'Đăng ký tài khoản thành công, trả về Access Token và hồ sơ người dùng',
    type: AuthResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Dữ liệu gửi lên không hợp lệ (sai định dạng email, số điện thoại, mật khẩu ngắn)',
  })
  @ApiConflictResponse({
    description: 'Email hoặc Số điện thoại này đã được đăng ký trước đó',
  })
  register(@Body() dto: RegisterDto): Promise<AuthResponseDto> {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Đăng nhập vào hệ thống',
    description:
      'Đăng nhập linh hoạt bằng Email HOẶC Số điện thoại kết hợp với Mật khẩu. Trả về Bearer JWT token có hiệu lực trong 24 giờ.',
  })
  @ApiOkResponse({
    description: 'Đăng nhập thành công, nhận Access Token',
    type: AuthResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Thiếu thông tin đăng nhập (email/sđt hoặc mật khẩu)',
  })
  @ApiUnauthorizedResponse({
    description: 'Tài khoản hoặc mật khẩu không chính xác, hoặc tài khoản đã bị khóa',
  })
  login(@Body() dto: LoginDto): Promise<AuthResponseDto> {
    return this.authService.login(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Lấy thông tin tài khoản hiện tại (Profile)',
    description:
      'Yêu cầu Bearer Token trên Header Authorization. Trích xuất thông tin người dùng đang đăng nhập.',
  })
  @ApiOkResponse({
    description: 'Thông tin hồ sơ cá nhân của người dùng hiện tại',
    type: UserProfileDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Chưa đăng nhập, thiếu Token hoặc Token không hợp lệ/hết hạn',
  })
  getProfile(@CurrentUser() user: User): UserProfileDto {
    return this.authService.getProfile(user.id);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Đổi mật khẩu tài khoản',
    description: 'Người dùng đổi mật khẩu bằng cách xác nhận mật khẩu hiện tại và nhập mật khẩu mới.',
  })
  @ApiOkResponse({
    description: 'Đổi mật khẩu thành công',
    schema: {
      example: {
        success: true,
        message: 'Mật khẩu đã được thay đổi thành công',
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Mật khẩu hiện tại không đúng hoặc mật khẩu mới trùng mật khẩu cũ',
  })
  @ApiUnauthorizedResponse({
    description: 'Chưa đăng nhập hoặc Token hết hạn',
  })
  changePassword(
    @CurrentUser() user: User,
    @Body() dto: ChangePasswordDto,
  ): Promise<{ message: string; success: boolean }> {
    return this.authService.changePassword(user.id, dto);
  }
}
