import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AllExceptionsFilter } from '../../common/filters/http-exception.filter.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { BorrowingSlipsController } from '../borrowing-slips/borrowing-slips.controller.js';
import { BorrowingSlipsService } from '../borrowing-slips/borrowing-slips.service.js';
import { BorrowingsController } from '../borrowings/borrowings.controller.js';
import { BorrowingsService } from '../borrowings/borrowings.service.js';
import { BookStockService } from './book-stock.service.js';
import { LoanEligibilityService } from './loan-eligibility.service.js';
import { LoanPolicyService } from './loan-policy.service.js';

describe('Renewal HTTP authorization and detail contract', () => {
  let app: INestApplication;
  let prisma: any;
  let jwt: JwtService;

  beforeEach(async () => {
    const loan = {
      id: 'loan-01',
      memberId: 'mem-01',
      bookId: 'book-01',
      status: 'BORROWED',
      dueDate: new Date(Date.now() + 2 * 86400000),
      returnDate: null,
      renewCount: 0,
      fineAmount: 0,
      finePaid: false,
      items: [],
    };
    const slip = {
      ...loan,
      id: 'slip-01',
      totalFine: 0,
      items: [
        {
          bookId: 'book-01',
          status: 'BORROWING',
          quantity: 1,
          returnedQuantity: 0,
          lostQuantity: 0,
        },
      ],
    };
    prisma = {
      user: {
        findUnique: vi
          .fn()
          .mockImplementation(({ where }: { where: { id: string } }) => ({
            id: where.id,
            role:
              where.id === 'admin'
                ? 'ADMIN'
                : where.id === 'librarian'
                  ? 'LIBRARIAN'
                  : 'MEMBER',
            email: `${where.id}@library.test`,
            isActive: true,
            memberId:
              where.id === 'owner'
                ? 'mem-01'
                : where.id === 'unlinked'
                  ? null
                  : 'mem-other',
          })),
      },
      borrowing: {
        aggregate: vi.fn().mockResolvedValue({ _sum: { fineAmount: 0 } }),
        findUnique: vi.fn().mockResolvedValue(loan),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi
          .fn()
          .mockResolvedValue({ ...loan, renewCount: 1 }),
      },
      borrowingSlip: {
        aggregate: vi.fn().mockResolvedValue({ _sum: { totalFine: 0 } }),
        findUnique: vi.fn().mockResolvedValue(slip),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi
          .fn()
          .mockResolvedValue({ ...slip, renewCount: 1 }),
      },
      reservation: { count: vi.fn().mockResolvedValue(0) },
      loanRenewal: { create: vi.fn().mockResolvedValue({}) },
      member: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'mem-01',
          cardNumber: 'TEST-01',
          fullName: 'Test member',
          status: 'ACTIVE',
          maxBorrowLimit: 5,
          currentBorrowedCount: 0,
          membershipExpiry: new Date(Date.now() + 365 * 86400000),
          borrowings: [],
          borrowingSlips: [],
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      borrowingSlipItem: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      $executeRaw: vi.fn().mockResolvedValue(0),
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'mem-01' }]),
      $transaction: vi
        .fn()
        .mockImplementation((arg: any) =>
          typeof arg === 'function' ? arg(prisma) : Promise.all(arg),
        ),
    };
    jwt = new JwtService({ secret: 'renewal-http-test-secret' });
    const policy = new LoanPolicyService();
    const eligibility = new LoanEligibilityService(prisma, policy);
    const stock = new BookStockService();
    const reservations = {} as ConstructorParameters<
      typeof BorrowingsService
    >[4];

    // Vitest does not emit constructor metadata; provide it for Nest's HTTP fixture.
    Reflect.defineMetadata(
      'design:paramtypes',
      [BorrowingsService],
      BorrowingsController,
    );
    Reflect.defineMetadata(
      'design:paramtypes',
      [BorrowingSlipsService],
      BorrowingSlipsController,
    );
    Reflect.defineMetadata('design:paramtypes', [Reflector], RolesGuard);
    const module = await Test.createTestingModule({
      controllers: [BorrowingsController, BorrowingSlipsController],
      providers: [
        {
          provide: BorrowingsService,
          useValue: new BorrowingsService(
            prisma,
            policy,
            eligibility,
            stock,
            reservations,
          ),
        },
        {
          provide: BorrowingSlipsService,
          useValue: new BorrowingSlipsService(
            prisma,
            policy,
            eligibility,
            stock,
            reservations,
          ),
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(new JwtAuthGuard(jwt, prisma))
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
    vi.restoreAllMocks();
  });

  describe.each([
    { path: '/api/borrowings/loan-01', method: 'post' as const },
    { path: '/api/borrowing-slips/slip-01', method: 'patch' as const },
  ])('$method $path/renew', ({ path, method }) => {
    it('requires a valid JWT on detail and renewal routes', async () => {
      await request(app.getHttpServer()).get(path).expect(401);
      await request(app.getHttpServer())
        [method](`${path}/renew`)
        .send({})
        .expect(401);
      await request(app.getHttpServer())
        [method](`${path}/renew`)
        .auth('invalid-token', { type: 'bearer' })
        .send({})
        .expect(401);
    });

    it('allows MEMBER to renew their own loan through CurrentUser', async () => {
      const token = jwt.sign({ sub: 'owner' });
      const detail = await request(app.getHttpServer())
        .get(path)
        .auth(token, { type: 'bearer' })
        .expect(200);
      expect(detail.body).toMatchObject({ canRenew: true, reasonCode: null });
      await request(app.getHttpServer())
        [method](`${path}/renew`)
        .auth(token, { type: 'bearer' })
        .send({ renewedBy: 'spoofed' })
        .expect(200);
      expect(prisma.loanRenewal.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ renewedBy: 'owner' }),
        }),
      );
    });

    it.each(['admin', 'librarian'])(
      'allows %s to renew another member loan',
      async (sub) => {
        await request(app.getHttpServer())
          [method](`${path}/renew`)
          .auth(jwt.sign({ sub, role: 'MEMBER' }), { type: 'bearer' })
          .send({ renewedBy: 'forged' })
          .expect(200);
        expect(prisma.loanRenewal.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ renewedBy: sub }),
          }),
        );
      },
    );

    it.each(['other', 'unlinked'])(
      'rejects %s MEMBER even with forged JWT claims and body identity',
      async (sub) => {
        const token = jwt.sign({ sub, role: 'ADMIN', memberId: 'mem-01' });
        const detail = await request(app.getHttpServer())
          .get(path)
          .auth(token, { type: 'bearer' })
          .expect(200);
        expect(detail.body).toMatchObject({
          canRenew: false,
          reasonCode: 'NOT_OWNER',
        });
        await request(app.getHttpServer())
          [method](`${path}/renew`)
          .auth(token, { type: 'bearer' })
          .send({ memberId: 'mem-01', role: 'ADMIN', renewedBy: 'owner' })
          .expect(403);
        expect(prisma.borrowing.updateMany).not.toHaveBeenCalled();
        expect(prisma.borrowingSlip.updateMany).not.toHaveBeenCalled();
        expect(prisma.loanRenewal.create).not.toHaveBeenCalled();
      },
    );

    it('exposes ACTIVE_RESERVATION before renewal rejects with HTTP 409', async () => {
      prisma.reservation.count.mockResolvedValue(1);
      const token = jwt.sign({ sub: 'owner' });
      const detail = await request(app.getHttpServer())
        .get(path)
        .auth(token, { type: 'bearer' })
        .expect(200);
      expect(detail.body).toMatchObject({
        canRenew: false,
        reasonCode: 'ACTIVE_RESERVATION',
        message: 'Sách đã có người khác đặt trước',
      });
      const result = await request(app.getHttpServer())
        [method](`${path}/renew`)
        .auth(token, { type: 'bearer' })
        .send({})
        .expect(409);
      expect(result.body.message).toBe(detail.body.message);
    });
  });

  describe.each([
    {
      path: '/api/borrowing-slips/slip-01/approve',
      method: 'patch' as const,
      service: BorrowingSlipsService,
      action: 'approve' as const,
      body: {},
      audit: true,
    },
    {
      path: '/api/borrowing-slips/slip-01/reject',
      method: 'patch' as const,
      service: BorrowingSlipsService,
      action: 'reject' as const,
      body: { reason: 'Rejected' },
      audit: true,
    },
    {
      path: '/api/borrowing-slips/slip-01/return-items',
      method: 'post' as const,
      service: BorrowingSlipsService,
      action: 'returnItems' as const,
      body: { items: [{ itemId: 'item-01', returnCondition: 'GOOD' }] },
      audit: false,
    },
    {
      path: '/api/borrowing-slips/slip-01/pay-fine',
      method: 'post' as const,
      service: BorrowingSlipsService,
      action: 'payFine' as const,
      body: {},
      audit: false,
    },
    {
      path: '/api/borrowings/loan-01/return',
      method: 'post' as const,
      service: BorrowingsService,
      action: 'returnBook' as const,
      body: {},
      audit: false,
    },
    {
      path: '/api/borrowings/loan-01/pay-fine',
      method: 'post' as const,
      service: BorrowingsService,
      action: 'payFine' as const,
      body: {},
      audit: false,
    },
  ])(
    'staff operation $method $path',
    ({ path, method, service, action, body, audit }) => {
      function mockOperation() {
        const instance = app.get(service);
        return vi
          .spyOn(instance as any, action)
          .mockResolvedValue({ id: path.split('/')[3] });
      }

      it('rejects MEMBER before invoking the service despite forged staff identity', async () => {
        const operation = mockOperation();
        await request(app.getHttpServer())
          [method](path)
          .auth(
            jwt.sign({
              sub: 'owner',
              role: 'ADMIN',
              email: 'admin@library.test',
            }),
            { type: 'bearer' },
          )
          .send({
            ...body,
            role: 'ADMIN',
            approvedBy: 'admin',
            rejectedBy: 'admin',
            cancelledBy: 'admin',
          })
          .expect(403);
        expect(operation).not.toHaveBeenCalled();
      });

      it.each(['admin', 'librarian'])(
        'allows database %s role and forwards trusted audit identity',
        async (sub) => {
          const operation = mockOperation();
          await request(app.getHttpServer())
            [method](path)
            .auth(
              jwt.sign({ sub, role: 'MEMBER', email: 'forged@library.test' }),
              { type: 'bearer' },
            )
            .send({
              ...body,
              actor: { id: 'forged' },
              approvedBy: 'forged',
              rejectedBy: 'forged',
              cancelledBy: 'forged',
            })
            .expect(200);
          expect(operation).toHaveBeenCalledTimes(1);
          expect(operation.mock.calls[0][0]).toBe(path.split('/')[3]);
          if (audit) {
            expect(operation.mock.calls[0].at(-1)).toEqual({
              id: sub,
              role: sub === 'admin' ? 'ADMIN' : 'LIBRARIAN',
              email: `${sub}@library.test`,
              isActive: true,
              memberId: 'mem-other',
            });
          }
        },
      );
    },
  );

  describe('Member cancellation HTTP authorization', () => {
    const path = '/api/borrowing-slips/slip-01/cancel';
    beforeEach(() => {
      prisma.borrowingSlip.findUnique.mockResolvedValue({
        id: 'slip-01',
        memberId: 'mem-01',
        status: 'PENDING_APPROVAL',
        items: [{ bookId: 'book-01', quantity: 2, status: 'PENDING' }],
      });
      prisma.borrowingSlip.findUniqueOrThrow.mockResolvedValue({
        id: 'slip-01',
        status: 'CANCELLED',
        items: [],
      });
    });

    it('requires authentication', async () => {
      await request(app.getHttpServer())
        .patch(path)
        .send({ reason: 'Gửi nhầm' })
        .expect(401);
    });

    it.each(['owner', 'admin', 'librarian'])(
      'allows %s and records database identity despite forged fields',
      async (sub) => {
        await request(app.getHttpServer())
          .patch(path)
          .auth(
            jwt.sign({
              sub,
              role: 'ADMIN',
              memberId: 'mem-other',
              email: 'forged@test.local',
            }),
            { type: 'bearer' },
          )
          .send({
            reason: 'Gửi nhầm',
            memberId: 'mem-other',
            role: 'ADMIN',
            cancelledBy: 'forged',
            cancelledById: 'forged',
          })
          .expect(200)
          .expect((res) => expect(res.body.status).toBe('CANCELLED'));
        expect(prisma.borrowingSlip.updateMany).toHaveBeenCalledWith({
          where: { id: 'slip-01', status: 'PENDING_APPROVAL' },
          data: expect.objectContaining({
            cancelledBy: `${sub}@library.test`,
            cancelledById: sub,
          }),
        });
        expect(prisma.member.update).not.toHaveBeenCalled();
        expect(prisma.$executeRaw).not.toHaveBeenCalled();
      },
    );

    it.each(['other', 'unlinked'])(
      'rejects %s despite a forged owner memberId',
      async (sub) => {
        await request(app.getHttpServer())
          .patch(path)
          .auth(jwt.sign({ sub, memberId: 'mem-01', role: 'ADMIN' }), {
            type: 'bearer',
          })
          .send({ reason: 'Gửi nhầm', memberId: 'mem-01', role: 'ADMIN' })
          .expect(403);
        expect(prisma.borrowingSlip.updateMany).not.toHaveBeenCalled();
        expect(prisma.borrowingSlipItem.updateMany).not.toHaveBeenCalled();
      },
    );

    it.each([
      'BORROWED',
      'PARTIAL_RETURNED',
      'COMPLETED',
      'REJECTED',
      'CANCELLED',
    ])('rejects owner cancellation in %s', async (status) => {
      prisma.borrowingSlip.findUnique.mockResolvedValue({
        memberId: 'mem-01',
        status,
        items: [],
      });
      await request(app.getHttpServer())
        .patch(path)
        .auth(jwt.sign({ sub: 'owner' }), { type: 'bearer' })
        .send({ reason: 'Gửi nhầm' })
        .expect(409);
      expect(prisma.borrowingSlip.updateMany).not.toHaveBeenCalled();
      expect(prisma.member.update).not.toHaveBeenCalled();
    });

    it('returns 404 for a missing slip', async () => {
      prisma.borrowingSlip.findUnique.mockResolvedValue(null);
      await request(app.getHttpServer())
        .patch(path)
        .auth(jwt.sign({ sub: 'owner' }), { type: 'bearer' })
        .send({ reason: 'Gửi nhầm' })
        .expect(404);
    });
  });

  it('returns the complete borrow limit contract through the global exception filter', async () => {
    prisma.borrowingSlip.findUnique.mockResolvedValue({
      id: 'slip-01',
      memberId: 'mem-01',
      status: 'PENDING_APPROVAL',
      items: [{ bookId: 'book-01', quantity: 3 }],
    });
    const member = await prisma.member.findUnique();
    prisma.member.findUnique.mockResolvedValue({
      ...member,
      borrowings: Array.from({ length: 3 }, () => ({
        status: 'BORROWED',
        dueDate: new Date(Date.now() + 86400000),
      })),
    });
    const result = await request(app.getHttpServer())
      .patch('/api/borrowing-slips/slip-01/approve')
      .auth(jwt.sign({ sub: 'librarian' }), { type: 'bearer' })
      .expect(409);
    expect(result.body).toMatchObject({
      statusCode: 409,
      code: 'BORROW_LIMIT_EXCEEDED',
      message: 'Vượt hạn mức mượn sách',
      details: {
        maxBorrowLimit: 5,
        currentBorrowedCount: 3,
        requestedQuantity: 3,
        remainingBorrowLimit: 2,
      },
    });
    expect(prisma.borrowingSlip.updateMany).not.toHaveBeenCalled();
    expect(prisma.member.update).not.toHaveBeenCalled();
  });

  it('documents eligibility fields on both detail response schemas', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    );
    for (const name of ['BorrowingDetail', 'BorrowingSlipDetail']) {
      const schema = document.components?.schemas?.[name];
      expect(schema).toMatchObject({
        properties: {
          canRenew: { type: 'boolean' },
          reasonCode: { nullable: true },
          message: { type: 'string' },
        },
      });
    }
  });
});
