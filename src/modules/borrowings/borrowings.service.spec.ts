import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BookStatus } from '../../common/enums/book-status.enum.js';
import { BorrowingStatus } from '../../common/enums/borrowing-status.enum.js';
import { MemberStatus } from '../../common/enums/member-status.enum.js';
import { BookStockService } from '../loan-policy/book-stock.service.js';
import { LoanEligibilityService } from '../loan-policy/loan-eligibility.service.js';
import { LoanPolicyService } from '../loan-policy/loan-policy.service.js';
import { BorrowingsService } from './borrowings.service.js';

const DAY = 24 * 60 * 60 * 1000;
const memberActor = {
  id: 'user-01',
  role: UserRole.MEMBER,
  memberId: 'mem-01',
};

/** Dựng độc giả ở trạng thái hợp lệ, có thể ghi đè từng thuộc tính. */
function buildMember(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mem-01',
    cardNumber: 'LIB-2026-0001',
    fullName: 'Nguyễn Văn An',
    status: MemberStatus.ACTIVE,
    membershipExpiry: new Date(Date.now() + 180 * DAY),
    maxBorrowLimit: 5,
    currentBorrowedCount: 2,
    // Mặc định: đang mượn 2 cuốn qua phiếu mượn lẻ
    borrowings: [
      {
        id: 'brw-a',
        status: BorrowingStatus.BORROWED,
        dueDate: new Date(Date.now() + 10 * DAY),
      },
      {
        id: 'brw-b',
        status: BorrowingStatus.BORROWED,
        dueDate: new Date(Date.now() + 12 * DAY),
      },
    ],
    borrowingSlips: [],
    ...overrides,
  };
}

function buildBook(overrides: Record<string, unknown> = {}) {
  return {
    id: 'book-01',
    title: 'Clean Code',
    status: BookStatus.AVAILABLE,
    copiesAvailable: 3,
    copiesTotal: 5,
    ...overrides,
  };
}

describe('BorrowingsService - Nghiệp vụ mượn / trả / gia hạn / phạt', () => {
  let service: BorrowingsService;
  let prismaMock: any;
  let reservationsMock: any;
  let policy: LoanPolicyService;

  beforeEach(() => {
    prismaMock = {
      member: {
        findUnique: vi.fn().mockResolvedValue(buildMember()),
        update: vi.fn().mockResolvedValue({}),
      },
      book: {
        findUnique: vi.fn().mockResolvedValue(buildBook()),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        update: vi.fn().mockResolvedValue({}),
      },
      borrowing: {
        findUnique: vi.fn(),
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        findUniqueOrThrow: vi.fn(),
        create: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        count: vi.fn().mockResolvedValue(0),
        // Không có khoản phạt chưa thanh toán
        aggregate: vi.fn().mockResolvedValue({ _sum: { fineAmount: 0 } }),
      },
      borrowingSlip: {
        aggregate: vi.fn().mockResolvedValue({ _sum: { totalFine: 0 } }),
      },
      loanRenewal: {
        create: vi.fn().mockResolvedValue({}),
        findMany: vi.fn().mockResolvedValue([]),
      },
      reservation: {
        count: vi.fn().mockResolvedValue(0),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findMany: vi.fn().mockResolvedValue([]),
      },
      $executeRaw: vi.fn().mockResolvedValue(1),
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'mem-01' }]),
      $transaction: vi.fn(),
    };

    // Hỗ trợ cả interactive transaction và dạng mảng
    prismaMock.$transaction.mockImplementation((arg: any) =>
      typeof arg === 'function' ? arg(prismaMock) : Promise.all(arg),
    );

    reservationsMock = {
      fulfillForBorrow: vi.fn().mockResolvedValue(undefined),
      promoteQueueAfterReturn: vi.fn().mockResolvedValue(0),
    };

    policy = new LoanPolicyService();
    const eligibility = new LoanEligibilityService(prismaMock, policy);
    const stock = new BookStockService();

    service = new BorrowingsService(
      prismaMock,
      policy,
      eligibility,
      stock,
      reservationsMock,
    );
  });

  // ---------------------------------------------------------------------------
  // TÌNH HUỐNG 1 - Mượn sách thành công
  // ---------------------------------------------------------------------------
  describe('Tình huống 1 - Mượn sách thành công', () => {
    it('đang mượn 2/5 cuốn, không nợ phạt, kho còn sách -> tạo phiếu mượn và trừ kho đúng 1 bản', async () => {
      const createdRow = {
        id: 'brw-new',
        transactionCode: 'BRW-2026-0001',
        memberId: 'mem-01',
        bookId: 'book-01',
        borrowDate: new Date(),
        dueDate: new Date(Date.now() + 14 * DAY),
        returnDate: null,
        renewCount: 0,
        fineAmount: 0,
        finePaid: false,
        finePaidAt: null,
        notes: null,
        status: BorrowingStatus.BORROWED,
        member: buildMember(),
        book: buildBook(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      prismaMock.borrowing.create.mockResolvedValue(createdRow);

      const result = await service.borrowBook({
        memberId: 'mem-01',
        bookId: 'book-01',
      });

      expect(result.status).toBe(BorrowingStatus.BORROWED);
      expect(result.transactionCode).toBe('BRW-2026-0001');
      expect(result.fineAmount).toBe(0);
      expect(result.finePaid).toBe(false);
      expect(result.renewCount).toBe(0);

      // Trừ kho bằng atomic conditional update, đúng 1 bản sách
      expect(prismaMock.book.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'book-01',
            copiesAvailable: { gte: 1 },
          }),
          data: { copiesAvailable: { decrement: 1 } },
        }),
      );

      // Tăng số sách đang giữ của độc giả bằng phép cộng tương đối
      expect(prismaMock.member.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'mem-01' },
          data: { currentBorrowedCount: { increment: 1 } },
        }),
      );
    });

    it('hạn trả mặc định là ngày mượn + 14 ngày', async () => {
      prismaMock.borrowing.create.mockImplementation((args: any) =>
        Promise.resolve({
          ...args.data,
          id: 'brw-new',
          member: buildMember(),
          book: buildBook(),
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      );

      const result = await service.borrowBook({
        memberId: 'mem-01',
        bookId: 'book-01',
      });
      const spanDays = Math.round(
        (new Date(result.dueDate).getTime() -
          new Date(result.borrowDate).getTime()) /
          DAY,
      );

      expect(spanDays).toBe(14);
    });

    it('sinh mã phiếu mượn tiếp theo dựa trên mã lớn nhất hiện có', async () => {
      prismaMock.borrowing.findFirst.mockResolvedValue({
        transactionCode: 'BRW-2026-0007',
      });
      prismaMock.borrowing.create.mockImplementation((args: any) =>
        Promise.resolve({
          ...args.data,
          id: 'brw-new',
          member: buildMember(),
          book: buildBook(),
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      );

      const result = await service.borrowBook({
        memberId: 'mem-01',
        bookId: 'book-01',
      });
      expect(result.transactionCode).toBe('BRW-2026-0008');
    });
  });

  // ---------------------------------------------------------------------------
  // TÌNH HUỐNG 2 - Vượt quá giới hạn mượn
  // ---------------------------------------------------------------------------
  describe('Tình huống 2 - Vượt quá giới hạn mượn', () => {
    it('đang mượn 5/5 cuốn -> từ chối 409 và KHÔNG thay đổi tồn kho', async () => {
      prismaMock.member.findUnique.mockResolvedValue(
        buildMember({
          currentBorrowedCount: 5,
          borrowings: Array.from({ length: 5 }, (_, i) => ({
            id: `brw-${i}`,
            status: BorrowingStatus.BORROWED,
            dueDate: new Date(Date.now() + 10 * DAY),
          })),
        }),
      );

      await expect(
        service.borrowBook({ memberId: 'mem-01', bookId: 'book-01' }),
      ).rejects.toThrow(ConflictException);

      expect(prismaMock.borrowing.create).not.toHaveBeenCalled();
      expect(prismaMock.book.updateMany).not.toHaveBeenCalled();
      expect(prismaMock.member.update).not.toHaveBeenCalled();
    });

    it('số sách đang mượn được cộng từ cả phiếu mượn lẻ và phiếu mượn ERP', async () => {
      // 2 cuốn phiếu lẻ + 3 cuốn trong phiếu ERP = 5/5 -> hết hạn mức
      prismaMock.member.findUnique.mockResolvedValue(
        buildMember({
          borrowingSlips: [
            {
              id: 'slip-01',
              dueDate: new Date(Date.now() + 8 * DAY),
              items: [{ quantity: 3, returnedQuantity: 0, lostQuantity: 0 }],
            },
          ],
        }),
      );

      await expect(
        service.borrowBook({ memberId: 'mem-01', bookId: 'book-01' }),
      ).rejects.toThrow(/hạn mức mượn/i);

      expect(prismaMock.borrowing.create).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Các điều kiện chặn mượn khác
  // ---------------------------------------------------------------------------
  describe('Chặn mượn khi độc giả không đủ điều kiện', () => {
    it('thẻ độc giả bị khóa (SUSPENDED) -> 400', async () => {
      prismaMock.member.findUnique.mockResolvedValue(
        buildMember({ status: MemberStatus.SUSPENDED }),
      );

      await expect(
        service.borrowBook({ memberId: 'mem-01', bookId: 'book-01' }),
      ).rejects.toThrow(/SUSPENDED/);
      expect(prismaMock.borrowing.create).not.toHaveBeenCalled();
    });

    it('thẻ thư viện đã hết hạn -> 400', async () => {
      prismaMock.member.findUnique.mockResolvedValue(
        buildMember({ membershipExpiry: new Date(Date.now() - DAY) }),
      );

      await expect(
        service.borrowBook({ memberId: 'mem-01', bookId: 'book-01' }),
      ).rejects.toThrow(/hết hạn/i);
    });

    it('đang có sách quá hạn chưa trả -> 400', async () => {
      prismaMock.member.findUnique.mockResolvedValue(
        buildMember({
          borrowings: [
            {
              id: 'brw-late',
              status: BorrowingStatus.OVERDUE,
              dueDate: new Date(Date.now() - 5 * DAY),
            },
          ],
        }),
      );

      await expect(
        service.borrowBook({ memberId: 'mem-01', bookId: 'book-01' }),
      ).rejects.toThrow(/quá hạn/i);
    });

    it('còn nợ tiền phạt chưa thanh toán -> 400 và không tạo phiếu mượn', async () => {
      prismaMock.borrowing.aggregate.mockResolvedValue({
        _sum: { fineAmount: 25_000 },
      });

      await expect(
        service.borrowBook({ memberId: 'mem-01', bookId: 'book-01' }),
      ).rejects.toThrow(/nợ tiền phạt/i);

      expect(prismaMock.borrowing.create).not.toHaveBeenCalled();
      expect(prismaMock.book.updateMany).not.toHaveBeenCalled();
    });

    it('không tìm thấy độc giả -> 404', async () => {
      prismaMock.member.findUnique.mockResolvedValue(null);

      await expect(
        service.borrowBook({ memberId: 'khong-ton-tai', bookId: 'book-01' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('sách đã hết bản khả dụng -> 400', async () => {
      prismaMock.book.findUnique.mockResolvedValue(
        buildBook({ copiesAvailable: 0 }),
      );

      await expect(
        service.borrowBook({ memberId: 'mem-01', bookId: 'book-01' }),
      ).rejects.toThrow(/hết bản in/i);

      expect(prismaMock.book.updateMany).not.toHaveBeenCalled();
      expect(prismaMock.borrowing.create).not.toHaveBeenCalled();
    });

    it('sách đã ngừng lưu hành -> 400', async () => {
      prismaMock.book.findUnique.mockResolvedValue(
        buildBook({ status: BookStatus.DISCONTINUED }),
      );

      await expect(
        service.borrowBook({ memberId: 'mem-01', bookId: 'book-01' }),
      ).rejects.toThrow(/ngừng lưu hành/i);
    });
  });

  // ---------------------------------------------------------------------------
  // TÌNH HUỐNG 3 - Hai độc giả cùng mượn bản sách cuối cùng
  // ---------------------------------------------------------------------------
  describe('Tình huống 3 - Tranh chấp bản sách cuối cùng (concurrency)', () => {
    it('request thua cuộc nhận 409 và KHÔNG tạo phiếu mượn (toàn bộ giao dịch rollback)', async () => {
      // Kho còn 1 cuốn tại thời điểm đọc, nhưng khi trừ kho thì đã bị giành mất
      prismaMock.book.findUnique.mockResolvedValue(
        buildBook({ copiesAvailable: 1 }),
      );
      prismaMock.book.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.borrowBook({ memberId: 'mem-01', bookId: 'book-01' }),
      ).rejects.toThrow(ConflictException);

      expect(prismaMock.borrowing.create).not.toHaveBeenCalled();
      expect(prismaMock.member.update).not.toHaveBeenCalled();
    });

    it('việc trừ kho luôn kèm điều kiện copiesAvailable >= số lượng cần, nên tồn kho không thể âm', async () => {
      prismaMock.book.findUnique.mockResolvedValue(
        buildBook({ copiesAvailable: 1 }),
      );
      prismaMock.borrowing.create.mockResolvedValue({
        id: 'brw-new',
        transactionCode: 'BRW-2026-0001',
        memberId: 'mem-01',
        bookId: 'book-01',
        borrowDate: new Date(),
        dueDate: new Date(Date.now() + 14 * DAY),
        renewCount: 0,
        fineAmount: 0,
        finePaid: false,
        status: BorrowingStatus.BORROWED,
        member: buildMember(),
        book: buildBook(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await service.borrowBook({ memberId: 'mem-01', bookId: 'book-01' });

      const call = prismaMock.book.updateMany.mock.calls[0][0];
      expect(call.where.copiesAvailable).toEqual({ gte: 1 });
      expect(call.data).toEqual({ copiesAvailable: { decrement: 1 } });
    });
  });

  // ---------------------------------------------------------------------------
  // TÌNH HUỐNG 4 - Trả sách đúng hạn & quá hạn
  // ---------------------------------------------------------------------------
  describe('Tình huống 4 - Trả sách và tính tiền phạt', () => {
    function mockActiveLoan(overrides: Record<string, unknown> = {}) {
      const loan = {
        id: 'brw-01',
        bookId: 'book-01',
        memberId: 'mem-01',
        dueDate: new Date(Date.now() + 3 * DAY),
        returnDate: null,
        status: BorrowingStatus.BORROWED,
        fineAmount: 0,
        finePaid: false,
        notes: null,
        ...overrides,
      };
      prismaMock.borrowing.findUnique.mockResolvedValue(loan);
      prismaMock.borrowing.findUniqueOrThrow.mockImplementation(() =>
        Promise.resolve({
          ...loan,
          transactionCode: 'BRW-2026-0001',
          returnDate: new Date(),
          status: BorrowingStatus.RETURNED,
          renewCount: 0,
          member: buildMember(),
          book: buildBook(),
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      );
      return loan;
    }

    it('trả đúng hạn -> không phát sinh tiền phạt, hoàn 1 bản về kho', async () => {
      mockActiveLoan({ dueDate: new Date(Date.now() + 3 * DAY) });

      await service.returnBook('brw-01', {});

      const updateCall = prismaMock.borrowing.updateMany.mock.calls[0][0];
      expect(updateCall.where).toEqual({ id: 'brw-01', returnDate: null });
      expect(updateCall.data.fineAmount).toBe(0);
      expect(updateCall.data.status).toBe(BorrowingStatus.RETURNED);
      // Hoàn kho dùng câu lệnh atomic có chặn vượt copiesTotal
      expect(prismaMock.$executeRaw).toHaveBeenCalled();
      expect(prismaMock.member.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { currentBorrowedCount: { decrement: 1 } },
        }),
      );
    });

    it('trả muộn 5 ngày -> tiền phạt 25.000 VNĐ (5 ngày × 5.000 × 1 cuốn)', async () => {
      mockActiveLoan({
        dueDate: new Date(Date.now() - 5 * DAY),
        status: BorrowingStatus.OVERDUE,
      });

      await service.returnBook('brw-01', {});

      const updateCall = prismaMock.borrowing.updateMany.mock.calls[0][0];
      expect(updateCall.data.fineAmount).toBe(25_000);
      expect(updateCall.data.status).toBe(BorrowingStatus.RETURNED);
    });

    it('mặc định tiền phạt được ghi nhận thành nợ: trả sách xong nhưng finePaid = false', async () => {
      mockActiveLoan({ dueDate: new Date(Date.now() - 5 * DAY) });

      await service.returnBook('brw-01', {});

      const updateCall = prismaMock.borrowing.updateMany.mock.calls[0][0];
      expect(updateCall.data.finePaid).toBe(false);
      expect(updateCall.data.finePaidAt).toBeNull();
      // Vẫn chuyển sang RETURNED -> trả sách và thanh toán phạt là 2 trạng thái độc lập
      expect(updateCall.data.status).toBe(BorrowingStatus.RETURNED);
    });

    it('thu phạt ngay tại quầy (finePaid = true) -> ghi nhận thời điểm thanh toán', async () => {
      mockActiveLoan({ dueDate: new Date(Date.now() - 5 * DAY) });

      await service.returnBook('brw-01', { finePaid: true });

      const updateCall = prismaMock.borrowing.updateMany.mock.calls[0][0];
      expect(updateCall.data.finePaid).toBe(true);
      expect(updateCall.data.finePaidAt).toBeInstanceOf(Date);
    });

    it('trả sách lặp lại -> 400 và KHÔNG cộng phạt / hoàn kho lần hai', async () => {
      prismaMock.borrowing.findUnique.mockResolvedValue({
        id: 'brw-01',
        bookId: 'book-01',
        memberId: 'mem-01',
        dueDate: new Date(Date.now() - 5 * DAY),
        returnDate: new Date(Date.now() - DAY),
        status: BorrowingStatus.RETURNED,
        fineAmount: 25_000,
        finePaid: false,
        notes: null,
      });

      await expect(service.returnBook('brw-01', {})).rejects.toThrow(
        BadRequestException,
      );

      expect(prismaMock.borrowing.updateMany).not.toHaveBeenCalled();
      expect(prismaMock.$executeRaw).not.toHaveBeenCalled();
      expect(prismaMock.member.update).not.toHaveBeenCalled();
    });

    it('hai request trả sách đồng thời: request thua nhận 409', async () => {
      mockActiveLoan({ dueDate: new Date(Date.now() + 3 * DAY) });
      prismaMock.borrowing.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.returnBook('brw-01', {})).rejects.toThrow(
        ConflictException,
      );
      expect(prismaMock.$executeRaw).not.toHaveBeenCalled();
    });

    it('không tìm thấy phiếu mượn -> 404', async () => {
      prismaMock.borrowing.findUnique.mockResolvedValue(null);
      await expect(service.returnBook('khong-ton-tai', {})).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // TÌNH HUỐNG 5 - Gia hạn sách
  // ---------------------------------------------------------------------------
  describe('Tình huống 5 - Gia hạn sách', () => {
    function mockRenewableLoan(overrides: Record<string, unknown> = {}) {
      const loan = {
        id: 'brw-01',
        bookId: 'book-01',
        memberId: 'mem-01',
        // Còn 2 ngày nữa đến hạn trả
        dueDate: new Date(Date.now() + 2 * DAY),
        returnDate: null,
        renewCount: 0,
        status: BorrowingStatus.BORROWED,
        notes: null,
        book: { title: 'Clean Code' },
        ...overrides,
      };
      prismaMock.borrowing.findUnique.mockResolvedValue(loan);
      prismaMock.borrowing.findUniqueOrThrow.mockResolvedValue({
        ...loan,
        transactionCode: 'BRW-2026-0001',
        dueDate: new Date(new Date(loan.dueDate).getTime() + 7 * DAY),
        renewCount: (loan.renewCount as number) + 1,
        fineAmount: 0,
        finePaid: false,
        member: buildMember(),
        book: buildBook(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      return loan;
    }

    it('gia hạn thành công: hạn trả cộng thêm 7 ngày, renewCount tăng lên 1, có ghi lịch sử', async () => {
      const loan = mockRenewableLoan();

      const result = await service.renewLoan('brw-01', {}, memberActor);

      const updateCall = prismaMock.borrowing.updateMany.mock.calls[0][0];
      expect(updateCall.where).toEqual({
        id: 'brw-01',
        renewCount: 0,
        returnDate: null,
      });
      expect(updateCall.data.renewCount).toBe(1);
      expect(new Date(updateCall.data.dueDate).getTime()).toBe(
        new Date(loan.dueDate).getTime() + 7 * DAY,
      );
      expect(result.renewCount).toBe(1);

      // Audit trail
      expect(prismaMock.loanRenewal.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            borrowingId: 'brw-01',
            sequence: 1,
            extraDays: 7,
          }),
        }),
      );
    });

    it('đã dùng hết số lần gia hạn (1 lần) -> 400 và không đổi hạn trả', async () => {
      mockRenewableLoan({ renewCount: 1 });

      await expect(
        service.renewLoan('brw-01', {}, memberActor),
      ).rejects.toThrow(BadRequestException);
      expect(prismaMock.borrowing.updateMany).not.toHaveBeenCalled();
      expect(prismaMock.loanRenewal.create).not.toHaveBeenCalled();
    });

    it.each(['mem-other', null])(
      'MEMBER có memberId=%s không phải chủ phiếu -> 403',
      async (memberId) => {
        // Quyền sở hữu được kiểm tra trước cả trạng thái đã trả.
        mockRenewableLoan({
          status: BorrowingStatus.RETURNED,
          returnDate: new Date(),
        });
        const actor = { ...memberActor, memberId };

        const detail = await service.findOne('brw-01', actor);
        expect(detail).toMatchObject({
          canRenew: false,
          reasonCode: 'NOT_OWNER',
        });
        await expect(service.renewLoan('brw-01', {}, actor)).rejects.toThrow(
          ForbiddenException,
        );
        expect(prismaMock.borrowing.updateMany).not.toHaveBeenCalled();
        expect(prismaMock.loanRenewal.create).not.toHaveBeenCalled();
        expect(prismaMock.reservation.count).not.toHaveBeenCalled();
      },
    );

    it.each([UserRole.ADMIN, UserRole.LIBRARIAN])(
      '%s được gia hạn thay chủ phiếu',
      async (role) => {
        mockRenewableLoan();
        const actor = { id: 'staff-01', role, memberId: null };

        expect(await service.findOne('brw-01', actor)).toMatchObject({
          canRenew: true,
          reasonCode: null,
        });
        await expect(
          service.renewLoan('brw-01', {}, actor),
        ).resolves.toMatchObject({ renewCount: 1 });
      },
    );

    it('GET chi tiết cho MEMBER chủ phiếu biết được phép gia hạn', async () => {
      mockRenewableLoan();
      expect(await service.findOne('brw-01', memberActor)).toMatchObject({
        id: 'brw-01',
        memberId: 'mem-01',
        canRenew: true,
        reasonCode: null,
        message: 'Phiếu mượn đủ điều kiện gia hạn',
      });
    });

    it.each([
      [
        'INVALID_STATUS',
        { status: BorrowingStatus.RETURNED, returnDate: new Date() },
      ],
      ['OVERDUE', { dueDate: new Date(Date.now() - 3 * DAY) }],
      ['MAX_RENEWALS_REACHED', { renewCount: 1 }],
    ])('GET và gia hạn thống nhất lý do %s', async (reasonCode, overrides) => {
      mockRenewableLoan(overrides as Record<string, unknown>);
      const detail = await service.findOne('brw-01', memberActor);

      expect(detail).toMatchObject({ canRenew: false, reasonCode });
      await expect(
        service.renewLoan('brw-01', {}, memberActor),
      ).rejects.toThrow(detail.message);
      expect(prismaMock.borrowing.updateMany).not.toHaveBeenCalled();
    });

    it('ngoài cửa sổ gia hạn: GET trả OUTSIDE_RENEWAL_WINDOW, ghi bị chặn', async () => {
      Object.defineProperty(policy, 'renewWindowDays', { value: 1 });
      mockRenewableLoan({ dueDate: new Date(Date.now() + 4 * DAY) });

      const detail = await service.findOne('brw-01', memberActor);
      expect(detail).toMatchObject({
        canRenew: false,
        reasonCode: 'OUTSIDE_RENEWAL_WINDOW',
      });
      await expect(
        service.renewLoan('brw-01', {}, memberActor),
      ).rejects.toThrow(detail.message);
      expect(prismaMock.borrowing.updateMany).not.toHaveBeenCalled();
    });

    it('GET chi tiết trả ACTIVE_RESERVATION và cùng thông báo với lỗi gia hạn', async () => {
      mockRenewableLoan();
      prismaMock.reservation.count.mockResolvedValue(1);

      const detail = await service.findOne('brw-01', memberActor);
      expect(detail).toMatchObject({
        canRenew: false,
        reasonCode: 'ACTIVE_RESERVATION',
        message: 'Sách đã có người khác đặt trước',
      });
      await expect(
        service.renewLoan('brw-01', {}, memberActor),
      ).rejects.toThrow(detail.message);
      expect(prismaMock.borrowing.updateMany).not.toHaveBeenCalled();
    });

    it('ghi người gia hạn từ JWT, bỏ qua renewedBy do client tự khai', async () => {
      mockRenewableLoan();
      await service.renewLoan(
        'brw-01',
        { renewedBy: 'Admin giả' },
        memberActor,
      );
      expect(prismaMock.loanRenewal.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ renewedBy: memberActor.id }),
        }),
      );
    });

    it('có độc giả khác đặt trước cuốn sách -> 409 Conflict, không cho gia hạn', async () => {
      mockRenewableLoan();
      prismaMock.reservation.count.mockResolvedValue(1);

      await expect(
        service.renewLoan('brw-01', {}, memberActor),
      ).rejects.toThrow(ConflictException);
      await expect(
        service.renewLoan('brw-01', {}, memberActor),
      ).rejects.toThrow(/đặt trước/i);
      expect(prismaMock.borrowing.updateMany).not.toHaveBeenCalled();
    });

    it('chỉ tính phiếu đặt trước của ĐỘC GIẢ KHÁC, còn hiệu lực', async () => {
      mockRenewableLoan();
      prismaMock.borrowing.updateMany.mockResolvedValue({ count: 1 });

      await service.renewLoan('brw-01', {}, memberActor);

      expect(prismaMock.reservation.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            bookId: 'book-01',
            memberId: { not: 'mem-01' },
            status: { in: ['PENDING', 'READY'] },
          }),
        }),
      );
    });

    it('sách đã được trả -> 400, không gia hạn', async () => {
      mockRenewableLoan({
        returnDate: new Date(Date.now() - DAY),
        status: BorrowingStatus.RETURNED,
      });

      await expect(
        service.renewLoan('brw-01', {}, memberActor),
      ).rejects.toThrow(/đã hoàn tất trả sách/i);
      expect(prismaMock.borrowing.updateMany).not.toHaveBeenCalled();
    });

    it('phiếu đã quá hạn -> 400, không gia hạn', async () => {
      mockRenewableLoan({ dueDate: new Date(Date.now() - 3 * DAY) });

      await expect(
        service.renewLoan('brw-01', {}, memberActor),
      ).rejects.toThrow(/quá hạn/i);
      expect(prismaMock.borrowing.updateMany).not.toHaveBeenCalled();
    });

    it('hai request gia hạn đồng thời: request thua nhận 409', async () => {
      mockRenewableLoan();
      prismaMock.borrowing.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.renewLoan('brw-01', {}, memberActor),
      ).rejects.toThrow(ConflictException);
      expect(prismaMock.loanRenewal.create).not.toHaveBeenCalled();
    });

    it('không tìm thấy phiếu mượn -> 404', async () => {
      prismaMock.borrowing.findUnique.mockResolvedValue(null);
      await expect(
        service.renewLoan('khong-ton-tai', {}, memberActor),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ---------------------------------------------------------------------------
  // Thanh toán tiền phạt
  // ---------------------------------------------------------------------------
  describe('payFine - Thanh toán tiền phạt', () => {
    it('ghi nhận đã thu phạt kèm thời điểm thanh toán', async () => {
      prismaMock.borrowing.findUnique.mockResolvedValue({
        id: 'brw-01',
        fineAmount: 25_000,
        finePaid: false,
      });
      prismaMock.borrowing.findUniqueOrThrow.mockResolvedValue({
        id: 'brw-01',
        transactionCode: 'BRW-2026-0001',
        memberId: 'mem-01',
        bookId: 'book-01',
        borrowDate: new Date(),
        dueDate: new Date(),
        renewCount: 0,
        fineAmount: 25_000,
        finePaid: true,
        finePaidAt: new Date(),
        status: BorrowingStatus.RETURNED,
        member: buildMember(),
        book: buildBook(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.payFine('brw-01');

      expect(result.finePaid).toBe(true);
      expect(prismaMock.borrowing.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'brw-01', finePaid: false },
          data: expect.objectContaining({ finePaid: true }),
        }),
      );
    });

    it('thanh toán hai lần -> 400', async () => {
      prismaMock.borrowing.findUnique.mockResolvedValue({
        id: 'brw-01',
        fineAmount: 25_000,
        finePaid: true,
      });

      await expect(service.payFine('brw-01')).rejects.toThrow(
        /đã được thanh toán/i,
      );
    });

    it('phiếu không có tiền phạt -> 400', async () => {
      prismaMock.borrowing.findUnique.mockResolvedValue({
        id: 'brw-01',
        fineAmount: 0,
        finePaid: false,
      });

      await expect(service.payFine('brw-01')).rejects.toThrow(
        /không có phát sinh tiền phạt/i,
      );
    });
  });
});
