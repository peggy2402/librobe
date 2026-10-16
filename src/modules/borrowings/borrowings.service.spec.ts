import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { BorrowingStatus } from '../../common/enums/borrowing-status.enum.js';
import { DatabaseModule } from '../database/database.module.js';
import { DatabaseService } from '../database/database.service.js';
import { BorrowingsService } from './borrowings.service.js';

describe('BorrowingsService', () => {
  let service: BorrowingsService;
  let db: DatabaseService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [DatabaseModule],
      providers: [BorrowingsService],
    }).compile();

    service = module.get<BorrowingsService>(BorrowingsService);
    db = module.get<DatabaseService>(DatabaseService);
    db.onModuleInit();
  });

  it('nên cho phép độc giả mượn sách thành công và giảm số lượng bản in tồn kho', () => {
    const bookBefore = db.getBookById('book-05')!;
    const availableBefore = bookBefore.copiesAvailable;

    const borrowing = service.borrowBook({
      memberId: 'mem-02',
      bookId: 'book-05',
      durationDays: 14,
    });

    expect(borrowing.id).toBeDefined();
    expect(borrowing.status).toBe(BorrowingStatus.BORROWED);
    expect(borrowing.transactionCode).toContain('BRW-');

    const bookAfter = db.getBookById('book-05')!;
    expect(bookAfter.copiesAvailable).toBe(availableBefore - 1);
  });

  it('nên từ chối khi độc giả có thẻ đã hết hạn mượn sách', () => {
    expect(() =>
      service.borrowBook({
        memberId: 'mem-04', // Phạm Thu Trang (EXPIRED)
        bookId: 'book-01',
      }),
    ).toThrow(BadRequestException);
  });

  it('nên hoàn trả sách thành công và hoàn lại số lượng bản in vào kho', () => {
    const borrowing = db.getBorrowingById('brw-03')!; // Đang BORROWED cuốn book-04
    const bookBefore = db.getBookById(borrowing.bookId)!;
    const availableBefore = bookBefore.copiesAvailable;

    const returned = service.returnBook(borrowing.id, {
      notes: 'Sách trả tốt',
      finePaid: true,
    });

    expect(returned.status).toBe(BorrowingStatus.RETURNED);
    expect(returned.returnDate).toBeDefined();

    const bookAfter = db.getBookById(borrowing.bookId)!;
    expect(bookAfter.copiesAvailable).toBe(availableBefore + 1);
  });

  it('nên gia hạn thời gian mượn sách thành công', () => {
    const borrowing = db.getBorrowingById('brw-03')!;
    const oldDueDate = new Date(borrowing.dueDate);

    const renewed = service.renewLoan(borrowing.id, { extraDays: 7 });

    expect(renewed.renewCount).toBe(1);
    expect(new Date(renewed.dueDate).getTime()).toBeGreaterThan(oldDueDate.getTime());
  });
});
