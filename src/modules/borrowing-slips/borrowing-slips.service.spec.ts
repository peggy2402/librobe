import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  BorrowingItemStatus,
  BorrowingSlipStatus,
  MemberStatus,
  ReturnCondition,
  UserRole,
} from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BookStockService } from '../loan-policy/book-stock.service.js';
import { LoanEligibilityService } from '../loan-policy/loan-eligibility.service.js';
import { LoanPolicyService } from '../loan-policy/loan-policy.service.js';
import { BorrowingSlipsService } from './borrowing-slips.service.js';

const DAY = 24 * 60 * 60 * 1000;
const memberActor = {
  id: 'user-01',
  role: UserRole.MEMBER,
  memberId: 'mem-01',
};

/** Thủ thư thực hiện thao tác, lấy từ JWT trong thực tế. */
const ACTOR = {
  id: 'user-02',
  email: 'thuthu@librobe.vn',
  role: UserRole.LIBRARIAN,
  memberId: null,
};

describe('BorrowingSlipsService - ERP Master-Detail & Approval Workflow', () => {
  let service: BorrowingSlipsService;
  let prismaMock: any;
  let reservationsMock: any;
  let policy: LoanPolicyService;

  const mockMember = {
    id: 'mem-01',
    cardNumber: 'LIB-2026-0001',
    fullName: 'Nguyễn Văn A',
    status: MemberStatus.ACTIVE,
    membershipExpiry: new Date(Date.now() + 365 * DAY),
    maxBorrowLimit: 5,
    currentBorrowedCount: 2,
    // Đang mượn 2 cuốn qua phiếu mượn lẻ
    borrowings: [
      {
        id: 'brw-a',
        status: 'BORROWED',
        dueDate: new Date(Date.now() + 10 * DAY),
      },
      {
        id: 'brw-b',
        status: 'BORROWED',
        dueDate: new Date(Date.now() + 10 * DAY),
      },
    ],
    borrowingSlips: [],
  };

  const mockBook1 = {
    id: 'book-01',
    isbn: '9780132350884',
    title: 'Clean Code',
    copiesTotal: 5,
    copiesAvailable: 3,
    price: 250000,
    status: 'AVAILABLE',
  };

  const mockBook2 = {
    id: 'book-02',
    isbn: '9780134494166',
    title: 'Clean Architecture',
    copiesTotal: 5,
    copiesAvailable: 1,
    price: 300000,
    status: 'AVAILABLE',
  };

  beforeEach(() => {
    prismaMock = {
      member: {
        findUnique: vi.fn().mockResolvedValue(mockMember),
        update: vi.fn().mockResolvedValue({}),
      },
      book: {
        findUnique: vi.fn().mockResolvedValue(mockBook1),
        findMany: vi.fn().mockResolvedValue([mockBook1, mockBook2]),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      borrowing: {
        aggregate: vi.fn().mockResolvedValue({ _sum: { fineAmount: 0 } }),
      },
      borrowingSlip: {
        findUnique: vi.fn(),
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        findUniqueOrThrow: vi.fn(),
        create: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        count: vi.fn().mockResolvedValue(0),
        aggregate: vi.fn().mockResolvedValue({ _sum: { totalFine: 0 } }),
      },
      borrowingSlipItem: {
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
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

    service = new BorrowingSlipsService(
      prismaMock,
      policy,
      eligibility,
      stock,
      reservationsMock,
    );
  });

  describe('Tình huống 1 - Lập phiếu mượn nhiều cuốn thành công', () => {
    it('đang mượn 2/5, xin mượn thêm 2 cuốn -> tạo phiếu PENDING_APPROVAL, chưa trừ kho', async () => {
      const createdDbSlip = {
        id: 'slip-01',
        slipNumber: 'SLIP-2026-0001',
        memberId: 'mem-01',
        status: BorrowingSlipStatus.PENDING_APPROVAL,
        dueDate: new Date(Date.now() + 14 * DAY),
        totalFine: 0,
        finePaid: false,
        renewCount: 0,
        member: mockMember,
        items: [
          {
            id: 'item-01',
            slipId: 'slip-01',
            bookId: 'book-01',
            quantity: 1,
            returnedQuantity: 0,
            lostQuantity: 0,
            bookPrice: 250000,
            status: BorrowingItemStatus.PENDING,
            fineAmount: 0,
            lateFee: 0,
            compensationFee: 0,
            book: mockBook1,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: 'item-02',
            slipId: 'slip-01',
            bookId: 'book-02',
            quantity: 1,
            returnedQuantity: 0,
            lostQuantity: 0,
            bookPrice: 300000,
            status: BorrowingItemStatus.PENDING,
            fineAmount: 0,
            lateFee: 0,
            compensationFee: 0,
            book: mockBook2,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prismaMock.borrowingSlip.create.mockResolvedValue(createdDbSlip);

      const result = await service.create({
        memberId: 'mem-01',
        items: [
          { bookId: 'book-01', quantity: 1 },
          { bookId: 'book-02', quantity: 1 },
        ],
      });

      expect(result.slipNumber).toBe('SLIP-2026-0001');
      expect(result.status).toBe(BorrowingSlipStatus.PENDING_APPROVAL);
      expect(result.items).toHaveLength(2);
      // Lập phiếu chưa xuất kho
      expect(prismaMock.book.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('Tình huống 2 - Vượt quá hạn mức mượn', () => {
    it('đang mượn 4/5, xin mượn thêm 2 cuốn -> 409 và không tạo phiếu', async () => {
      prismaMock.member.findUnique.mockResolvedValue({
        ...mockMember,
        currentBorrowedCount: 4,
        borrowings: Array.from({ length: 4 }, (_, i) => ({
          id: `brw-${i}`,
          status: 'BORROWED',
          dueDate: new Date(Date.now() + 10 * DAY),
        })),
      });

      await expect(
        service.create({
          memberId: 'mem-01',
          items: [
            { bookId: 'book-01', quantity: 1 },
            { bookId: 'book-02', quantity: 1 },
          ],
        }),
      ).rejects.toThrow(ConflictException);

      expect(prismaMock.borrowingSlip.create).not.toHaveBeenCalled();
      expect(prismaMock.book.updateMany).not.toHaveBeenCalled();
    });

    it('lỗi vượt hạn mức trả đủ code và số lượng cho frontend', async () => {
      prismaMock.member.findUnique.mockResolvedValue({
        ...mockMember,
        borrowings: Array.from({ length: 4 }, (_, i) => ({
          id: `brw-${i}`,
          status: 'BORROWED',
          dueDate: new Date(Date.now() + 10 * DAY),
        })),
      });

      await expect(
        service.create({
          memberId: 'mem-01',
          items: [
            { bookId: 'book-01', quantity: 1 },
            { bookId: 'book-02', quantity: 1 },
          ],
        }),
      ).rejects.toMatchObject({
        status: 409,
        response: {
          code: 'BORROW_LIMIT_EXCEEDED',
          message: 'Vượt hạn mức mượn sách',
          details: {
            maxBorrowLimit: 5,
            currentBorrowedCount: 4,
            requestedQuantity: 2,
            remainingBorrowLimit: 1,
          },
        },
      });
    });

    it('còn nợ tiền phạt chưa thanh toán -> 400', async () => {
      prismaMock.borrowingSlip.aggregate.mockResolvedValue({
        _sum: { totalFine: 25_000 },
      });

      await expect(
        service.create({
          memberId: 'mem-01',
          items: [{ bookId: 'book-01', quantity: 1 }],
        }),
      ).rejects.toThrow(/nợ tiền phạt/i);
    });

    it('kho không đủ số lượng yêu cầu -> 409 Conflict', async () => {
      prismaMock.book.findMany.mockResolvedValue([
        mockBook1,
        { ...mockBook2, copiesAvailable: 0 },
      ]);

      await expect(
        service.create({
          memberId: 'mem-01',
          items: [
            { bookId: 'book-01', quantity: 1 },
            { bookId: 'book-02', quantity: 1 },
          ],
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('Tình huống 3 - Phê duyệt xuất kho & tranh chấp tồn kho', () => {
    function mockPendingSlip(items: any[]) {
      prismaMock.borrowingSlip.findUnique.mockResolvedValue({
        id: 'slip-01',
        slipNumber: 'SLIP-2026-0001',
        status: BorrowingSlipStatus.PENDING_APPROVAL,
        memberId: 'mem-01',
        dueDate: new Date(Date.now() + 14 * DAY),
        items,
      });
      prismaMock.borrowingSlip.findUniqueOrThrow.mockResolvedValue({
        id: 'slip-01',
        slipNumber: 'SLIP-2026-0001',
        memberId: 'mem-01',
        status: BorrowingSlipStatus.BORROWED,
        dueDate: new Date(Date.now() + 14 * DAY),
        totalFine: 0,
        finePaid: false,
        renewCount: 0,
        member: mockMember,
        items,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    it('phê duyệt thành công -> trừ kho atomic theo đúng số lượng từng dòng', async () => {
      mockPendingSlip([
        {
          id: 'item-01',
          bookId: 'book-01',
          quantity: 2,
          book: { title: 'Clean Code' },
        },
      ]);

      await service.approve('slip-01', ACTOR);

      expect(prismaMock.borrowingSlip.updateMany).toHaveBeenCalledWith({
        where: { id: 'slip-01', status: BorrowingSlipStatus.PENDING_APPROVAL },
        data: expect.objectContaining({
          approvedBy: ACTOR.email,
          approvedById: ACTOR.id,
          approvedAt: expect.any(Date),
        }),
      });
      expect(prismaMock.book.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'book-01',
            copiesAvailable: { gte: 2 },
          }),
          data: { copiesAvailable: { decrement: 2 } },
        }),
      );
      expect(prismaMock.member.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { currentBorrowedCount: { increment: 2 } },
        }),
      );
    });

    it('duyệt đúng bằng hạn mức và khóa member trước khi đọc điều kiện mượn', async () => {
      mockPendingSlip([{ id: 'item-01', bookId: 'book-01', quantity: 3 }]);
      await service.approve('slip-01', ACTOR);
      expect(prismaMock.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
        prismaMock.member.findUnique.mock.invocationCallOrder[0],
      );
      expect(prismaMock.member.update).toHaveBeenCalledWith({
        where: { id: 'mem-01' },
        data: { currentBorrowedCount: { increment: 3 } },
      });
      expect(prismaMock.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
        { isolationLevel: 'ReadCommitted' },
      );
    });

    it.each([3, 5, 9])(
      'đang giữ %i cuốn: từ chối thêm 3, giữ nguyên mọi dữ liệu',
      async (count) => {
        mockPendingSlip([{ id: 'item-01', bookId: 'book-01', quantity: 3 }]);
        prismaMock.member.findUnique.mockResolvedValue({
          ...mockMember,
          // Eligibility uses the actual loans even if the cached count is stale.
          currentBorrowedCount: 0,
          borrowings: Array.from({ length: count }, () => ({
            status: 'BORROWED',
            dueDate: new Date(Date.now() + 10 * DAY),
          })),
        });
        await expect(service.approve('slip-01', ACTOR)).rejects.toMatchObject({
          status: 409,
          response: {
            code: 'BORROW_LIMIT_EXCEEDED',
            details: {
              maxBorrowLimit: 5,
              currentBorrowedCount: count,
              requestedQuantity: 3,
              remainingBorrowLimit: Math.max(0, 5 - count),
            },
          },
        });
        expect(prismaMock.borrowingSlip.updateMany).not.toHaveBeenCalled();
        expect(prismaMock.borrowingSlipItem.updateMany).not.toHaveBeenCalled();
        expect(prismaMock.book.updateMany).not.toHaveBeenCalled();
        expect(prismaMock.member.update).not.toHaveBeenCalled();
        expect(reservationsMock.fulfillForBorrow).not.toHaveBeenCalled();
      },
    );

    it('phiếu bị chặn có thể duyệt lại khi số sách đang giữ giảm sau trả sách', async () => {
      mockPendingSlip([{ id: 'item-01', bookId: 'book-01', quantity: 3 }]);
      prismaMock.member.findUnique.mockResolvedValueOnce({
        ...mockMember,
        borrowings: [...mockMember.borrowings, mockMember.borrowings[0]],
      });
      await expect(service.approve('slip-01', ACTOR)).rejects.toThrow(
        ConflictException,
      );
      // The next read sees the two remaining loans after a return.
      await service.approve('slip-01', ACTOR);
      expect(prismaMock.member.update).toHaveBeenCalledTimes(1);
    });

    it('đọc lại phiếu sau khi chờ khóa để phát hiện phiếu vừa được duyệt', async () => {
      prismaMock.borrowingSlip.findUnique
        .mockResolvedValueOnce({ memberId: 'mem-01' })
        .mockResolvedValueOnce({ status: BorrowingSlipStatus.BORROWED });
      await expect(service.approve('slip-01', ACTOR)).rejects.toThrow(
        ConflictException,
      );
      expect(prismaMock.member.findUnique).not.toHaveBeenCalled();
      expect(prismaMock.borrowingSlip.updateMany).not.toHaveBeenCalled();
    });

    it('kiểm tra lại thẻ đã bị khóa kể từ lúc lập phiếu', async () => {
      mockPendingSlip([{ id: 'item-01', bookId: 'book-01', quantity: 1 }]);
      prismaMock.member.findUnique.mockResolvedValue({
        ...mockMember,
        status: MemberStatus.SUSPENDED,
      });
      await expect(service.approve('slip-01', ACTOR)).rejects.toThrow(
        BadRequestException,
      );
      expect(prismaMock.borrowingSlip.updateMany).not.toHaveBeenCalled();
    });

    it('phiếu đã được duyệt trước đó -> 409 (chống double click)', async () => {
      prismaMock.borrowingSlip.findUnique.mockResolvedValue({
        id: 'slip-01',
        slipNumber: 'SLIP-2026-0001',
        status: BorrowingSlipStatus.BORROWED,
        memberId: 'mem-01',
        items: [],
      });

      await expect(service.approve('slip-01', ACTOR)).rejects.toThrow(
        ConflictException,
      );
      expect(prismaMock.book.updateMany).not.toHaveBeenCalled();
    });

    it('sách bị giành mất ngay lúc duyệt -> 409 và rollback (không tăng số sách của độc giả)', async () => {
      mockPendingSlip([
        {
          id: 'item-01',
          bookId: 'book-01',
          quantity: 2,
          book: { title: 'Clean Code' },
        },
      ]);
      prismaMock.book.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.approve('slip-01', ACTOR)).rejects.toThrow(
        ConflictException,
      );
      expect(prismaMock.member.update).not.toHaveBeenCalled();
    });
  });

  describe('Audit và chống xử lý đồng thời khi từ chối/hủy phiếu', () => {
    it.each(['reject', 'cancel'] as const)(
      '%s ghi người xử lý từ JWT và lý do đã trim, không thay đổi kho phiếu chờ duyệt',
      async (action) => {
        const isReject = action === 'reject';
        const status = isReject
          ? BorrowingSlipStatus.REJECTED
          : BorrowingSlipStatus.CANCELLED;
        const prefix = isReject ? 'rejected' : 'cancelled';
        prismaMock.borrowingSlip.findUnique.mockResolvedValue({
          id: 'slip-01',
          status: BorrowingSlipStatus.PENDING_APPROVAL,
          items: [],
        });
        prismaMock.borrowingSlip.findUniqueOrThrow.mockResolvedValue({
          id: 'slip-01',
          status,
          items: [],
          [`${prefix}By`]: ACTOR.email,
          [`${prefix}ById`]: ACTOR.id,
        });

        const result = await service[action](
          'slip-01',
          { reason: '  Lý do  ' },
          ACTOR,
        );

        expect(prismaMock.borrowingSlip.updateMany).toHaveBeenCalledWith({
          where: {
            id: 'slip-01',
            status: BorrowingSlipStatus.PENDING_APPROVAL,
          },
          data: expect.objectContaining({
            status,
            [`${prefix}By`]: ACTOR.email,
            [`${prefix}ById`]: ACTOR.id,
            [`${prefix}At`]: expect.any(Date),
            [isReject ? 'rejectReason' : 'cancelReason']: 'Lý do',
          }),
        });
        expect(result).toMatchObject({
          [`${prefix}By`]: ACTOR.email,
          [`${prefix}ById`]: ACTOR.id,
        });
        expect(prismaMock.book.updateMany).not.toHaveBeenCalled();
        expect(prismaMock.$executeRaw).not.toHaveBeenCalled();
        expect(prismaMock.member.update).not.toHaveBeenCalled();
      },
    );

    it.each(['approve', 'reject', 'cancel'] as const)(
      '%s thua tranh chấp trạng thái -> 409 trước khi sửa dòng sách hoặc tồn kho',
      async (action) => {
        prismaMock.borrowingSlip.findUnique.mockResolvedValue({
          id: 'slip-01',
          status: BorrowingSlipStatus.PENDING_APPROVAL,
          memberId: 'mem-01',
          items: [{ id: 'item-01', bookId: 'book-01', quantity: 1 }],
        });
        prismaMock.borrowingSlip.updateMany.mockResolvedValue({ count: 0 });

        const operation =
          action === 'approve'
            ? service.approve('slip-01', ACTOR)
            : service[action]('slip-01', { reason: 'Lý do' }, ACTOR);

        await expect(operation).rejects.toThrow(ConflictException);
        expect(prismaMock.borrowingSlipItem.updateMany).not.toHaveBeenCalled();
        expect(prismaMock.book.updateMany).not.toHaveBeenCalled();
        expect(prismaMock.$executeRaw).not.toHaveBeenCalled();
        expect(prismaMock.member.update).not.toHaveBeenCalled();
        expect(
          prismaMock.borrowingSlip.findUniqueOrThrow,
        ).not.toHaveBeenCalled();
      },
    );
  });

  describe('Member tự hủy phiếu gửi nhầm', () => {
    const owner = { ...memberActor, email: 'member@librobe.vn' };
    beforeEach(() => {
      prismaMock.borrowingSlip.findUnique.mockResolvedValue({
        id: 'slip-01',
        memberId: 'mem-01',
        status: BorrowingSlipStatus.PENDING_APPROVAL,
        items: [
          {
            id: 'item-01',
            bookId: 'book-01',
            quantity: 2,
            status: BorrowingItemStatus.PENDING,
          },
        ],
      });
      prismaMock.borrowingSlip.findUniqueOrThrow.mockResolvedValue({
        id: 'slip-01',
        status: BorrowingSlipStatus.CANCELLED,
        items: [],
      });
    });

    it('chủ phiếu hủy khi chờ duyệt, ghi audit và không thay đổi kho/hạn mức', async () => {
      await service.cancel('slip-01', { reason: '  Gửi nhầm phiếu  ' }, owner);
      expect(prismaMock.borrowingSlip.updateMany).toHaveBeenCalledWith({
        where: { id: 'slip-01', status: BorrowingSlipStatus.PENDING_APPROVAL },
        data: expect.objectContaining({
          status: BorrowingSlipStatus.CANCELLED,
          cancelledBy: owner.email,
          cancelledById: owner.id,
          cancelReason: 'Gửi nhầm phiếu',
        }),
      });
      expect(prismaMock.borrowingSlipItem.updateMany).toHaveBeenCalled();
      expect(prismaMock.member.update).not.toHaveBeenCalled();
      expect(prismaMock.book.updateMany).not.toHaveBeenCalled();
      expect(prismaMock.$executeRaw).not.toHaveBeenCalled();
    });

    it.each([null, 'mem-other'])(
      'memberId=%s không được hủy phiếu người khác',
      async (memberId) => {
        await expect(
          service.cancel(
            'slip-01',
            { reason: 'Gửi nhầm' },
            { ...owner, memberId },
          ),
        ).rejects.toThrow(ForbiddenException);
        expect(prismaMock.borrowingSlip.updateMany).not.toHaveBeenCalled();
        expect(prismaMock.borrowingSlipItem.updateMany).not.toHaveBeenCalled();
      },
    );

    it.each(
      Object.values(BorrowingSlipStatus).filter(
        (status) => status !== BorrowingSlipStatus.PENDING_APPROVAL,
      ),
    )('member không thể hủy trạng thái %s', async (status) => {
      prismaMock.borrowingSlip.findUnique.mockResolvedValue({
        memberId: 'mem-01',
        status,
        items: [],
      });
      await expect(
        service.cancel('slip-01', { reason: 'Gửi nhầm' }, owner),
      ).rejects.toThrow(ConflictException);
      expect(prismaMock.borrowingSlip.updateMany).not.toHaveBeenCalled();
      expect(prismaMock.member.update).not.toHaveBeenCalled();
      expect(prismaMock.$executeRaw).not.toHaveBeenCalled();
    });

    it('đọc lại trạng thái sau khi chờ khóa, không hoàn kho phiếu vừa được duyệt', async () => {
      prismaMock.borrowingSlip.findUnique
        .mockResolvedValueOnce({ memberId: 'mem-01' })
        .mockResolvedValueOnce({
          memberId: 'mem-01',
          status: BorrowingSlipStatus.BORROWED,
        });
      await expect(
        service.cancel('slip-01', { reason: 'Gửi nhầm' }, owner),
      ).rejects.toThrow(ConflictException);
      expect(prismaMock.$executeRaw).not.toHaveBeenCalled();
    });
  });

  describe('Tình huống 4 - Trả sách từng phần, tính phạt & bồi thường', () => {
    function mockIssuedSlip(overrides: Record<string, unknown> = {}) {
      const slip = {
        id: 'slip-01',
        slipNumber: 'SLIP-2026-0001',
        status: BorrowingSlipStatus.BORROWED,
        memberId: 'mem-01',
        dueDate: new Date(Date.now() + 5 * DAY),
        totalFine: 0,
        finePaid: false,
        renewCount: 0,
        notes: null,
        items: [
          {
            id: 'item-01',
            slipId: 'slip-01',
            bookId: 'book-01',
            quantity: 1,
            returnedQuantity: 0,
            lostQuantity: 0,
            bookPrice: 250000,
            status: BorrowingItemStatus.BORROWING,
            fineAmount: 0,
            lateFee: 0,
            compensationFee: 0,
            notes: null,
            book: { title: 'Clean Code' },
          },
          {
            id: 'item-02',
            slipId: 'slip-01',
            bookId: 'book-02',
            quantity: 1,
            returnedQuantity: 0,
            lostQuantity: 0,
            bookPrice: 300000,
            status: BorrowingItemStatus.BORROWING,
            fineAmount: 0,
            lateFee: 0,
            compensationFee: 0,
            notes: null,
            book: { title: 'Clean Architecture' },
          },
        ],
        ...overrides,
      };
      prismaMock.borrowingSlip.findUnique.mockResolvedValue(slip);
      prismaMock.borrowingSlip.findUniqueOrThrow.mockResolvedValue({
        ...slip,
        member: mockMember,
        items: slip.items,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      return slip;
    }

    it('trả đúng hạn -> không phát sinh phạt, hoàn kho đúng số lượng', async () => {
      mockIssuedSlip({ dueDate: new Date(Date.now() + 5 * DAY) });

      await service.returnItems('slip-01', {
        items: [
          {
            itemId: 'item-01',
            returnCondition: ReturnCondition.GOOD,
            quantity: 1,
          },
        ],
      });

      const itemCall = prismaMock.borrowingSlipItem.updateMany.mock.calls[0][0];
      expect(itemCall.data.lateFee).toBe(0);
      expect(itemCall.data.fineAmount).toBe(0);
      expect(prismaMock.$executeRaw).toHaveBeenCalled();

      const slipCall = prismaMock.borrowingSlip.update.mock.calls[0][0];
      expect(slipCall.data.totalFine).toBe(0);
      expect(slipCall.data.status).toBe(BorrowingSlipStatus.PARTIAL_RETURNED);
    });

    it('quá hạn 5 ngày, trả 1 cuốn -> phạt 25.000 VNĐ cho dòng đó', async () => {
      mockIssuedSlip({ dueDate: new Date(Date.now() - 5 * DAY) });

      await service.returnItems('slip-01', {
        items: [
          {
            itemId: 'item-01',
            returnCondition: ReturnCondition.GOOD,
            quantity: 1,
          },
        ],
      });

      const itemCall = prismaMock.borrowingSlipItem.updateMany.mock.calls[0][0];
      expect(itemCall.data.lateFee).toBe(25_000);
      expect(itemCall.data.compensationFee).toBe(0);
      expect(itemCall.data.fineAmount).toBe(25_000);

      const slipCall = prismaMock.borrowingSlip.update.mock.calls[0][0];
      expect(slipCall.data.totalFine).toBe(25_000);
      // Đã trả sách nhưng chưa thu phạt -> finePaid vẫn false
      expect(slipCall.data.finePaid).toBe(false);
    });

    it('quá hạn 5 ngày, trả cả 2 cuốn -> tổng phạt 50.000 VNĐ và phiếu COMPLETED', async () => {
      mockIssuedSlip({ dueDate: new Date(Date.now() - 5 * DAY) });

      await service.returnItems('slip-01', {
        items: [
          {
            itemId: 'item-01',
            returnCondition: ReturnCondition.GOOD,
            quantity: 1,
          },
          {
            itemId: 'item-02',
            returnCondition: ReturnCondition.GOOD,
            quantity: 1,
          },
        ],
      });

      const slipCall = prismaMock.borrowingSlip.update.mock.calls[0][0];
      expect(slipCall.data.totalFine).toBe(50_000);
      expect(slipCall.data.status).toBe(BorrowingSlipStatus.COMPLETED);
    });

    it('báo mất sách -> tính bồi thường theo đơn giá, KHÔNG hoàn kho', async () => {
      mockIssuedSlip({ dueDate: new Date(Date.now() + 5 * DAY) });

      await service.returnItems('slip-01', {
        items: [
          {
            itemId: 'item-01',
            returnCondition: ReturnCondition.LOST,
            quantity: 1,
          },
        ],
      });

      const itemCall = prismaMock.borrowingSlipItem.updateMany.mock.calls[0][0];
      expect(itemCall.data.compensationFee).toBe(250_000);
      expect(itemCall.data.lateFee).toBe(0);
      expect(itemCall.data.status).toBe(BorrowingItemStatus.LOST);
      // Mất sách thì không cộng lại tồn kho
      expect(prismaMock.$executeRaw).not.toHaveBeenCalled();
    });

    it('trả lại dòng đã hoàn tất -> 400, không tính phạt trùng', async () => {
      mockIssuedSlip({
        dueDate: new Date(Date.now() - 5 * DAY),
        items: [
          {
            id: 'item-01',
            slipId: 'slip-01',
            bookId: 'book-01',
            quantity: 1,
            returnedQuantity: 1,
            lostQuantity: 0,
            bookPrice: 250000,
            status: BorrowingItemStatus.RETURNED,
            fineAmount: 25_000,
            lateFee: 25_000,
            compensationFee: 0,
            notes: null,
            book: { title: 'Clean Code' },
          },
        ],
      });

      await expect(
        service.returnItems('slip-01', {
          items: [
            {
              itemId: 'item-01',
              returnCondition: ReturnCondition.GOOD,
              quantity: 1,
            },
          ],
        }),
      ).rejects.toThrow(/đã được hoàn tất trước đó/);

      expect(prismaMock.borrowingSlipItem.updateMany).not.toHaveBeenCalled();
      expect(prismaMock.borrowingSlip.update).not.toHaveBeenCalled();
    });

    it('trả nhiều hơn số lượng còn lại -> 400 thay vì âm thầm cắt bớt', async () => {
      mockIssuedSlip();

      await expect(
        service.returnItems('slip-01', {
          items: [
            {
              itemId: 'item-01',
              returnCondition: ReturnCondition.GOOD,
              quantity: 5,
            },
          ],
        }),
      ).rejects.toThrow(/không thể xử lý 5 cuốn/);
    });

    it('khai trùng cùng một dòng trong một request -> 400', async () => {
      mockIssuedSlip();

      await expect(
        service.returnItems('slip-01', {
          items: [
            {
              itemId: 'item-01',
              returnCondition: ReturnCondition.GOOD,
              quantity: 1,
            },
            {
              itemId: 'item-01',
              returnCondition: ReturnCondition.GOOD,
              quantity: 1,
            },
          ],
        }),
      ).rejects.toThrow(/bị khai báo trùng/);
    });

    it('hai request trả cùng một dòng đồng thời -> request thua nhận 409', async () => {
      mockIssuedSlip();
      prismaMock.borrowingSlipItem.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.returnItems('slip-01', {
          items: [
            {
              itemId: 'item-01',
              returnCondition: ReturnCondition.GOOD,
              quantity: 1,
            },
          ],
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('Tình huống 5 - Gia hạn phiếu mượn ERP', () => {
    function mockRenewableSlip(overrides: Record<string, unknown> = {}) {
      const slip = {
        id: 'slip-01',
        slipNumber: 'SLIP-2026-0001',
        status: BorrowingSlipStatus.BORROWED,
        memberId: 'mem-01',
        dueDate: new Date(Date.now() + 2 * DAY),
        renewCount: 0,
        notes: null,
        items: [
          {
            id: 'item-01',
            bookId: 'book-01',
            quantity: 1,
            returnedQuantity: 0,
            lostQuantity: 0,
            status: BorrowingItemStatus.BORROWING,
            book: { title: 'Clean Code' },
          },
        ],
        ...overrides,
      };
      prismaMock.borrowingSlip.findUnique.mockResolvedValue(slip);
      prismaMock.borrowingSlip.findUniqueOrThrow.mockResolvedValue({
        ...slip,
        totalFine: 0,
        finePaid: false,
        renewCount: (slip.renewCount as number) + 1,
        dueDate: new Date(new Date(slip.dueDate).getTime() + 7 * DAY),
        member: mockMember,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      return slip;
    }

    it('gia hạn thành công -> hạn trả +7 ngày, renewCount = 1, ghi lịch sử', async () => {
      const slip = mockRenewableSlip();

      const result = await service.renew('slip-01', {}, memberActor);

      const call = prismaMock.borrowingSlip.updateMany.mock.calls[0][0];
      expect(call.data.renewCount).toBe(1);
      expect(new Date(call.data.dueDate).getTime()).toBe(
        new Date(slip.dueDate).getTime() + 7 * DAY,
      );
      expect(result.renewCount).toBe(1);
      expect(prismaMock.loanRenewal.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            slipId: 'slip-01',
            sequence: 1,
            extraDays: 7,
          }),
        }),
      );
    });

    it('đã gia hạn 1 lần -> 400', async () => {
      mockRenewableSlip({ renewCount: 1 });

      await expect(service.renew('slip-01', {}, memberActor)).rejects.toThrow(
        /số lần gia hạn tối đa/,
      );
      expect(prismaMock.borrowingSlip.updateMany).not.toHaveBeenCalled();
    });

    it.each(['mem-other', null])(
      'MEMBER có memberId=%s không phải chủ phiếu -> 403',
      async (memberId) => {
        mockRenewableSlip({ status: BorrowingSlipStatus.COMPLETED });
        const actor = { ...memberActor, memberId };

        expect(await service.findOne('slip-01', actor)).toMatchObject({
          canRenew: false,
          reasonCode: 'NOT_OWNER',
        });
        await expect(service.renew('slip-01', {}, actor)).rejects.toThrow(
          ForbiddenException,
        );
        expect(prismaMock.borrowingSlip.updateMany).not.toHaveBeenCalled();
        expect(prismaMock.loanRenewal.create).not.toHaveBeenCalled();
        expect(prismaMock.reservation.count).not.toHaveBeenCalled();
      },
    );

    it.each([UserRole.ADMIN, UserRole.LIBRARIAN])(
      '%s được gia hạn thay chủ phiếu',
      async (role) => {
        mockRenewableSlip();
        const actor = { id: 'staff-01', role, memberId: null };

        expect(await service.findOne('slip-01', actor)).toMatchObject({
          canRenew: true,
          reasonCode: null,
        });
        await expect(
          service.renew('slip-01', {}, actor),
        ).resolves.toMatchObject({ renewCount: 1 });
      },
    );

    it('GET chi tiết cho MEMBER chủ phiếu biết được phép gia hạn', async () => {
      mockRenewableSlip();
      expect(await service.findOne('slip-01', memberActor)).toMatchObject({
        id: 'slip-01',
        memberId: 'mem-01',
        canRenew: true,
        reasonCode: null,
        message: 'Phiếu mượn đủ điều kiện gia hạn',
      });
    });

    it.each([
      ['INVALID_STATUS', { status: BorrowingSlipStatus.PENDING_APPROVAL }],
      ['INVALID_STATUS', { status: BorrowingSlipStatus.COMPLETED }],
      ['OVERDUE', { dueDate: new Date(Date.now() - 3 * DAY) }],
      ['MAX_RENEWALS_REACHED', { renewCount: 1 }],
    ])('GET và gia hạn thống nhất lý do %s', async (reasonCode, overrides) => {
      mockRenewableSlip(overrides as Record<string, unknown>);
      const detail = await service.findOne('slip-01', memberActor);

      expect(detail).toMatchObject({ canRenew: false, reasonCode });
      await expect(service.renew('slip-01', {}, memberActor)).rejects.toThrow(
        detail.message,
      );
      expect(prismaMock.borrowingSlip.updateMany).not.toHaveBeenCalled();
    });

    it('ngoài cửa sổ gia hạn: GET trả OUTSIDE_RENEWAL_WINDOW, ghi bị chặn', async () => {
      Object.defineProperty(policy, 'renewWindowDays', { value: 1 });
      mockRenewableSlip({ dueDate: new Date(Date.now() + 4 * DAY) });

      const detail = await service.findOne('slip-01', memberActor);
      expect(detail).toMatchObject({
        canRenew: false,
        reasonCode: 'OUTSIDE_RENEWAL_WINDOW',
      });
      await expect(service.renew('slip-01', {}, memberActor)).rejects.toThrow(
        detail.message,
      );
    });

    it('GET chi tiết trả ACTIVE_RESERVATION và cùng thông báo với lỗi gia hạn', async () => {
      mockRenewableSlip();
      prismaMock.reservation.count.mockResolvedValue(1);

      const detail = await service.findOne('slip-01', memberActor);
      expect(detail).toMatchObject({
        canRenew: false,
        reasonCode: 'ACTIVE_RESERVATION',
        message: 'Sách đã có người khác đặt trước',
      });
      await expect(service.renew('slip-01', {}, memberActor)).rejects.toThrow(
        detail.message,
      );
      expect(prismaMock.borrowingSlip.updateMany).not.toHaveBeenCalled();
    });

    it('phiếu đã trả một phần: chỉ kiểm tra reservation trên sách còn đang mượn', async () => {
      const slip = mockRenewableSlip();
      mockRenewableSlip({
        status: BorrowingSlipStatus.PARTIAL_RETURNED,
        items: [
          ...slip.items,
          {
            ...slip.items[0],
            bookId: 'book-returned',
            status: BorrowingItemStatus.RETURNED,
          },
          {
            ...slip.items[0],
            bookId: 'book-lost',
            status: BorrowingItemStatus.LOST,
          },
        ],
      });
      prismaMock.reservation.count.mockImplementation(
        ({ where }: { where: { bookId: string } }) =>
          Promise.resolve(where.bookId === 'book-01' ? 0 : 1),
      );

      expect(await service.findOne('slip-01', memberActor)).toMatchObject({
        canRenew: true,
      });
      await expect(
        service.renew('slip-01', {}, memberActor),
      ).resolves.toMatchObject({ renewCount: 1 });
      expect(prismaMock.reservation.count).toHaveBeenCalledTimes(2);
      expect(prismaMock.reservation.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ bookId: 'book-01' }),
        }),
      );
    });

    it('ghi người gia hạn từ JWT, bỏ qua renewedBy do client tự khai', async () => {
      mockRenewableSlip();
      await service.renew('slip-01', { renewedBy: 'Admin giả' }, memberActor);
      expect(prismaMock.loanRenewal.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ renewedBy: memberActor.id }),
        }),
      );
    });

    it('hai request gia hạn đồng thời: request thua nhận 409, không ghi lịch sử', async () => {
      mockRenewableSlip();
      prismaMock.borrowingSlip.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.renew('slip-01', {}, memberActor)).rejects.toThrow(
        ConflictException,
      );
      expect(prismaMock.loanRenewal.create).not.toHaveBeenCalled();
    });

    it('phiếu không tồn tại -> 404', async () => {
      prismaMock.borrowingSlip.findUnique.mockResolvedValue(null);
      await expect(service.renew('slip-01', {}, memberActor)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.findOne('slip-01', memberActor)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('có độc giả khác đặt trước sách trong phiếu -> 409', async () => {
      mockRenewableSlip();
      prismaMock.reservation.count.mockResolvedValue(2);

      await expect(service.renew('slip-01', {}, memberActor)).rejects.toThrow(
        ConflictException,
      );
      expect(prismaMock.borrowingSlip.updateMany).not.toHaveBeenCalled();
    });

    it('phiếu đã quá hạn -> 400', async () => {
      mockRenewableSlip({ dueDate: new Date(Date.now() - 2 * DAY) });

      await expect(service.renew('slip-01', {}, memberActor)).rejects.toThrow(
        /quá hạn/i,
      );
    });

    it('phiếu đã hoàn tất trả sách -> 400', async () => {
      mockRenewableSlip({ status: BorrowingSlipStatus.COMPLETED });

      await expect(service.renew('slip-01', {}, memberActor)).rejects.toThrow(
        /BORROWED hoặc PARTIAL_RETURNED/,
      );
    });
  });

  describe('payFine - Thanh toán phạt của phiếu mượn ERP', () => {
    it('ghi nhận đã thu phạt', async () => {
      prismaMock.borrowingSlip.findUnique.mockResolvedValue({
        id: 'slip-01',
        totalFine: 50_000,
        finePaid: false,
      });
      prismaMock.borrowingSlip.findUniqueOrThrow.mockResolvedValue({
        id: 'slip-01',
        slipNumber: 'SLIP-2026-0001',
        memberId: 'mem-01',
        status: BorrowingSlipStatus.COMPLETED,
        dueDate: new Date(),
        totalFine: 50_000,
        finePaid: true,
        finePaidAt: new Date(),
        renewCount: 0,
        member: mockMember,
        items: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.payFine('slip-01');
      expect(result.finePaid).toBe(true);
      expect(result.finePaidAt).toBeInstanceOf(Date);
    });

    it('thanh toán hai lần -> 400', async () => {
      prismaMock.borrowingSlip.findUnique.mockResolvedValue({
        id: 'slip-01',
        totalFine: 50_000,
        finePaid: true,
      });

      await expect(service.payFine('slip-01')).rejects.toThrow(
        /đã được thanh toán/i,
      );
    });
  });
});
