/**
 * Hạn trả phải được tính từ lúc sách THỰC SỰ rời kệ (thời điểm thủ thư duyệt),
 * không phải từ lúc độc giả gửi yêu cầu.
 *
 * Tình huống: độc giả lập phiếu ngày 16/11 xin mượn 14 ngày. Thủ thư đến
 * ngày 18/11 mới duyệt. Nếu giữ nguyên hạn trả 30/11 đã tính lúc lập phiếu thì
 * độc giả chỉ được mượn 12 ngày — bị trừ oan 2 ngày vì thư viện duyệt chậm.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, createTestApp, resetDatabase, TestContext } from './helpers/test-app.js';
import { LibraryFixture, seedLibrary } from './fixtures/library-fixture.js';

const DAY = 24 * 60 * 60 * 1000;

let ctx: TestContext;
let fx: LibraryFixture;

beforeAll(async () => {
  ctx = await createTestApp();
  await resetDatabase(ctx.prisma);
  fx = await seedLibrary(ctx);
}, 60_000);

afterAll(async () => {
  if (ctx) {
    await resetDatabase(ctx.prisma);
    await closeTestApp(ctx);
  }
});

/**
 * Lùi thời điểm lập phiếu về quá khứ để mô phỏng phiếu nằm chờ duyệt.
 * Hạn trả cũng lùi tương ứng, đúng như giá trị đã tính lúc lập phiếu.
 */
async function backdateSlip(slipId: string, daysAgo: number) {
  const slip = await ctx.prisma.borrowingSlip.findUniqueOrThrow({ where: { id: slipId } });
  await ctx.prisma.borrowingSlip.update({
    where: { id: slipId },
    data: {
      createdAt: new Date(slip.createdAt.getTime() - daysAgo * DAY),
      dueDate: new Date(slip.dueDate.getTime() - daysAgo * DAY),
    },
  });
}

describe('Hạn trả khi thủ thư duyệt muộn', () => {
  it('phiếu xin 14 ngày, duyệt sau 2 ngày → vẫn được trọn 14 ngày kể từ lúc duyệt', async () => {
    const created = await ctx.as(fx.B.token).post('/api/me/borrowing-slips', {
      items: [{ bookId: fx.books.nhaGiaKim.id, quantity: 1 }],
      expectedReturnDays: 14,
    });
    expect(created.status).toBe(201);

    await backdateSlip(created.body.id, 2);

    const beforeApprove = await ctx.prisma.borrowingSlip.findUniqueOrThrow({
      where: { id: created.body.id },
    });

    const approved = await ctx
      .as(fx.librarian.token)
      .patch(`/api/borrowing-slips/${created.body.id}/approve`);
    expect(approved.status).toBe(200);

    const borrowDate = new Date(approved.body.borrowDate);
    const dueDate = new Date(approved.body.dueDate);
    const actualLoanDays = Math.round((dueDate.getTime() - borrowDate.getTime()) / DAY);

    // Điểm cốt lõi: độc giả được trọn 14 ngày tính từ lúc nhận sách
    expect(actualLoanDays).toBe(14);

    // Và hạn trả phải được đẩy lên so với giá trị tạm tính lúc lập phiếu
    expect(dueDate.getTime()).toBeGreaterThan(beforeApprove.dueDate.getTime());
    expect(Math.round((dueDate.getTime() - beforeApprove.dueDate.getTime()) / DAY)).toBe(2);
  });

  it('tôn trọng số ngày độc giả đã xin, không áp cứng 14 ngày', async () => {
    const created = await ctx.as(fx.C.token).post('/api/me/borrowing-slips', {
      items: [{ bookId: fx.books.sapiens.id, quantity: 1 }],
      expectedReturnDays: 7,
    });
    expect(created.status).toBe(201);

    await backdateSlip(created.body.id, 3);

    const approved = await ctx
      .as(fx.librarian.token)
      .patch(`/api/borrowing-slips/${created.body.id}/approve`);
    expect(approved.status).toBe(200);

    const days = Math.round(
      (new Date(approved.body.dueDate).getTime() -
        new Date(approved.body.borrowDate).getTime()) /
        DAY,
    );
    expect(days).toBe(7);
  });

  it('duyệt ngay trong ngày thì hạn trả không đổi bất thường', async () => {
    const created = await ctx.as(fx.D.token).post('/api/me/borrowing-slips', {
      items: [{ bookId: fx.books.cleanArchitecture.id, quantity: 1 }],
      expectedReturnDays: 14,
    });
    const approved = await ctx
      .as(fx.librarian.token)
      .patch(`/api/borrowing-slips/${created.body.id}/approve`);

    const days = Math.round(
      (new Date(approved.body.dueDate).getTime() -
        new Date(approved.body.borrowDate).getTime()) /
        DAY,
    );
    expect(days).toBe(14);
  });

  it('phiếu cũ không lưu số ngày yêu cầu vẫn suy ra đúng từ dữ liệu sẵn có', async () => {
    const created = await ctx.as(fx.A.token).post('/api/me/borrowing-slips', {
      items: [{ bookId: fx.books.matBiec.id, quantity: 1 }],
      expectedReturnDays: 10,
    });
    await backdateSlip(created.body.id, 4);

    // Mô phỏng dữ liệu cũ: xóa số ngày đã lưu, chỉ còn createdAt và dueDate
    await ctx.prisma.borrowingSlip.update({
      where: { id: created.body.id },
      data: { expectedReturnDays: null },
    });

    const approved = await ctx
      .as(fx.librarian.token)
      .patch(`/api/borrowing-slips/${created.body.id}/approve`);
    expect(approved.status).toBe(200);

    const days = Math.round(
      (new Date(approved.body.dueDate).getTime() -
        new Date(approved.body.borrowDate).getTime()) /
        DAY,
    );
    // Suy ra từ (dueDate - createdAt) của phiếu cũ = 10 ngày
    expect(days).toBe(10);
  });
});
