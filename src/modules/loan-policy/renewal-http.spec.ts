import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AllExceptionsFilter } from '../../common/filters/http-exception.filter.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
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
            role: 'MEMBER',
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
        findUnique: vi.fn().mockResolvedValue(loan),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi
          .fn()
          .mockResolvedValue({ ...loan, renewCount: 1 }),
      },
      borrowingSlip: {
        findUnique: vi.fn().mockResolvedValue(slip),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi
          .fn()
          .mockResolvedValue({ ...slip, renewCount: 1 }),
      },
      reservation: { count: vi.fn().mockResolvedValue(0) },
      loanRenewal: { create: vi.fn().mockResolvedValue({}) },
      $executeRaw: vi.fn().mockResolvedValue(0),
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
