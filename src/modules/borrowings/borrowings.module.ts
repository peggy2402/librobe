import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ReservationsModule } from '../reservations/reservations.module.js';
import { BorrowingsController } from './borrowings.controller.js';
import { BorrowingsService } from './borrowings.service.js';

@Module({
  imports: [AuthModule, ReservationsModule],
  controllers: [BorrowingsController],
  providers: [BorrowingsService],
  exports: [BorrowingsService],
})
export class BorrowingsModule {}
