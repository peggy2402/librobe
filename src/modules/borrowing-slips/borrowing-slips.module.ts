import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ReservationsModule } from '../reservations/reservations.module.js';
import { BorrowingSlipsController } from './borrowing-slips.controller.js';
import { BorrowingSlipsService } from './borrowing-slips.service.js';

@Module({
  imports: [AuthModule, PrismaModule, ReservationsModule],
  controllers: [BorrowingSlipsController],
  providers: [BorrowingSlipsService],
  exports: [BorrowingSlipsService],
})
export class BorrowingSlipsModule {}
