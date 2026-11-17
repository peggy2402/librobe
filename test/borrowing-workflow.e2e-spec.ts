/**
 * E2E nghiệp vụ mượn — đặt trước — gia hạn — trả sách — hàng đợi — hủy phiếu.
 *
 * 14 kịch bản chạy TUẦN TỰ và phụ thuộc nhau (S1 -> ... -> C1), dùng chung một
 * database test. Mỗi kịch bản kiểm tra ba lớp: HTTP status, response body, và
 * trạng thái thực tế trong database.
 *
 * Lưu ý về phân quyền: đây là hệ thống back office. Các thao tác tại quầy
 * (duyệt, gia hạn, trả sách, hủy phiếu) chỉ ADMIN/LIBRARIAN gọi được; độc giả
 * chỉ tự lập phiếu yêu cầu và tự đặt trước. Vì vậy ở RN1 và C1, bài test xác
 * minh cả hai điều: độc giả bị chặn 403, và thủ thư thực hiện thay cho họ.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  closeTestApp,
  createTestApp,
  resetDatabase,
  TestContext,
} from './helpers/test-app.js';
import { LibraryFixture, seedLibrary } from './fixtures/library-fixture.js';

const DAY_MS = 24 * 60 * 60 * 1000;

let ctx: TestContext;
let fx: LibraryFixture;

/** Trạng thái chia sẻ giữa các kịch bản tuần tự. */
const state = {
  slipS1: '', // B: Nhà Giả Kim + Mắt Biếc
  slipS2: '', // D: Clean Architecture
  slipS3: '', // C: Sapiens + Đắc Nhân Tâm
  slipS4: '', // A: Clean Code (chờ duyệt)
  slipS5: '', // A: Nhà Giả Kim (sau khi reservation READY)
  reservationA: '',
  reservationC: '',
  s1DueDate: '',
  s2DueDateBeforeRenew: '',
  s2DueDateAfterRenew: '',
};

/** Đọc tồn kho khả dụng của một cuốn sách trực tiếp từ database. */
async function availableCopies(bookId: string): Promise<number> {
  const b = await ctx.prisma.book.findUniqueOrThrow({
    where: { id: bookId },
    select: { copiesAvailable: true },
  });
  return b.copiesAvailable;
}

/** Số sách độc giả đang giữ theo cột đếm trong database. */
async function borrowedCount(memberId: string): Promise<number> {
  const m = await ctx.prisma.member.findUniqueOrThrow({
    where: { id: memberId },
    select: { currentBorrowedCount: true },
  });
  return m.currentBorrowedCount;
}

/** Số bản sách đang thực sự nằm ngoài thư viện (cộng cả hai luồng mượn). */
async function copiesOnLoan(bookId: string): Promise<number> {
  const legacy = await ctx.prisma.borrowing.count({
    where: { bookId, returnDate: null, status: { in: ['BORROWED', 'OVERDUE'] } },
  });
  const items = await ctx.prisma.borrowingSlipItem.findMany({
    where: {
      bookId,
      status: { in: ['PENDING', 'BORROWING'] },
      slip: { status: { in: ['BORROWED', 'PARTIAL_RETURNED'] } },
    },
    select: { quantity: true, returnedQuantity: true, lostQuantity: true },
  });
  const fromSlips = items.reduce(
    (sum, it) => sum + Math.max(0, it.quantity - it.returnedQuantity - it.lostQuantity),
    0,
  );
  return legacy + fromSlips;
}

/**
 * Độc giả tự lập phiếu mượn qua kênh tự phục vụ `/api/me/*` (mobile app).
 * `memberId` lấy từ JWT nên body không cần — và cũng không thể — khai thẻ của
 * người khác.
 */
async function createSlip(
  actorToken: string,
  items: Array<{ bookId: string; quantity: number }>,
) {
  return ctx.as(actorToken).post('/api/me/borrowing-slips', { items });
}

/** Độc giả tự đặt trước qua kênh tự phục vụ. */
async function reserve(actorToken: string, bookId: string) {
  return ctx.as(actorToken).post('/api/me/reservations', { bookId });
}

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

describe('Quy trình mượn / đặt trước / gia hạn / trả sách (E2E)', () => {
  // =========================================================================
  it('Thiết lập: 6 đầu sách mỗi cuốn 1 bản, 4 độc giả và 1 thủ thư', async () => {
    const books = Object.values(fx.books);
    expect(books).toHaveLength(6);
    for (const b of books) {
      expect(await availableCopies(b.id)).toBe(1);
    }

    // Vai trò phải đúng: A/B/C/D là MEMBER, chỉ librarian là LIBRARIAN
    for (const actor of [fx.A, fx.B, fx.C, fx.D]) {
      const u = await ctx.prisma.user.findUniqueOrThrow({ where: { id: actor.userId } });
      expect(u.role).toBe('MEMBER');
      expect(actor.memberId).toBeTruthy();
    }
    const lib = await ctx.prisma.user.findUniqueOrThrow({ where: { id: fx.librarian.userId } });
    expect(lib.role).toBe('LIBRARIAN');
  });

  // =========================================================================
  it('S1 — B mượn Nhà Giả Kim + Mắt Biếc, thủ thư duyệt', async () => {
    const created = await createSlip(fx.B.token, [
      { bookId: fx.books.nhaGiaKim.id, quantity: 1 },
      { bookId: fx.books.matBiec.id, quantity: 1 },
    ]);

    expect(created.status).toBe(201);
    expect(created.body.status).toBe('PENDING_APPROVAL');
    expect(created.body.items).toHaveLength(2);
    state.slipS1 = created.body.id;

    // Lập phiếu CHƯA được trừ kho
    expect(await availableCopies(fx.books.nhaGiaKim.id)).toBe(1);
    expect(await availableCopies(fx.books.matBiec.id)).toBe(1);

    const approved = await ctx
      .as(fx.librarian.token)
      .patch(`/api/borrowing-slips/${state.slipS1}/approve`);

    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe('BORROWED');
    expect(approved.body.borrowDate).toBeTruthy();
    expect(approved.body.approvedBy).toBe(fx.librarian.email);
    expect(approved.body.approvedById).toBe(fx.librarian.userId);
    state.s1DueDate = approved.body.dueDate;

    // Hạn trả = ngày mượn + 14 ngày theo cấu hình
    const span = Math.round(
      (new Date(approved.body.dueDate).getTime() - new Date(approved.body.borrowDate).getTime()) /
        DAY_MS,
    );
    expect(span).toBe(14);

    // Database: cả 2 dòng chuyển BORROWING, tồn kho về 0, B đang giữ 2 cuốn
    const slip = await ctx.prisma.borrowingSlip.findUniqueOrThrow({
      where: { id: state.slipS1 },
      include: { items: true },
    });
    expect(slip.status).toBe('BORROWED');
    expect(slip.items.every((i) => i.status === 'BORROWING')).toBe(true);
    expect(await availableCopies(fx.books.nhaGiaKim.id)).toBe(0);
    expect(await availableCopies(fx.books.matBiec.id)).toBe(0);
    expect(await borrowedCount(fx.B.memberId)).toBe(2);
  });

  // =========================================================================
  it('S2 — D mượn Clean Architecture, thủ thư duyệt', async () => {
    const created = await createSlip(fx.D.token, [
      { bookId: fx.books.cleanArchitecture.id, quantity: 1 },
    ]);
    expect(created.status).toBe(201);
    state.slipS2 = created.body.id;

    const approved = await ctx
      .as(fx.librarian.token)
      .patch(`/api/borrowing-slips/${state.slipS2}/approve`);
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe('BORROWED');
    expect(approved.body.renewCount).toBe(0);
    state.s2DueDateBeforeRenew = approved.body.dueDate;

    expect(await availableCopies(fx.books.cleanArchitecture.id)).toBe(0);
    expect(await borrowedCount(fx.D.memberId)).toBe(1);
    expect(await copiesOnLoan(fx.books.cleanArchitecture.id)).toBe(1);
  });

  // =========================================================================
  it('S3 — C mượn Sapiens + Đắc Nhân Tâm, thủ thư duyệt', async () => {
    const created = await createSlip(fx.C.token, [
      { bookId: fx.books.sapiens.id, quantity: 1 },
      { bookId: fx.books.dacNhanTam.id, quantity: 1 },
    ]);
    expect(created.status).toBe(201);
    state.slipS3 = created.body.id;

    const approved = await ctx
      .as(fx.librarian.token)
      .patch(`/api/borrowing-slips/${state.slipS3}/approve`);
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe('BORROWED');

    expect(await availableCopies(fx.books.sapiens.id)).toBe(0);
    expect(await availableCopies(fx.books.dacNhanTam.id)).toBe(0);
    expect(await borrowedCount(fx.C.memberId)).toBe(2);
  });

  // =========================================================================
  it('S4 — A lập phiếu Clean Code nhưng KHÔNG duyệt', async () => {
    const created = await createSlip(fx.A.token, [
      { bookId: fx.books.cleanCode.id, quantity: 1 },
    ]);
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('PENDING_APPROVAL');
    state.slipS4 = created.body.id;

    // Chưa duyệt thì KHÔNG được coi là đang mượn, kho không đổi
    const slip = await ctx.prisma.borrowingSlip.findUniqueOrThrow({
      where: { id: state.slipS4 },
      include: { items: true },
    });
    expect(slip.status).toBe('PENDING_APPROVAL');
    expect(slip.borrowDate).toBeNull();
    expect(slip.items.every((i) => i.status === 'PENDING')).toBe(true);

    expect(await availableCopies(fx.books.cleanCode.id)).toBe(1);
    expect(await copiesOnLoan(fx.books.cleanCode.id)).toBe(0);
    expect(await borrowedCount(fx.A.memberId)).toBe(0);
  });

  // =========================================================================
  it('R1 — A đặt trước Nhà Giả Kim (đang bị B giữ) → PENDING', async () => {
    expect(await availableCopies(fx.books.nhaGiaKim.id)).toBe(0);

    const res = await reserve(fx.A.token, fx.books.nhaGiaKim.id);

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('PENDING');
    expect(res.body.readyAt).toBeUndefined();
    expect(res.body.expiresAt).toBeUndefined();
    state.reservationA = res.body.id;

    const row = await ctx.prisma.reservation.findUniqueOrThrow({
      where: { id: state.reservationA },
    });
    expect(row.status).toBe('PENDING');
    expect(row.memberId).toBe(fx.A.memberId);
  });

  // =========================================================================
  it('R2 — C đặt trước Nhà Giả Kim sau A → PENDING và đứng sau A', async () => {
    const res = await reserve(fx.C.token, fx.books.nhaGiaKim.id);

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('PENDING');
    state.reservationC = res.body.id;

    // Hàng đợi xếp theo reservedAt tăng dần: A trước C
    const queue = await ctx.as(fx.librarian.token).get(
      `/api/reservations/book/${fx.books.nhaGiaKim.id}/queue`,
    );
    expect(queue.status).toBe(200);
    expect(queue.body).toHaveLength(2);
    expect(queue.body[0].memberId).toBe(fx.A.memberId);
    expect(queue.body[1].memberId).toBe(fx.C.memberId);

    const a = await ctx.prisma.reservation.findUniqueOrThrow({ where: { id: state.reservationA } });
    const c = await ctx.prisma.reservation.findUniqueOrThrow({ where: { id: state.reservationC } });
    expect(a.reservedAt.getTime()).toBeLessThanOrEqual(c.reservedAt.getTime());
  });

  // =========================================================================
  it('RN1 — Gia hạn S1 bị chặn vì Nhà Giả Kim đã có người đặt trước', async () => {
    // Độc giả không được gọi endpoint quản trị
    const viaAdminEndpoint = await ctx
      .as(fx.B.token)
      .patch(`/api/borrowing-slips/${state.slipS1}/renew`, { extraDays: 7 });
    expect(viaAdminEndpoint.status).toBe(403);

    // B tự xin gia hạn qua kênh mobile -> bị chặn vì lý do nghiệp vụ: có đặt trước
    const byMember = await ctx
      .as(fx.B.token)
      .patch(`/api/me/borrowing-slips/${state.slipS1}/renew`, { extraDays: 7 });
    expect(byMember.status).toBe(409);
    expect(byMember.body.message).toMatch(/đặt trước/i);

    // Thủ thư thực hiện thay cũng bị chặn với cùng lý do
    const byLibrarian = await ctx
      .as(fx.librarian.token)
      .patch(`/api/borrowing-slips/${state.slipS1}/renew`, { extraDays: 7 });

    expect(byLibrarian.status).toBe(409);
    expect(byLibrarian.body.message).toMatch(/đặt trước/i);

    // Không có side effect: hạn trả, số lần gia hạn, lịch sử, reservation đều nguyên
    const slip = await ctx.prisma.borrowingSlip.findUniqueOrThrow({
      where: { id: state.slipS1 },
    });
    expect(slip.renewCount).toBe(0);
    expect(slip.dueDate.toISOString()).toBe(new Date(state.s1DueDate).toISOString());
    expect(await ctx.prisma.loanRenewal.count({ where: { slipId: state.slipS1 } })).toBe(0);

    const a = await ctx.prisma.reservation.findUniqueOrThrow({ where: { id: state.reservationA } });
    const c = await ctx.prisma.reservation.findUniqueOrThrow({ where: { id: state.reservationC } });
    expect(a.status).toBe('PENDING');
    expect(c.status).toBe('PENDING');
  });

  // =========================================================================
  it('RN2 — Gia hạn S2 lần 1 thành công, hạn trả + 7 ngày', async () => {
    const res = await ctx
      .as(fx.librarian.token)
      .patch(`/api/borrowing-slips/${state.slipS2}/renew`, {
        extraDays: 7,
        renewedBy: 'Thủ thư E2E',
      });

    expect(res.status).toBe(200);
    expect(res.body.renewCount).toBe(1);
    state.s2DueDateAfterRenew = res.body.dueDate;

    // Cộng vào HẠN CŨ, không phải vào hôm nay
    const before = new Date(state.s2DueDateBeforeRenew).getTime();
    const after = new Date(state.s2DueDateAfterRenew).getTime();
    expect(after - before).toBe(7 * DAY_MS);

    // Lịch sử gia hạn được ghi đúng
    const history = await ctx
      .as(fx.librarian.token)
      .get(`/api/borrowing-slips/${state.slipS2}/renewals`);
    expect(history.status).toBe(200);
    expect(history.body).toHaveLength(1);
    expect(history.body[0].sequence).toBe(1);
    expect(history.body[0].extraDays).toBe(7);
    expect(new Date(history.body[0].previousDueDate).getTime()).toBe(before);
    expect(new Date(history.body[0].newDueDate).getTime()).toBe(after);

    const slip = await ctx.prisma.borrowingSlip.findUniqueOrThrow({ where: { id: state.slipS2 } });
    expect(slip.renewCount).toBe(1);
    expect(slip.dueDate.getTime()).toBe(after);
  });

  // =========================================================================
  it('RN3 — Gia hạn S2 lần 2 bị chặn vì đạt giới hạn 1 lần', async () => {
    const res = await ctx
      .as(fx.librarian.token)
      .patch(`/api/borrowing-slips/${state.slipS2}/renew`, { extraDays: 7 });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/số lần gia hạn tối đa/i);

    // Không có side effect
    const slip = await ctx.prisma.borrowingSlip.findUniqueOrThrow({ where: { id: state.slipS2 } });
    expect(slip.renewCount).toBe(1);
    expect(slip.dueDate.getTime()).toBe(new Date(state.s2DueDateAfterRenew).getTime());
    expect(await ctx.prisma.loanRenewal.count({ where: { slipId: state.slipS2 } })).toBe(1);
  });

  // =========================================================================
  it('RT1 — Thủ thư cho B trả riêng Nhà Giả Kim, Mắt Biếc vẫn đang mượn', async () => {
    const slipBefore = await ctx.prisma.borrowingSlip.findUniqueOrThrow({
      where: { id: state.slipS1 },
      include: { items: true },
    });
    const itemNgk = slipBefore.items.find((i) => i.bookId === fx.books.nhaGiaKim.id)!;
    const itemMb = slipBefore.items.find((i) => i.bookId === fx.books.matBiec.id)!;

    const res = await ctx
      .as(fx.librarian.token)
      .post(`/api/borrowing-slips/${state.slipS1}/return-items`, {
        items: [{ itemId: itemNgk.id, returnCondition: 'GOOD', quantity: 1 }],
      });

    expect(res.status).toBe(200);
    // Còn Mắt Biếc chưa trả nên phiếu KHÔNG được chuyển COMPLETED
    expect(res.body.status).toBe('PARTIAL_RETURNED');
    // Trả đúng hạn nên không phát sinh tiền phạt
    expect(res.body.totalFine).toBe(0);

    const returnedItem = res.body.items.find((i: any) => i.bookId === fx.books.nhaGiaKim.id);
    const keptItem = res.body.items.find((i: any) => i.bookId === fx.books.matBiec.id);
    expect(returnedItem.status).toBe('RETURNED');
    expect(returnedItem.returnedQuantity).toBe(1);
    expect(returnedItem.lateFee).toBe(0);
    expect(keptItem.status).toBe('BORROWING');
    expect(keptItem.returnedQuantity).toBe(0);

    // Database
    const ngkRow = await ctx.prisma.borrowingSlipItem.findUniqueOrThrow({
      where: { id: itemNgk.id },
    });
    const mbRow = await ctx.prisma.borrowingSlipItem.findUniqueOrThrow({ where: { id: itemMb.id } });
    expect(ngkRow.status).toBe('RETURNED');
    expect(ngkRow.returnDate).toBeTruthy();
    expect(mbRow.status).toBe('BORROWING');
    expect(mbRow.returnDate).toBeNull();

    // Kho Nhà Giả Kim hoàn lại 1, Mắt Biếc vẫn 0
    expect(await availableCopies(fx.books.nhaGiaKim.id)).toBe(1);
    expect(await availableCopies(fx.books.matBiec.id)).toBe(0);
    expect(await borrowedCount(fx.B.memberId)).toBe(1);
    expect(await copiesOnLoan(fx.books.nhaGiaKim.id)).toBe(0);
  });

  // =========================================================================
  it('Q1 — Sau khi trả: A chuyển READY, C vẫn PENDING, chỉ 1 phiếu READY', async () => {
    const a = await ctx.prisma.reservation.findUniqueOrThrow({ where: { id: state.reservationA } });
    const c = await ctx.prisma.reservation.findUniqueOrThrow({ where: { id: state.reservationC } });

    expect(a.status).toBe('READY');
    expect(a.readyAt).toBeTruthy();
    expect(a.expiresAt).toBeTruthy();
    expect(c.status).toBe('PENDING');
    expect(c.readyAt).toBeNull();

    // Hạn giữ sách = readyAt + 3 ngày theo cấu hình
    const holdDays = Math.round((a.expiresAt!.getTime() - a.readyAt!.getTime()) / DAY_MS);
    expect(holdDays).toBe(3);

    // Chỉ đúng 1 phiếu READY cho cuốn sách chỉ có 1 bản
    const readyCount = await ctx.prisma.reservation.count({
      where: { bookId: fx.books.nhaGiaKim.id, status: 'READY' },
    });
    expect(readyCount).toBe(1);
    expect(readyCount).toBeLessThanOrEqual(fx.books.nhaGiaKim.copiesTotal);

    // A được ưu tiên trước C
    const queue = await ctx
      .as(fx.librarian.token)
      .get(`/api/reservations/book/${fx.books.nhaGiaKim.id}/queue`);
    expect(queue.body[0].memberId).toBe(fx.A.memberId);
    expect(queue.body[0].status).toBe('READY');
    expect(queue.body[1].status).toBe('PENDING');
  });

  // =========================================================================
  it('S5 — A mượn Nhà Giả Kim sau khi đặt trước đã READY', async () => {
    const created = await createSlip(fx.A.token, [
      { bookId: fx.books.nhaGiaKim.id, quantity: 1 },
    ]);
    expect(created.status).toBe(201);
    state.slipS5 = created.body.id;

    const approved = await ctx
      .as(fx.librarian.token)
      .patch(`/api/borrowing-slips/${state.slipS5}/approve`);
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe('BORROWED');

    expect(await availableCopies(fx.books.nhaGiaKim.id)).toBe(0);
    expect(await copiesOnLoan(fx.books.nhaGiaKim.id)).toBe(1);
    expect(await borrowedCount(fx.A.memberId)).toBe(1);

    // Phiếu đặt trước của A được đóng khi chuyển thành phiếu mượn
    const a = await ctx.prisma.reservation.findUniqueOrThrow({ where: { id: state.reservationA } });
    expect(a.status).toBe('FULFILLED');
    expect(a.fulfilledAt).toBeTruthy();
  });

  // =========================================================================
  it('F1 — Trạng thái cuối: R1 FULFILLED, C còn PENDING, tồn kho nhất quán', async () => {
    const a = await ctx.prisma.reservation.findUniqueOrThrow({ where: { id: state.reservationA } });
    const c = await ctx.prisma.reservation.findUniqueOrThrow({ where: { id: state.reservationC } });
    expect(a.status).toBe('FULFILLED');
    expect(c.status).toBe('PENDING');

    const book = await ctx.prisma.book.findUniqueOrThrow({
      where: { id: fx.books.nhaGiaKim.id },
      select: { copiesTotal: true, copiesAvailable: true },
    });
    expect(book.copiesTotal).toBe(1);
    expect(book.copiesAvailable).toBe(0);

    // Không có chuyện 1 bản sách được cấp cho 2 người
    expect(await copiesOnLoan(fx.books.nhaGiaKim.id)).toBe(1);
    expect(
      await ctx.prisma.reservation.count({
        where: { bookId: fx.books.nhaGiaKim.id, status: 'READY' },
      }),
    ).toBe(0);

    // Tồn kho khớp công thức: tổng - đang cho mượn, với MỌI cuốn sách
    for (const b of Object.values(fx.books)) {
      const row = await ctx.prisma.book.findUniqueOrThrow({
        where: { id: b.id },
        select: { copiesTotal: true, copiesAvailable: true },
      });
      const onLoan = await copiesOnLoan(b.id);
      expect(row.copiesAvailable).toBe(row.copiesTotal - onLoan);
      expect(row.copiesAvailable).toBeGreaterThanOrEqual(0);
      expect(row.copiesAvailable).toBeLessThanOrEqual(row.copiesTotal);
    }
  });

  // =========================================================================
  it('C1 — Hủy phiếu S4 đang chờ duyệt, kho không bị ảnh hưởng', async () => {
    // Độc giả không được gọi endpoint quản trị
    const viaAdminEndpoint = await ctx
      .as(fx.A.token)
      .patch(`/api/borrowing-slips/${state.slipS4}/cancel`, { reason: 'A đổi ý' });
    expect(viaAdminEndpoint.status).toBe(403);

    // A TỰ hủy phiếu chờ duyệt của mình qua kênh mobile -> được phép
    const res = await ctx
      .as(fx.A.token)
      .patch(`/api/me/borrowing-slips/${state.slipS4}/cancel`, { reason: 'Độc giả A đổi ý' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CANCELLED');
    expect(res.body.cancelReason).toBe('Độc giả A đổi ý');
    // Vết audit ghi đúng chính A là người hủy
    expect(res.body.cancelledById).toBe(fx.A.userId);

    const slip = await ctx.prisma.borrowingSlip.findUniqueOrThrow({
      where: { id: state.slipS4 },
      include: { items: true },
    });
    expect(slip.status).toBe('CANCELLED');
    expect(slip.items.every((i) => i.status === 'CANCELLED')).toBe(true);

    // Phiếu đã hủy thì không duyệt được nữa
    const approveAfter = await ctx
      .as(fx.librarian.token)
      .patch(`/api/borrowing-slips/${state.slipS4}/approve`);
    expect(approveAfter.status).toBe(409);

    // Kho Clean Code không đổi, không phát sinh bản ghi mượn
    expect(await availableCopies(fx.books.cleanCode.id)).toBe(1);
    expect(await copiesOnLoan(fx.books.cleanCode.id)).toBe(0);
    expect(await ctx.prisma.borrowing.count({ where: { bookId: fx.books.cleanCode.id } })).toBe(0);
  });

  // =========================================================================
  it('Bổ sung — Hai phiếu cùng duyệt bản sách cuối: chỉ 1 thành công', async () => {
    // Mắt Biếc vẫn đang bị B giữ. Cho B trả để còn đúng 1 bản khả dụng.
    const s1 = await ctx.prisma.borrowingSlip.findUniqueOrThrow({
      where: { id: state.slipS1 },
      include: { items: true },
    });
    const itemMb = s1.items.find((i) => i.bookId === fx.books.matBiec.id)!;
    await ctx
      .as(fx.librarian.token)
      .post(`/api/borrowing-slips/${state.slipS1}/return-items`, {
        items: [{ itemId: itemMb.id, returnCondition: 'GOOD', quantity: 1 }],
      });
    expect(await availableCopies(fx.books.matBiec.id)).toBe(1);

    // C và D cùng lập phiếu cho Mắt Biếc
    const slipC = (await createSlip(fx.C.token, [
      { bookId: fx.books.matBiec.id, quantity: 1 },
    ])).body.id;
    const slipD = (await createSlip(fx.D.token, [
      { bookId: fx.books.matBiec.id, quantity: 1 },
    ])).body.id;

    // Duyệt đồng thời
    const [rc, rd] = await Promise.all([
      ctx.as(fx.librarian.token).patch(`/api/borrowing-slips/${slipC}/approve`),
      ctx.as(fx.librarian.token).patch(`/api/borrowing-slips/${slipD}/approve`),
    ]);

    const codes = [rc.status, rd.status].sort((x, y) => x - y);
    expect(codes).toEqual([200, 409]);

    // Tồn kho không âm, chỉ 1 bản được cho mượn
    const book = await ctx.prisma.book.findUniqueOrThrow({
      where: { id: fx.books.matBiec.id },
      select: { copiesAvailable: true, copiesTotal: true },
    });
    expect(book.copiesAvailable).toBe(0);
    expect(await copiesOnLoan(fx.books.matBiec.id)).toBe(1);

    // Phiếu thua vẫn ở PENDING_APPROVAL, không bị chuyển trạng thái nửa vời
    const loserId = rc.status === 409 ? slipC : slipD;
    const loser = await ctx.prisma.borrowingSlip.findUniqueOrThrow({ where: { id: loserId } });
    expect(loser.status).toBe('PENDING_APPROVAL');
    expect(loser.borrowDate).toBeNull();
  });

  // =========================================================================
  it('Bổ sung — Phân quyền: độc giả không thực hiện được thao tác tại quầy', async () => {
    const memberAttempts = await Promise.all([
      ctx.as(fx.B.token).patch(`/api/borrowing-slips/${state.slipS5}/approve`),
      ctx.as(fx.B.token).patch(`/api/borrowing-slips/${state.slipS5}/reject`, { reason: 'x' }),
      ctx.as(fx.B.token).post(`/api/borrowing-slips/${state.slipS5}/return-items`, {
        items: [{ itemId: 'bat-ky', returnCondition: 'GOOD', quantity: 1 }],
      }),
      ctx.as(fx.B.token).post(`/api/borrowing-slips/${state.slipS5}/pay-fine`),
      ctx.as(fx.B.token).get('/api/stats'),
      ctx.as(fx.B.token).get('/api/users'),
      ctx.as(fx.B.token).get('/api/members'),
      ctx.as(fx.B.token).get('/api/borrowing-slips'),
      ctx.as(fx.B.token).post('/api/borrowing-slips', {
        memberId: fx.D.memberId,
        items: [{ bookId: fx.books.cleanCode.id, quantity: 1 }],
      }),
      ctx.as(fx.B.token).get('/api/reservations'),
      ctx.as(fx.B.token).post('/api/reservations', {
        memberId: fx.D.memberId,
        bookId: fx.books.cleanCode.id,
      }),
    ]);
    for (const r of memberAttempts) {
      expect(r.status).toBe(403);
    }

    // Không token thì 401 chứ không phải 403
    const anonRes = await ctx.anon().get('/api/borrowing-slips');
    expect(anonRes.status).toBe(401);

    // Thủ thư xem được báo cáo nhưng KHÔNG quản trị tài khoản
    expect((await ctx.as(fx.librarian.token).get('/api/stats')).status).toBe(200);
    expect((await ctx.as(fx.librarian.token).get('/api/users')).status).toBe(403);
  });
});
