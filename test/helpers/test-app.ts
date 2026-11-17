import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AllExceptionsFilter } from '../../src/common/filters/http-exception.filter.js';
import { AppModule } from '../../src/app.module.js';

export interface TestContext {
  app: INestApplication;
  prisma: PrismaClient;
  /** Gửi request kèm sẵn Bearer token của một tài khoản. */
  as: (token: string) => AuthedAgent;
  /** Gửi request không kèm token, để kiểm tra 401. */
  anon: () => AuthedAgent;
}

export interface AuthedAgent {
  get: (path: string) => request.Test;
  post: (path: string, body?: unknown) => request.Test;
  patch: (path: string, body?: unknown) => request.Test;
  delete: (path: string) => request.Test;
}

/**
 * Khởi tạo app giống hệt `main.ts` (ValidationPipe + ExceptionFilter + prefix
 * `/api`), để HTTP status và cấu trúc lỗi trong E2E khớp với production.
 */
export async function createTestApp(): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

  const app = moduleRef.createNestApplication();

  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.setGlobalPrefix('api', {
    exclude: ['/', '/admin', '/admin/*', '/dashboard'],
  });

  await app.init();

  const prisma = new PrismaClient();
  await prisma.$connect();

  const server = () => app.getHttpServer();

  const build = (token?: string): AuthedAgent => ({
    get: (path) => {
      const r = request(server()).get(path);
      return token ? r.set('Authorization', `Bearer ${token}`) : r;
    },
    post: (path, body) => {
      const r = request(server()).post(path).send(body ?? {});
      return token ? r.set('Authorization', `Bearer ${token}`) : r;
    },
    patch: (path, body) => {
      const r = request(server()).patch(path).send(body ?? {});
      return token ? r.set('Authorization', `Bearer ${token}`) : r;
    },
    delete: (path) => {
      const r = request(server()).delete(path);
      return token ? r.set('Authorization', `Bearer ${token}`) : r;
    },
  });

  return {
    app,
    prisma,
    as: (token: string) => build(token),
    anon: () => build(undefined),
  };
}

export async function closeTestApp(ctx: TestContext): Promise<void> {
  await ctx.prisma.$disconnect();
  await ctx.app.close();
}

/**
 * Xóa sạch dữ liệu theo đúng thứ tự phụ thuộc khóa ngoại, để bộ test chạy lặp
 * lại được mà không bị trùng email/ISBN hay sai lệch trạng thái.
 */
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.loanRenewal.deleteMany();
  await prisma.borrowingSlipItem.deleteMany();
  await prisma.borrowingSlip.deleteMany();
  await prisma.borrowing.deleteMany();
  await prisma.reservation.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.user.deleteMany();
  await prisma.member.deleteMany();
  await prisma.book.deleteMany();
  await prisma.author.deleteMany();
  await prisma.category.deleteMany();
}
