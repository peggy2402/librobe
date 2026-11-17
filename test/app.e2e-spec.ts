import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { closeTestApp, createTestApp, TestContext } from './helpers/test-app.js';

/**
 * Smoke test cho các route gốc.
 *
 * Trước đây file này tự dựng app bằng `createNestApplication()` trần, không đặt
 * `setGlobalPrefix('api')` như `main.ts`, nên nó kiểm tra `/health` trong khi
 * production phục vụ `/api/health` — tức là test không phản ánh hành vi thật.
 * Nay dùng chung helper `createTestApp()` để cấu hình giống production.
 *
 * Kỳ vọng `/` -> `/api/docs` cũng đã lạc hậu: từ commit 9986f08 (thêm admin
 * dashboard), route gốc chuyển hướng về `/admin`. Swagger được liên kết từ
 * sidebar của dashboard chứ không còn là trang đích của `/`.
 */
describe('AppController (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  }, 60_000);

  afterAll(async () => {
    if (ctx) await closeTestApp(ctx);
  });

  it('GET / — chuyển hướng về trang quản trị /admin', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/admin');
  });

  it('GET /dashboard — cũng chuyển hướng về /admin', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/dashboard');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/admin');
  });

  it('GET /api/health — trả về trạng thái máy chủ', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.docs).toBe('/api/docs');
  });

  it('GET /api/health — không cần xác thực', async () => {
    const res = await ctx.anon().get('/api/health');
    expect(res.status).toBe(200);
  });
});
