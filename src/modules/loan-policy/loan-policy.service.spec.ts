import { beforeEach, describe, expect, it } from 'vitest';
import { LoanPolicyService } from './loan-policy.service.js';

const DAY = 24 * 60 * 60 * 1000;

describe('LoanPolicyService - Cấu hình & công thức nghiệp vụ', () => {
  let policy: LoanPolicyService;

  beforeEach(() => {
    policy = new LoanPolicyService();
  });

  describe('Giá trị mặc định khi không cấu hình biến môi trường', () => {
    it('mức phạt mặc định là 5.000 VNĐ / ngày / cuốn', () => {
      expect(policy.finePerDayPerBook).toBe(5000);
    });

    it('thời hạn mượn mặc định 14 ngày, tối đa 30 ngày', () => {
      expect(policy.defaultLoanDays).toBe(14);
      expect(policy.maxLoanDays).toBe(30);
    });

    it('mỗi lượt mượn chỉ được gia hạn tối đa 1 lần, mỗi lần 7 ngày', () => {
      expect(policy.maxRenewCount).toBe(1);
      expect(policy.defaultRenewDays).toBe(7);
    });

    it('mặc định chặn gia hạn khi sách có người đặt trước', () => {
      expect(policy.blockRenewWhenReserved).toBe(true);
    });
  });

  describe('countOverdueDays - số ngày quá hạn', () => {
    it('trả đúng hạn thì không có ngày quá hạn', () => {
      const due = new Date('2026-11-20T10:00:00');
      expect(policy.countOverdueDays(due, new Date('2026-11-20T18:00:00'))).toBe(0);
    });

    it('trả trước hạn thì không có ngày quá hạn', () => {
      const due = new Date('2026-11-20T10:00:00');
      expect(policy.countOverdueDays(due, new Date('2026-11-18T10:00:00'))).toBe(0);
    });

    it('trễ 5 ngày thì đếm đúng 5 ngày', () => {
      const due = new Date('2026-11-20T10:00:00');
      expect(policy.countOverdueDays(due, new Date('2026-11-25T10:00:00'))).toBe(5);
    });

    it('trễ vài giờ sau hạn vẫn tính 0 ngày (so sánh theo mốc đầu ngày, không phải mili-giây)', () => {
      const due = new Date('2026-11-20T08:00:00');
      expect(policy.countOverdueDays(due, new Date('2026-11-20T23:59:00'))).toBe(0);
    });
  });

  describe('calculateLateFee - Tiền phạt = ngày quá hạn × mức phạt × số lượng', () => {
    it('trễ 5 ngày, 1 cuốn, 5.000 VNĐ/ngày -> 25.000 VNĐ', () => {
      const due = new Date('2026-11-20T10:00:00');
      expect(policy.calculateLateFee(due, new Date('2026-11-25T10:00:00'), 1)).toBe(25_000);
    });

    it('trễ 5 ngày, 3 cuốn -> 75.000 VNĐ', () => {
      const due = new Date('2026-11-20T10:00:00');
      expect(policy.calculateLateFee(due, new Date('2026-11-25T10:00:00'), 3)).toBe(75_000);
    });

    it('trả đúng hạn thì không phát sinh tiền phạt', () => {
      const due = new Date('2026-11-20T10:00:00');
      expect(policy.calculateLateFee(due, new Date('2026-11-20T10:00:00'), 3)).toBe(0);
    });
  });

  describe('resolveDueDate / resolveRenewDays', () => {
    it('hạn trả mặc định là ngày mượn + 14 ngày', () => {
      const borrowDate = new Date('2026-11-10T08:00:00');
      const due = policy.resolveDueDate(borrowDate);
      expect(due.getTime() - borrowDate.getTime()).toBe(14 * DAY);
    });

    it('tôn trọng số ngày mượn do thủ thư chỉ định', () => {
      const borrowDate = new Date('2026-11-10T08:00:00');
      const due = policy.resolveDueDate(borrowDate, 7);
      expect(due.getTime() - borrowDate.getTime()).toBe(7 * DAY);
    });

    it('kẹp số ngày gia hạn trong giới hạn tối đa mỗi lần', () => {
      expect(policy.resolveRenewDays(undefined)).toBe(7);
      expect(policy.resolveRenewDays(3)).toBe(3);
      expect(policy.resolveRenewDays(90)).toBe(policy.maxRenewDays);
    });
  });
});
