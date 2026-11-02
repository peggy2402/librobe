import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import {
  BorrowingItemStatus,
  BorrowingSlipStatus,
  MemberStatus,
  ReturnCondition,
} from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BorrowingSlipsService } from './borrowing-slips.service.js';

describe('BorrowingSlipsService - ERP Master-Detail & Approval Workflow', () => {
  let service: BorrowingSlipsService;
  let prismaMock: any;

  const mockMember = {
    id: 'mem-01',
    cardNumber: 'LIB-2026-0001',
    fullName: 'Nguyễn Văn A',
    status: MemberStatus.ACTIVE,
    membershipExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    maxBorrowLimit: 5,
    currentBorrowedCount: 2,
    borrowings: [],
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
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      book: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
      },
      borrowingSlip: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        count: vi.fn(),
      },
      borrowingSlipItem: {
        update: vi.fn(),
      },
      $transaction: vi.fn((promises) => Promise.all(promises)),
    };

    service = new BorrowingSlipsService(prismaMock);
  });

  describe('create - Lập phiếu mượn Master - Detail', () => {
    it('phải chặn khi số lượng mượn vượt quá hạn mức còn lại của độc giả', async () => {
      // Độc giả giới hạn 5, đang mượn 2, chỉ còn mượn được 3 cuốn
      prismaMock.member.findUnique.mockResolvedValueOnce({
        ...mockMember,
        currentBorrowedCount: 3,
        borrowings: [{ status: 'BORROWED' }, { status: 'BORROWED' }, { status: 'BORROWED' }],
      });

      await expect(
        service.create({
          memberId: 'mem-01',
          items: [
            { bookId: 'book-01', quantity: 2 },
            { bookId: 'book-02', quantity: 1 },
          ], // Tổng 3 cuốn -> vượt quá 5 - 3 = 2 cuốn
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('phải quăng lỗi ConflictException 409 khi số lượng sách trong kho không đủ', async () => {
      prismaMock.member.findUnique.mockResolvedValueOnce(mockMember);
      prismaMock.book.findMany.mockResolvedValueOnce([
        mockBook1,
        { ...mockBook2, copiesAvailable: 0 }, // Hết hàng
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

    it('phải tạo thành công phiếu mượn dạng PENDING_APPROVAL khi đủ điều kiện', async () => {
      prismaMock.member.findUnique.mockResolvedValueOnce(mockMember);
      prismaMock.book.findMany.mockResolvedValueOnce([mockBook1]);
      prismaMock.borrowingSlip.count.mockResolvedValueOnce(0);

      const createdDbSlip = {
        id: 'slip-01',
        slipNumber: 'SLIP-2026-0001',
        memberId: 'mem-01',
        status: BorrowingSlipStatus.PENDING_APPROVAL,
        dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        totalFine: 0,
        finePaid: false,
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
            book: mockBook1,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prismaMock.borrowingSlip.create.mockResolvedValueOnce(createdDbSlip);

      const result = await service.create({
        memberId: 'mem-01',
        items: [{ bookId: 'book-01', quantity: 1 }],
      });

      expect(result.slipNumber).toBe('SLIP-2026-0001');
      expect(result.status).toBe(BorrowingSlipStatus.PENDING_APPROVAL);
      expect(result.items).toHaveLength(1);
    });
  });

  describe('approve - Phê duyệt chứng từ xuất kho', () => {
    it('phải quăng 409 ConflictException khi phiếu đã được phê duyệt trước đó (Chống Double Click)', async () => {
      prismaMock.borrowingSlip.findUnique.mockResolvedValueOnce({
        id: 'slip-01',
        slipNumber: 'SLIP-2026-0001',
        status: BorrowingSlipStatus.BORROWED, // Đã duyệt rồi
        member: mockMember,
        items: [],
      });

      await expect(service.approve('slip-01')).rejects.toThrow(ConflictException);
    });

    it('phải quăng 409 ConflictException khi sách bị người khác mượn hết ngay trước lúc duyệt (Race condition)', async () => {
      prismaMock.borrowingSlip.findUnique.mockResolvedValueOnce({
        id: 'slip-01',
        slipNumber: 'SLIP-2026-0001',
        status: BorrowingSlipStatus.PENDING_APPROVAL,
        memberId: 'mem-01',
        member: mockMember,
        items: [
          {
            id: 'item-01',
            bookId: 'book-01',
            bookTitle: 'Clean Code',
            quantity: 2,
            book: mockBook1,
          },
        ],
      });

      // Kho chỉ còn 1 cuốn
      prismaMock.book.findUnique.mockResolvedValueOnce({
        ...mockBook1,
        copiesAvailable: 1,
      });

      await expect(service.approve('slip-01')).rejects.toThrow(ConflictException);
    });
  });

  describe('returnItems - Trả sách từng phần & Bồi thường mất sách', () => {
    it('phải tính tiền bồi thường khi báo mất sách và chuyển trạng thái từng dòng', async () => {
      const mockSlipWith2Items = {
        id: 'slip-01',
        slipNumber: 'SLIP-2026-0001',
        status: BorrowingSlipStatus.BORROWED,
        dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // Chưa quá hạn
        totalFine: 0,
        finePaid: false,
        memberId: 'mem-01',
        member: mockMember,
        items: [
          {
            id: 'item-01',
            slipId: 'slip-01',
            bookId: 'book-01',
            bookTitle: 'Clean Code',
            quantity: 1,
            returnedQuantity: 0,
            lostQuantity: 0,
            bookPrice: 250000,
            status: BorrowingItemStatus.BORROWING,
            fineAmount: 0,
            book: mockBook1,
          },
          {
            id: 'item-02',
            slipId: 'slip-01',
            bookId: 'book-02',
            bookTitle: 'Clean Architecture',
            quantity: 1,
            returnedQuantity: 0,
            lostQuantity: 0,
            bookPrice: 300000,
            status: BorrowingItemStatus.BORROWING,
            fineAmount: 0,
            book: mockBook2,
          },
        ],
      };

      prismaMock.borrowingSlip.findUnique.mockResolvedValueOnce(mockSlipWith2Items);

      const updatedDbSlip = {
        ...mockSlipWith2Items,
        status: BorrowingSlipStatus.PARTIAL_RETURNED,
        totalFine: 250000, // Đền bù cuốn 1 mất sách
        items: [
          {
            ...mockSlipWith2Items.items[0],
            lostQuantity: 1,
            status: BorrowingItemStatus.LOST,
            fineAmount: 250000,
          },
          mockSlipWith2Items.items[1],
        ],
      };

      prismaMock.borrowingSlip.update.mockResolvedValueOnce(updatedDbSlip);

      const result = await service.returnItems('slip-01', {
        items: [
          {
            itemId: 'item-01',
            returnCondition: ReturnCondition.LOST,
          },
        ],
        isPaidNow: true,
      });

      expect(result.status).toBe(BorrowingSlipStatus.PARTIAL_RETURNED);
      expect(result.totalFine).toBe(250000);
      expect(prismaMock.book.update).not.toHaveBeenCalled(); // Mất sách thì không hoàn kho
    });
  });
});
