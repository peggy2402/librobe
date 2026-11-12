import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaTx } from './book-stock.service.js';

// A waiter must read the loans committed by the previous lock holder.
export const MEMBER_LOAN_TRANSACTION_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
};

/** Acquire before reading eligibility or writing any loan, item or stock row. */
export async function lockMemberLoans(
  tx: PrismaTx,
  memberId: string,
): Promise<void> {
  const members = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM members WHERE id = ${memberId} FOR UPDATE
  `;
  if (members.length === 0) {
    throw new NotFoundException(`Không tìm thấy độc giả với ID "${memberId}"`);
  }
}
