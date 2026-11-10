import { Global, Module } from '@nestjs/common';
import { BookStockService } from './book-stock.service.js';
import { LoanEligibilityService } from './loan-eligibility.service.js';
import { LoanPolicyService } from './loan-policy.service.js';

/**
 * Module hạ tầng nghiệp vụ dùng chung cho cả hai luồng mượn sách
 * (`borrowings` và `borrowing-slips`) cùng với `members`, `reservations`.
 * Đánh dấu @Global theo đúng cách PrismaModule đang làm để tránh phải khai báo
 * lặp ở từng feature module.
 */
@Global()
@Module({
  providers: [LoanPolicyService, LoanEligibilityService, BookStockService],
  exports: [LoanPolicyService, LoanEligibilityService, BookStockService],
})
export class LoanPolicyModule {}
