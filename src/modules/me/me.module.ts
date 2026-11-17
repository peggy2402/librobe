import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { BorrowingSlipsModule } from '../borrowing-slips/borrowing-slips.module.js';
import { BorrowingsModule } from '../borrowings/borrowings.module.js';
import { ReservationsModule } from '../reservations/reservations.module.js';
import { MemberCardGuard } from './guards/member-card.guard.js';
import { MeController } from './me.controller.js';
import { MeService } from './me.service.js';

/**
 * Kênh tự phục vụ cho ứng dụng mobile của độc giả.
 *
 * Module này KHÔNG viết lại nghiệp vụ — nó tái sử dụng service của
 * `borrowing-slips`, `borrowings`, `reservations` và chỉ thêm hai thứ:
 *  1. `memberId` luôn lấy từ JWT, không nhận từ request.
 *  2. Kiểm tra chủ sở hữu trước mọi thao tác, trả 404 nếu bản ghi không thuộc
 *     người gọi (404 chứ không 403 để không tiết lộ bản ghi đó có tồn tại).
 */
@Module({
  imports: [AuthModule, BorrowingSlipsModule, BorrowingsModule, ReservationsModule],
  controllers: [MeController],
  providers: [MeService, MemberCardGuard],
})
export class MeModule {}
