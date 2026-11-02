import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { BorrowingSlipsController } from './borrowing-slips.controller.js';
import { BorrowingSlipsService } from './borrowing-slips.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [BorrowingSlipsController],
  providers: [BorrowingSlipsService],
  exports: [BorrowingSlipsService],
})
export class BorrowingSlipsModule {}

