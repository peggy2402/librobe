import { Controller, Get, Res } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

@ApiTags('Root - Điểm Đầu Của Ứng Dụng')
@Controller()
export class AppController {
  @Get()
  @ApiExcludeEndpoint()
  rootRedirect(@Res() res: Response) {
    return res.redirect('/admin');
  }

  @Get('dashboard')
  @ApiExcludeEndpoint()
  dashboardRedirect(@Res() res: Response) {
    return res.redirect('/admin');
  }

  @Get('health')
  @ApiOperation({
    summary: 'Kiểm tra trạng thái máy chủ (Health Check)',
    description: 'Trả về trạng thái hoạt động hiện tại của hệ thống backend.',
  })
  @ApiOkResponse({
    description: 'Hệ thống hoạt động bình thường',
    schema: {
      example: {
        status: 'ok',
        service: 'Library Management API',
        version: '1.0.0',
        uptime: 124.5,
        docs: '/api/docs',
        timestamp: '2026-10-16T12:00:00.000Z',
      },
    },
  })
  healthCheck() {
    return {
      status: 'ok',
      service: 'Library Management System API (Librobe)',
      version: '1.0.0',
      uptime: process.uptime(),
      docs: '/api/docs',
      timestamp: new Date().toISOString(),
    };
  }
}
