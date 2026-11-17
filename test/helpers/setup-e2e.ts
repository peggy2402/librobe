/**
 * Thiết lập môi trường cho E2E — chạy TRƯỚC khi test file import AppModule,
 * vì `PrismaClient` đọc `DATABASE_URL` ngay lúc khởi tạo.
 *
 * Quan trọng nhất: file này CHẶN việc chạy E2E trên database production.
 * Bộ test tạo và xóa dữ liệu thật, nên nếu trỏ vào Supabase production thì
 * sẽ phá dữ liệu của thư viện.
 */

const DEFAULT_TEST_DB =
  'postgresql://postgres:librobe_test@localhost:55432/librobe_test?schema=public';

const target = process.env.TEST_DATABASE_URL || DEFAULT_TEST_DB;

/** Dấu hiệu của database production/được quản lý — tuyệt đối không chạy E2E lên đây. */
const FORBIDDEN_HOST_PATTERNS = [
  'supabase.co',
  'supabase.com',
  'neon.tech',
  'rds.amazonaws.com',
  'railway.app',
  'render.com',
  'azure.com',
  'planetscale',
];

const lower = target.toLowerCase();
const matched = FORBIDDEN_HOST_PATTERNS.find((p) => lower.includes(p));

if (matched) {
  throw new Error(
    `\n\n=== E2E BỊ CHẶN ===\n` +
      `TEST_DATABASE_URL đang trỏ tới một host giống database production ("${matched}").\n` +
      `Bộ E2E này tạo và xóa dữ liệu thật nên không được chạy trên production.\n\n` +
      `Hãy dùng database test cục bộ:\n` +
      `  docker run -d --name librobe-test-db \\\n` +
      `    -e POSTGRES_PASSWORD=librobe_test -e POSTGRES_DB=librobe_test \\\n` +
      `    -p 55432:5432 postgres:16-alpine\n` +
      `  TEST_DATABASE_URL="${DEFAULT_TEST_DB}" npm run prisma:push\n\n`,
  );
}

// Prisma dùng 2 biến này; ghi đè cả hai để không vô tình chạm production.
process.env.DATABASE_URL = target;
process.env.DIRECT_URL = target;

// Khóa cứng tham số nghiệp vụ để assertion không phụ thuộc .env của máy chạy test.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'librobe-e2e-secret';
process.env.LOAN_DEFAULT_DAYS = '14';
process.env.LOAN_MAX_DAYS = '30';
process.env.LOAN_FINE_PER_DAY = '5000';
process.env.LOAN_FINE_GRACE_DAYS = '0';
process.env.LOAN_RENEW_MAX_COUNT = '1';
process.env.LOAN_RENEW_DAYS = '7';
process.env.LOAN_RENEW_MAX_DAYS = '14';
process.env.LOAN_RENEW_WINDOW_DAYS = '0';
process.env.LOAN_RENEW_BLOCK_WHEN_RESERVED = 'true';
process.env.LOAN_BLOCK_BORROW_ON_UNPAID_FINE = 'true';
process.env.LOAN_BLOCK_BORROW_ON_OVERDUE = 'true';
process.env.MEMBER_DEFAULT_BORROW_LIMIT = '5';
process.env.RESERVATION_HOLD_DAYS = '3';
process.env.RESERVATION_MAX_ACTIVE = '3';
process.env.MAIL_PROVIDER = 'console';

// Không bật tracing và không để logic env-admin tự tạo tài khoản ADMIN.
delete process.env.OBSERVE_APP_KEY;
delete process.env.OBSERVE_APP_SECRET;
delete process.env.ADMIN_USERNAME;
delete process.env.ADMIN_PASSWORD;

export const TEST_DATABASE_URL = target;
