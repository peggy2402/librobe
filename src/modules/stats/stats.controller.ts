import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { LibraryStatsDto } from './dto/library-stats.dto.js';
import { StatsService } from './stats.service.js';

@ApiTags('Dashboard & Statistics - Thống kê Báo cáo')
@Controller('stats')
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @Get()
  @ApiOperation({
    summary: 'Lấy các chỉ số thống kê tổng quan thư viện (Dashboard)',
    description:
      'Cung cấp tổng quan về kho sách, số lượng độc giả, số lượt mượn trả đang hoạt động, số phiếu quá hạn, tiền phạt và top 5 sách mượn nhiều nhất.',
  })
  @ApiOkResponse({
    description: 'Chỉ số thống kê thư viện theo thời gian thực',
    type: LibraryStatsDto,
  })
  getDashboardStats(): LibraryStatsDto {
    return this.statsService.getDashboardStats();
  }
}
