import { ConflictException } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { BorrowingSlipsService } from '../src/modules/borrowing-slips/borrowing-slips.service.js';
import { BorrowingsService } from '../src/modules/borrowings/borrowings.service.js';
import { BookStockService } from '../src/modules/loan-policy/book-stock.service.js';
import { LoanEligibilityService } from '../src/modules/loan-policy/loan-eligibility.service.js';
import { LoanPolicyService } from '../src/modules/loan-policy/loan-policy.service.js';
import { lockMemberLoans } from '../src/modules/loan-policy/member-loan-lock.js';
import { PrismaService } from '../src/modules/prisma/prisma.service.js';
import { ReservationsService } from '../src/modules/reservations/reservations.service.js';
import { createPostgresTestDatabase } from './helpers/postgres-test-database.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const memberId = 'test-member';
const actor = {
  id: 'test-librarian',
  email: 'staff@test.local',
  role: 'LIBRARIAN' as const,
  memberId: null,
};
const owner = {
  id: 'test-owner',
  email: 'owner@test.local',
  role: 'MEMBER' as const,
  memberId,
};
const future = () => new Date(Date.now() + 14 * 86400000);

describe.skipIf(!databaseUrl)(
  'Borrowing limits with real PostgreSQL transactions',
  () => {
    let database: Awaited<ReturnType<typeof createPostgresTestDatabase>>;
    let prisma: PrismaService;
    let slips: BorrowingSlipsService;
    let loans: BorrowingsService;
    let eligibility: LoanEligibilityService;

    beforeAll(async () => {
      database = await createPostgresTestDatabase(databaseUrl!);
      prisma = database.prisma;
      const policy = new LoanPolicyService();
      eligibility = new LoanEligibilityService(prisma, policy);
      const stock = new BookStockService();
      const reservations = new ReservationsService(prisma, policy);
      slips = new BorrowingSlipsService(
        prisma,
        policy,
        eligibility,
        stock,
        reservations,
      );
      loans = new BorrowingsService(
        prisma,
        policy,
        eligibility,
        stock,
        reservations,
      );

      await prisma.member.create({
        data: {
          id: memberId,
          cardNumber: 'TEST-001',
          fullName: 'Test member',
          email: owner.email,
          phone: 'test-member-phone',
          address: 'Test address',
          membershipExpiry: future(),
          maxBorrowLimit: 5,
        },
      });
      await prisma.user.createMany({
        data: [
          {
            id: actor.id,
            email: actor.email,
            fullName: 'Test staff',
            phone: 'test-staff-phone',
            password: 'unused-test-hash',
            role: actor.role,
          },
          {
            id: owner.id,
            email: owner.email,
            fullName: 'Test owner',
            phone: 'test-owner-phone',
            password: 'unused-test-hash',
            role: owner.role,
            memberId,
          },
        ],
      });
      await prisma.author.create({
        data: { id: 'test-author', name: 'Test author', nationality: 'VN' },
      });
      await prisma.category.create({
        data: { id: 'test-category', name: 'Test category' },
      });
      await prisma.book.createMany({
        data: ['book-a', 'book-b'].map((id) => ({
          id,
          isbn: id,
          title: id,
          authorId: 'test-author',
          categoryId: 'test-category',
          publisher: 'Test publisher',
          publishYear: 2026,
          shelfLocation: 'TEST',
          description: 'Test book',
          copiesAvailable: 20,
          copiesTotal: 20,
        })),
      });
    }, 60_000);

    afterAll(async () => {
      await database?.dispose();
    });

    beforeEach(async () => {
      await prisma.loanRenewal.deleteMany();
      await prisma.reservation.deleteMany();
      await prisma.borrowingSlipItem.deleteMany();
      await prisma.borrowingSlip.deleteMany();
      await prisma.borrowing.deleteMany();
      await prisma.member.update({
        where: { id: memberId },
        data: { currentBorrowedCount: 0 },
      });
      await prisma.book.updateMany({
        data: { copiesAvailable: 20, status: 'AVAILABLE' },
      });
    });

    async function seedHeldBooks(count: number) {
      await prisma.borrowing.createMany({
        data: Array.from({ length: count }, (_, i) => ({
          id: `held-${i}`,
          transactionCode: `HELD-${i}`,
          memberId,
          bookId: 'book-a',
          dueDate: future(),
        })),
      });
      await prisma.member.update({
        where: { id: memberId },
        data: { currentBorrowedCount: count },
      });
      await prisma.book.update({
        where: { id: 'book-a' },
        data: { copiesAvailable: 20 - count },
      });
    }

    function createSlip(id: string, quantity: number, bookId = 'book-a') {
      return prisma.borrowingSlip.create({
        data: {
          id,
          slipNumber: id,
          memberId,
          dueDate: future(),
          items: { create: { bookId, quantity, status: 'PENDING' } },
        },
      });
    }

    async function snapshot() {
      const [member, documents, books, reservations] = await Promise.all([
        prisma.member.findUniqueOrThrow({ where: { id: memberId } }),
        prisma.borrowingSlip.findMany({
          orderBy: { id: 'asc' },
          include: { items: { orderBy: { id: 'asc' } } },
        }),
        prisma.book.findMany({ orderBy: { id: 'asc' } }),
        prisma.reservation.findMany({ orderBy: { id: 'asc' } }),
      ]);
      return { member, documents, books, reservations };
    }

    /** Hold the member row until both real DB sessions are waiting on a lock. */
    async function contend(operations: (() => Promise<unknown>)[]) {
      let release!: () => void;
      let locked!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const ready = new Promise<void>((resolve) => {
        locked = resolve;
      });
      const blocker = prisma.$transaction(
        async (tx) => {
          await lockMemberLoans(tx, memberId);
          locked();
          await gate;
        },
        { timeout: 10_000 },
      );
      // Surface an unexpected blocker failure without leaving ready unresolved.
      void blocker.catch(() => locked());
      await ready;
      const pending = Promise.allSettled(
        operations.map((operation) => operation()),
      );
      try {
        const deadline = Date.now() + 2500;
        let waiting = 0;
        do {
          const rows = await prisma.$queryRaw<{ count: number }[]>`
          SELECT COUNT(*)::integer AS count FROM pg_stat_activity
          WHERE datname = current_database() AND wait_event_type = 'Lock'
            AND query LIKE '%SELECT id FROM members WHERE id = %'
        `;
          waiting = rows[0].count;
          if (waiting >= operations.length) break;
          await new Promise((resolve) => setTimeout(resolve, 20));
        } while (Date.now() < deadline);
        expect(
          waiting,
          'both operations must reach the PostgreSQL row lock',
        ).toBeGreaterThanOrEqual(operations.length);
      } finally {
        release();
        await blocker;
        // Drain operations even when the contention assertion fails.
        await pending;
      }
      return pending;
    }

    function assertOneLimitFailure(results: PromiseSettledResult<unknown>[]) {
      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      const failure = results.find(
        (result) => result.status === 'rejected',
      ) as PromiseRejectedResult;
      expect(failure.reason).toBeInstanceOf(ConflictException);
      expect(failure.reason.getResponse()).toMatchObject({
        code: 'BORROW_LIMIT_EXCEEDED',
        details: { currentBorrowedCount: 5, remainingBorrowLimit: 0 },
      });
    }

    it('serializes approval of two different slips for the same member', async () => {
      await seedHeldBooks(3);
      await createSlip('slip-a', 2);
      await createSlip('slip-b', 2, 'book-b');
      const before = await snapshot();
      const results = await contend([
        () => slips.approve('slip-a', actor),
        () => slips.approve('slip-b', actor),
      ]);
      assertOneLimitFailure(results);
      const after = await snapshot();
      expect(after.member.currentBorrowedCount).toBe(5);
      expect(
        (await eligibility.getMemberLoanState(memberId)).currentBorrowedCount,
      ).toBe(5);
      const pending = after.documents.find(
        (slip) => slip.status === 'PENDING_APPROVAL',
      )!;
      expect(pending).toEqual(
        before.documents.find((slip) => slip.id === pending.id),
      );
      expect(
        after.books.reduce((sum, book) => sum + book.copiesAvailable, 0),
      ).toBe(35);
    });

    it('shares the same lock between slip approval and legacy borrowing', async () => {
      await seedHeldBooks(4);
      await createSlip('slip-a', 1);
      assertOneLimitFailure(
        await contend([
          () => slips.approve('slip-a', actor),
          () => loans.borrowBook({ memberId, bookId: 'book-b' }),
        ]),
      );
      expect(
        (await eligibility.getMemberLoanState(memberId)).currentBorrowedCount,
      ).toBe(5);
      expect((await snapshot()).member.currentBorrowedCount).toBe(5);
    });

    it('keeps rejected approval unchanged and permits retry after returning a book', async () => {
      await seedHeldBooks(3);
      await createSlip('slip-a', 3, 'book-b');
      const before = await snapshot();
      await expect(slips.approve('slip-a', actor)).rejects.toMatchObject({
        status: 409,
      });
      expect(await snapshot()).toEqual(before);
      await loans.returnBook('held-0', {});
      await slips.approve('slip-a', actor);
      expect(
        (await eligibility.getMemberLoanState(memberId)).currentBorrowedCount,
      ).toBe(5);
      expect((await snapshot()).member.currentBorrowedCount).toBe(5);
    });

    it('rolls back status, items, stock, audit and reservations on a later stock failure', async () => {
      await createSlip('slip-a', 1);
      await prisma.borrowingSlipItem.create({
        data: { slipId: 'slip-a', bookId: 'book-b', quantity: 2 },
      });
      await prisma.book.update({
        where: { id: 'book-b' },
        data: { copiesAvailable: 1 },
      });
      await prisma.reservation.create({
        data: { reservationCode: 'RSV-TEST', memberId, bookId: 'book-a' },
      });
      const before = await snapshot();
      await expect(slips.approve('slip-a', actor)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(await snapshot()).toEqual(before);
    });

    it('issues the same slip only once under concurrent approvals', async () => {
      await createSlip('slip-a', 2);
      const results = await contend([
        () => slips.approve('slip-a', actor),
        () => slips.approve('slip-a', actor),
      ]);
      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      expect((await snapshot()).member.currentBorrowedCount).toBe(2);
      expect((await snapshot()).books[0].copiesAvailable).toBe(18);
    });

    it('allows only one winner between member cancellation and approval', async () => {
      await createSlip('slip-a', 2);
      const results = await contend([
        () => slips.approve('slip-a', actor),
        () => slips.cancel('slip-a', { reason: 'Gửi nhầm' }, owner),
      ]);
      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      const after = await snapshot();
      const issued = after.documents[0].status === 'BORROWED';
      expect(after.member.currentBorrowedCount).toBe(issued ? 2 : 0);
      expect(after.books[0].copiesAvailable).toBe(issued ? 18 : 20);
      expect(after.documents[0].items[0].status).toBe(
        issued ? 'BORROWING' : 'CANCELLED',
      );
    });

    it('serializes returns of separate items without losing completion or counts', async () => {
      await createSlip('slip-a', 1);
      await prisma.borrowingSlipItem.create({
        data: { slipId: 'slip-a', bookId: 'book-b', quantity: 1 },
      });
      const issued = await slips.approve('slip-a', actor);
      const results = await contend(
        issued.items.map(
          (item) => () =>
            slips.returnItems('slip-a', {
              items: [
                { itemId: item.id, quantity: 1, returnCondition: 'GOOD' },
              ],
            }),
        ),
      );
      expect(results.every((result) => result.status === 'fulfilled')).toBe(
        true,
      );
      const after = await snapshot();
      expect(after.documents[0].status).toBe('COMPLETED');
      expect(after.member.currentBorrowedCount).toBe(0);
      expect(after.books.every((book) => book.copiesAvailable === 20)).toBe(
        true,
      );
    });

    it('serializes staff cancellation with partial return without restoring stock twice', async () => {
      await createSlip('slip-a', 2);
      const issued = await slips.approve('slip-a', actor);
      await contend([
        () => slips.cancel('slip-a', { reason: 'Hủy tại quầy' }, actor),
        () =>
          slips.returnItems('slip-a', {
            items: [
              {
                itemId: issued.items[0].id,
                quantity: 1,
                returnCondition: 'GOOD',
              },
            ],
          }),
      ]);
      const after = await snapshot();
      expect(after.documents[0].status).toBe('CANCELLED');
      expect(after.member.currentBorrowedCount).toBe(0);
      expect(after.books[0].copiesAvailable).toBe(20);
    });
  },
);
