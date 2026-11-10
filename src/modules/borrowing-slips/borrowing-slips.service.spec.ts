import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  BorrowingItemStatus,
  BorrowingSlipStatus,
  MemberStatus,
  ReturnCondition,
} from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BookStockService } from '../loan-policy/book-stock.service.js';
import { LoanEligibilityService } from '../loan-policy/loan-eligibility.service.js';
import { LoanPolicyService } from '../loan-policy/loan-policy.service.js';
import { BorrowingSlipsService } from './borrowing-slips.service.js';

const DAY = 24 * 60 * 60 * 1000;

describe('BorrowingSlipsService - ERP Master-Detail & Approval Workflow', () => {
  let service: BorrowingSlipsService;
  let prismaMock: any;
  let reservationsMock: any;

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
      { id: 'brw-a', status: 'BORROWED', dueDate: new Date(Date.now() + 10 * DAY) },
      { id: 'brw-b', status: 'BORROWED', dueDate: new Date(Date.now() + 10 * DAY) },
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
      $transaction: vi.fn(),
    };

    prismaMock.$transaction.mockImplementation((arg: any) =>
      typeof arg === 'function' ? arg(prismaMock) : Promise.all(arg),
    );

    reservationsMock = {
      fulfillForBorrow: vi.fn().mockResolvedValue(undefined),
      promoteQueueAfterReturn: vi.fn().mockResolvedValue(0),
    };

    const policy = new LoanPolicyService();
    const eligibility = new LoanEligibilityService(prismaMock, policy);
    const stock = new BookStockService();

    service = new BorrowingSlipsService(prismaMock, policy, eligibility, stock, reservationsMock);
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
    it('đang mượn 4/5, xin mượn thêm 2 cuốn -> 400 và không tạo phiếu', async () => {
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
      ).rejects.toThrow(BadRequestException);

      expect(prismaMock.borrowingSlip.create).not.toHaveBeenCalled();
      expect(prismaMock.book.updateMany).not.toHaveBeenCalled();
    });

    it('thông điệp lỗi nêu rõ số cuốn còn được mượn và số cuốn yêu cầu', async () => {
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
      ).rejects.toThrow(/còn được mượn thêm 1 cuốn nhưng yêu cầu 2 cuốn/);
    });

    it('còn nợ tiền phạt chưa thanh toán -> 400', async () => {
      prismaMock.borrowingSlip.aggregate.mockResolvedValue({ _sum: { totalFine: 25_000 } });

      await expect(
        service.create({ memberId: 'mem-01', items: [{ bookId: 'book-01', quantity: 1 }] }),
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
        { id: 'item-01', bookId: 'book-01', quantity: 2, book: { title: 'Clean Code' } },
      ]);

      await service.approve('slip-01', 'thuthu@librobe.vn');

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
        expect.objectContaining({ data: { currentBorrowedCount: { increment: 2 } } }),
      );
    });

    it('phiếu đã được duyệt trước đó -> 409 (chống double click)', async () => {
      prismaMock.borrowingSlip.findUnique.mockResolvedValue({
        id: 'slip-01',
        slipNumber: 'SLIP-2026-0001',
        status: BorrowingSlipStatus.BORROWED,
        memberId: 'mem-01',
        items: [],
      });

      await expect(service.approve('slip-01')).rejects.toThrow(ConflictException);
      expect(prismaMock.book.updateMany).not.toHaveBeenCalled();
    });

    it('sách bị giành mất ngay lúc duyệt -> 409 và rollback (không tăng số sách của độc giả)', async () => {
      mockPendingSlip([
        { id: 'item-01', bookId: 'book-01', quantity: 2, book: { title: 'Clean Code' } },
      ]);
      prismaMock.book.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.approve('slip-01')).rejects.toThrow(ConflictException);
      expect(prismaMock.member.update).not.toHaveBeenCalled();
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
        items: [{ itemId: 'item-01', returnCondition: ReturnCondition.GOOD, quantity: 1 }],
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
        items: [{ itemId: 'item-01', returnCondition: ReturnCondition.GOOD, quantity: 1 }],
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
          { itemId: 'item-01', returnCondition: ReturnCondition.GOOD, quantity: 1 },
          { itemId: 'item-02', returnCondition: ReturnCondition.GOOD, quantity: 1 },
        ],
      });

      const slipCall = prismaMock.borrowingSlip.update.mock.calls[0][0];
      expect(slipCall.data.totalFine).toBe(50_000);
      expect(slipCall.data.status).toBe(BorrowingSlipStatus.COMPLETED);
    });

    it('báo mất sách -> tính bồi thường theo đơn giá, KHÔNG hoàn kho', async () => {
      mockIssuedSlip({ dueDate: new Date(Date.now() + 5 * DAY) });

      await service.returnItems('slip-01', {
        items: [{ itemId: 'item-01', returnCondition: ReturnCondition.LOST, quantity: 1 }],
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
          items: [{ itemId: 'item-01', returnCondition: ReturnCondition.GOOD, quantity: 1 }],
        }),
      ).rejects.toThrow(/đã được hoàn tất trước đó/);

      expect(prismaMock.borrowingSlipItem.updateMany).not.toHaveBeenCalled();
      expect(prismaMock.borrowingSlip.update).not.toHaveBeenCalled();
    });

    it('trả nhiều hơn số lượng còn lại -> 400 thay vì âm thầm cắt bớt', async () => {
      mockIssuedSlip();

      await expect(
        service.returnItems('slip-01', {
          items: [{ itemId: 'item-01', returnCondition: ReturnCondition.GOOD, quantity: 5 }],
        }),
      ).rejects.toThrow(/không thể xử lý 5 cuốn/);
    });

    it('khai trùng cùng một dòng trong một request -> 400', async () => {
      mockIssuedSlip();

      await expect(
        service.returnItems('slip-01', {
          items: [
            { itemId: 'item-01', returnCondition: ReturnCondition.GOOD, quantity: 1 },
            { itemId: 'item-01', returnCondition: ReturnCondition.GOOD, quantity: 1 },
          ],
        }),
      ).rejects.toThrow(/bị khai báo trùng/);
    });

    it('hai request trả cùng một dòng đồng thời -> request thua nhận 409', async () => {
      mockIssuedSlip();
      prismaMock.borrowingSlipItem.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.returnItems('slip-01', {
          items: [{ itemId: 'item-01', returnCondition: ReturnCondition.GOOD, quantity: 1 }],
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

      const result = await service.renew('slip-01', {});

      const call = prismaMock.borrowingSlip.updateMany.mock.calls[0][0];
      expect(call.data.renewCount).toBe(1);
      expect(new Date(call.data.dueDate).getTime()).toBe(
        new Date(slip.dueDate).getTime() + 7 * DAY,
      );
      expect(result.renewCount).toBe(1);
      expect(prismaMock.loanRenewal.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ slipId: 'slip-01', sequence: 1, extraDays: 7 }),
        }),
      );
    });

    it('đã gia hạn 1 lần -> 400', async () => {
      mockRenewableSlip({ renewCount: 1 });

      await expect(service.renew('slip-01', {})).rejects.toThrow(/số lần gia hạn tối đa/);
      expect(prismaMock.borrowingSlip.updateMany).not.toHaveBeenCalled();
    });

    it('có độc giả khác đặt trước sách trong phiếu -> 409', async () => {
      mockRenewableSlip();
      prismaMock.reservation.count.mockResolvedValue(2);

      await expect(service.renew('slip-01', {})).rejects.toThrow(ConflictException);
      expect(prismaMock.borrowingSlip.updateMany).not.toHaveBeenCalled();
    });

    it('phiếu đã quá hạn -> 400', async () => {
      mockRenewableSlip({ dueDate: new Date(Date.now() - 2 * DAY) });

      await expect(service.renew('slip-01', {})).rejects.toThrow(/quá hạn/i);
    });

    it('phiếu đã hoàn tất trả sách -> 400', async () => {
      mockRenewableSlip({ status: BorrowingSlipStatus.COMPLETED });

      await expect(service.renew('slip-01', {})).rejects.toThrow(
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

      await expect(service.payFine('slip-01')).rejects.toThrow(/đã được thanh toán/i);
    });
  });
});
