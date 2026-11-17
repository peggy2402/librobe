/**
 * E2E cho kênh Mobile App (hướng B).
 *
 * Nguyên tắc: độc giả chỉ truy cập được nhóm `/api/me/*` và danh mục sách.
 * Mọi endpoint quản trị đều khóa cho ADMIN/LIBRARIAN. Nhóm `/me/*` lấy
 * `memberId` từ JWT nên về bản chất không có đường nào trả dữ liệu của người
 * khác, cũng không có đường nào mạo danh thẻ độc giả khác.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, createTestApp, resetDatabase, TestContext } from './helpers/test-app.js';
import { LibraryFixture, seedLibrary } from './fixtures/library-fixture.js';

let ctx: TestContext;
let fx: LibraryFixture;

/** Phiếu mượn của B do thủ thư lập, dùng để kiểm tra A không đọc được. */
let slipOfB = '';
/** Phiếu đặt trước của C, dùng để kiểm tra A không hủy được. */
let reservationOfC = '';

beforeAll(async () => {
  ctx = await createTestApp();
  await resetDatabase(ctx.prisma);
  fx = await seedLibrary(ctx);

  // Thủ thư lập và duyệt phiếu cho B (luồng tại quầy)
  const created = await ctx.as(fx.librarian.token).post('/api/borrowing-slips', {
    memberId: fx.B.memberId,
    items: [{ bookId: fx.books.nhaGiaKim.id, quantity: 1 }],
  });
  slipOfB = created.body.id;
  await ctx.as(fx.librarian.token).patch(`/api/borrowing-slips/${slipOfB}/approve`);

  // C đặt trước cuốn đang bị B giữ
  const resv = await ctx.as(fx.librarian.token).post('/api/reservations', {
    memberId: fx.C.memberId,
    bookId: fx.books.nhaGiaKim.id,
  });
  reservationOfC = resv.body.id;
}, 60_000);

afterAll(async () => {
  if (ctx) {
    await resetDatabase(ctx.prisma);
    await closeTestApp(ctx);
  }
});

describe('Mobile — độc giả chỉ thấy và thao tác trên dữ liệu của chính mình', () => {
  // =======================================================================
  describe('Endpoint quản trị phải khóa với độc giả', () => {
    it('danh sách độc giả và hồ sơ cá nhân người khác → 403', async () => {
      expect((await ctx.as(fx.A.token).get('/api/members')).status).toBe(403);
      expect((await ctx.as(fx.A.token).get(`/api/members/${fx.B.memberId}`)).status).toBe(403);
      expect(
        (await ctx.as(fx.A.token).get(`/api/members/${fx.B.memberId}/debt-summary`)).status,
      ).toBe(403);
    });

    it('danh sách phiếu mượn / phiếu lẻ / đặt trước toàn hệ thống → 403', async () => {
      expect((await ctx.as(fx.A.token).get('/api/borrowing-slips')).status).toBe(403);
      expect((await ctx.as(fx.A.token).get(`/api/borrowing-slips/${slipOfB}`)).status).toBe(403);
      expect((await ctx.as(fx.A.token).get('/api/borrowings')).status).toBe(403);
      expect((await ctx.as(fx.A.token).get('/api/borrowings/fines/unpaid')).status).toBe(403);
      expect((await ctx.as(fx.A.token).get('/api/reservations')).status).toBe(403);
      expect(
        (await ctx.as(fx.A.token).get(`/api/reservations/book/${fx.books.nhaGiaKim.id}/queue`))
          .status,
      ).toBe(403);
    });

    it('lập phiếu / đặt trước bằng thẻ người khác qua endpoint quản trị → 403', async () => {
      const slip = await ctx.as(fx.A.token).post('/api/borrowing-slips', {
        memberId: fx.D.memberId,
        items: [{ bookId: fx.books.cleanCode.id, quantity: 1 }],
      });
      expect(slip.status).toBe(403);

      const resv = await ctx
        .as(fx.A.token)
        .post('/api/reservations', { memberId: fx.D.memberId, bookId: fx.books.matBiec.id });
      expect(resv.status).toBe(403);

      const cancelOther = await ctx
        .as(fx.A.token)
        .patch(`/api/reservations/${reservationOfC}/cancel`, { reason: 'phá' });
      expect(cancelOther.status).toBe(403);
    });
  });

  // =======================================================================
  describe('Danh mục sách vẫn mở cho độc giả (mobile cần tra cứu)', () => {
    it('xem được sách, tác giả, thể loại và tồn kho', async () => {
      expect((await ctx.as(fx.A.token).get('/api/books')).status).toBe(200);
      expect((await ctx.as(fx.A.token).get('/api/authors')).status).toBe(200);
      expect((await ctx.as(fx.A.token).get('/api/categories')).status).toBe(200);
      expect(
        (await ctx.as(fx.A.token).get(`/api/books/${fx.books.sapiens.id}/stock-check`)).status,
      ).toBe(200);
    });
  });

  // =======================================================================
  describe('GET /api/me/profile', () => {
    it('trả về thẻ độc giả và hạn mức của chính mình', async () => {
      const res = await ctx.as(fx.A.token).get('/api/me/profile');
      expect(res.status).toBe(200);
      expect(res.body.memberId).toBe(fx.A.memberId);
      expect(res.body.fullName).toBe('Nguoi Dung A');
      expect(res.body.maxBorrowLimit).toBe(5);
      expect(res.body.currentBorrowedCount).toBe(0);
      expect(res.body.canBorrow).toBe(true);
      expect(res.body).not.toHaveProperty('password');
    });

    it('tài khoản chưa liên kết thẻ độc giả → 403 với thông điệp rõ ràng', async () => {
      const email = `e2e.nocard@librobe.test`;
      await ctx.prisma.user.create({
        data: {
          email,
          phone: '0900009999',
          password: '$2b$10$abcdefghijklmnopqrstuv',
          fullName: 'Khong Co The',
          role: 'MEMBER',
          isActive: true,
        },
      });
      // Đăng nhập không được vì mật khẩu là hash giả -> dùng token tự phát qua API đăng ký
      const reg = await ctx.anon().post('/api/auth/register', {
        email: 'e2e.nocard2@librobe.test',
        phone: '0900009998',
        password: 'MatKhauTest@123',
        fullName: 'Khong Co The 2',
      });
      // Đăng ký luôn tạo thẻ, nên bỏ liên kết thẻ để mô phỏng tài khoản không có thẻ
      await ctx.prisma.user.update({
        where: { id: reg.body.user.id },
        data: { memberId: null },
      });

      const res = await ctx.as(reg.body.accessToken).get('/api/me/profile');
      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/thẻ độc giả/i);
    });
  });

  // =======================================================================
  describe('GET /api/me/borrowing-slips', () => {
    it('chỉ trả phiếu của chính mình, không lẫn phiếu người khác', async () => {
      const res = await ctx.as(fx.A.token).get('/api/me/borrowing-slips');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      for (const slip of res.body.data) {
        expect(slip.memberId).toBe(fx.A.memberId);
      }

      // B có 1 phiếu, nhưng A không được thấy
      const ofB = await ctx.as(fx.B.token).get('/api/me/borrowing-slips');
      expect(ofB.body.meta.totalItems).toBe(1);
      const aSeesB = (res.body.data || []).some((s: any) => s.id === slipOfB);
      expect(aSeesB).toBe(false);
    });

    it('đọc chi tiết phiếu của người khác → 404 (không tiết lộ phiếu có tồn tại)', async () => {
      const res = await ctx.as(fx.A.token).get(`/api/me/borrowing-slips/${slipOfB}`);
      expect(res.status).toBe(404);
    });
  });

  // =======================================================================
  describe('POST /api/me/borrowing-slips — tự lập phiếu mượn', () => {
    let mySlipId = '';

    it('lập phiếu thành công, memberId lấy từ token', async () => {
      const res = await ctx.as(fx.A.token).post('/api/me/borrowing-slips', {
        items: [{ bookId: fx.books.sapiens.id, quantity: 1 }],
        notes: 'Đặt từ mobile app',
      });
      expect(res.status).toBe(201);
      expect(res.body.memberId).toBe(fx.A.memberId);
      expect(res.body.status).toBe('PENDING_APPROVAL');
      mySlipId = res.body.id;

      // Lập phiếu chưa trừ kho
      const book = await ctx.prisma.book.findUniqueOrThrow({
        where: { id: fx.books.sapiens.id },
        select: { copiesAvailable: true },
      });
      expect(book.copiesAvailable).toBe(1);
    });

    it('gửi kèm memberId của người khác thì bị bỏ qua, không mạo danh được', async () => {
      const res = await ctx.as(fx.A.token).post('/api/me/borrowing-slips', {
        memberId: fx.D.memberId,
        items: [{ bookId: fx.books.dacNhanTam.id, quantity: 1 }],
      });
      expect(res.status).toBe(201);
      // Phải là thẻ của A, không phải của D
      expect(res.body.memberId).toBe(fx.A.memberId);

      const row = await ctx.prisma.borrowingSlip.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(row.memberId).toBe(fx.A.memberId);
    });

    it('tự hủy phiếu đang chờ duyệt của mình → thành công', async () => {
      const res = await ctx
        .as(fx.A.token)
        .patch(`/api/me/borrowing-slips/${mySlipId}/cancel`, { reason: 'Đổi ý' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('CANCELLED');

      const row = await ctx.prisma.borrowingSlip.findUniqueOrThrow({ where: { id: mySlipId } });
      expect(row.status).toBe('CANCELLED');
      expect(row.cancelledById).toBe(fx.A.userId);
    });

    it('hủy phiếu của người khác → 404', async () => {
      const res = await ctx
        .as(fx.A.token)
        .patch(`/api/me/borrowing-slips/${slipOfB}/cancel`, { reason: 'phá' });
      expect(res.status).toBe(404);

      const row = await ctx.prisma.borrowingSlip.findUniqueOrThrow({ where: { id: slipOfB } });
      expect(row.status).toBe('BORROWED');
    });

    it('độc giả KHÔNG tự hủy được phiếu đã xuất kho (phải mang sách đến quầy)', async () => {
      const res = await ctx
        .as(fx.B.token)
        .patch(`/api/me/borrowing-slips/${slipOfB}/cancel`, { reason: 'không muốn mượn nữa' });
      expect(res.status).toBe(400);

      const row = await ctx.prisma.borrowingSlip.findUniqueOrThrow({ where: { id: slipOfB } });
      expect(row.status).toBe('BORROWED');
    });
  });

  // =======================================================================
  describe('PATCH /api/me/borrowing-slips/:id/renew — tự xin gia hạn', () => {
    it('bị chặn 409 khi sách đang có người khác đặt trước', async () => {
      const res = await ctx
        .as(fx.B.token)
        .patch(`/api/me/borrowing-slips/${slipOfB}/renew`, { extraDays: 7 });
      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/đặt trước/i);

      const row = await ctx.prisma.borrowingSlip.findUniqueOrThrow({ where: { id: slipOfB } });
      expect(row.renewCount).toBe(0);
    });

    it('gia hạn thành công khi không có ai đặt trước', async () => {
      const created = await ctx.as(fx.librarian.token).post('/api/borrowing-slips', {
        memberId: fx.D.memberId,
        items: [{ bookId: fx.books.cleanArchitecture.id, quantity: 1 }],
      });
      await ctx.as(fx.librarian.token).patch(`/api/borrowing-slips/${created.body.id}/approve`);
      const before = await ctx.prisma.borrowingSlip.findUniqueOrThrow({
        where: { id: created.body.id },
      });

      const res = await ctx
        .as(fx.D.token)
        .patch(`/api/me/borrowing-slips/${created.body.id}/renew`, { extraDays: 7 });
      expect(res.status).toBe(200);
      expect(res.body.renewCount).toBe(1);
      expect(new Date(res.body.dueDate).getTime() - before.dueDate.getTime()).toBe(
        7 * 24 * 60 * 60 * 1000,
      );
    });

    it('gia hạn phiếu của người khác → 404', async () => {
      const res = await ctx
        .as(fx.A.token)
        .patch(`/api/me/borrowing-slips/${slipOfB}/renew`, { extraDays: 7 });
      expect(res.status).toBe(404);
    });
  });

  // =======================================================================
  describe('Đặt trước từ mobile', () => {
    let myReservationId = '';

    it('POST /api/me/reservations — memberId lấy từ token', async () => {
      const res = await ctx
        .as(fx.A.token)
        .post('/api/me/reservations', { bookId: fx.books.nhaGiaKim.id, notes: 'Cần cho kỳ thi' });
      expect(res.status).toBe(201);
      expect(res.body.memberId).toBe(fx.A.memberId);
      expect(res.body.status).toBe('PENDING');
      myReservationId = res.body.id;
    });

    it('GET /api/me/reservations — chỉ phiếu của mình', async () => {
      const res = await ctx.as(fx.A.token).get('/api/me/reservations');
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      for (const r of res.body.data) {
        expect(r.memberId).toBe(fx.A.memberId);
      }
      expect(res.body.data.some((r: any) => r.id === reservationOfC)).toBe(false);
    });

    it('hủy đặt trước của chính mình → thành công', async () => {
      const res = await ctx
        .as(fx.A.token)
        .patch(`/api/me/reservations/${myReservationId}/cancel`, { reason: 'Không cần nữa' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('CANCELLED');
    });

    it('hủy đặt trước của người khác → 404 và dữ liệu của họ không đổi', async () => {
      const res = await ctx
        .as(fx.A.token)
        .patch(`/api/me/reservations/${reservationOfC}/cancel`, { reason: 'phá' });
      expect(res.status).toBe(404);

      const row = await ctx.prisma.reservation.findUniqueOrThrow({ where: { id: reservationOfC } });
      expect(row.status).toBe('PENDING');
    });
  });

  // =======================================================================
  describe('GET /api/me/fines và /api/me/borrowings', () => {
    it('chỉ trả khoản phạt và lượt mượn của chính mình', async () => {
      const fines = await ctx.as(fx.A.token).get('/api/me/fines');
      expect(fines.status).toBe(200);
      expect(fines.body).toHaveProperty('totalUnpaidFine');
      expect(typeof fines.body.totalUnpaidFine).toBe('number');

      const loans = await ctx.as(fx.A.token).get('/api/me/borrowings');
      expect(loans.status).toBe(200);
      for (const b of loans.body.data || []) {
        expect(b.memberId).toBe(fx.A.memberId);
      }
    });
  });

  // =======================================================================
  describe('Nhóm /me/* vẫn yêu cầu đăng nhập', () => {
    it('không có token → 401 chứ không phải 403', async () => {
      expect((await ctx.anon().get('/api/me/profile')).status).toBe(401);
      expect((await ctx.anon().get('/api/me/borrowing-slips')).status).toBe(401);
      expect((await ctx.anon().post('/api/me/reservations', { bookId: 'x' })).status).toBe(401);
    });
  });
});
