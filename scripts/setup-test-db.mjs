/**
 * Dựng database test cục bộ cho bộ E2E.
 *
 * Chạy: npm run test:e2e:db:up
 *
 * Tạo container PostgreSQL riêng ở cổng 55432, đồng bộ schema Prisma, rồi thêm
 * hai ràng buộc CHECK tồn kho mà Prisma schema không biểu diễn được.
 *
 * Cố tình KHÔNG dùng database production: bộ E2E tạo và xóa dữ liệu thật.
 */
import { execFileSync, execSync } from 'node:child_process';

const CONTAINER = 'librobe-test-db';
const PORT = 55432;
const TEST_DB_URL = `postgresql://postgres:librobe_test@localhost:${PORT}/librobe_test?schema=public`;

function run(cmd, opts = {}) {
  return execSync(cmd, { stdio: 'pipe', encoding: 'utf8', ...opts });
}

function dockerAvailable() {
  try {
    run('docker info');
    return true;
  } catch {
    return false;
  }
}

if (!dockerAvailable()) {
  console.error(
    '\nDocker chưa chạy. Hãy mở Docker Desktop rồi chạy lại.\n' +
      'Hoặc tự cung cấp database test và chạy:\n' +
      '  TEST_DATABASE_URL="postgres://..." npm run test:e2e\n',
  );
  process.exit(1);
}

// 1. Container
let exists = false;
try {
  const out = run(`docker ps -a --filter name=^/${CONTAINER}$ --format "{{.Names}}"`).trim();
  exists = out === CONTAINER;
} catch {}

if (exists) {
  console.log(`Container "${CONTAINER}" đã có, khởi động lại...`);
  try {
    run(`docker start ${CONTAINER}`);
  } catch {}
} else {
  console.log(`Tạo container "${CONTAINER}" ở cổng ${PORT}...`);
  run(
    `docker run -d --name ${CONTAINER} ` +
      `-e POSTGRES_PASSWORD=librobe_test -e POSTGRES_DB=librobe_test ` +
      `-p ${PORT}:5432 postgres:16-alpine`,
  );
}

// 2. Chờ Postgres sẵn sàng
process.stdout.write('Chờ Postgres sẵn sàng');
let ready = false;
for (let i = 0; i < 45; i += 1) {
  try {
    run(`docker exec ${CONTAINER} pg_isready -U postgres -d librobe_test`);
    ready = true;
    break;
  } catch {
    process.stdout.write('.');
    execFileSync(process.execPath, ['-e', 'setTimeout(()=>{},1000)']);
    try {
      run('sleep 1');
    } catch {}
  }
}
process.stdout.write('\n');

if (!ready) {
  console.error('Postgres không sẵn sàng sau 45 lần thử. Xem log: docker logs ' + CONTAINER);
  process.exit(1);
}
console.log('Postgres READY');

// 3. Đồng bộ schema
console.log('Đồng bộ schema Prisma...');
run('npx prisma db push --skip-generate', {
  env: { ...process.env, DATABASE_URL: TEST_DB_URL, DIRECT_URL: TEST_DB_URL },
  stdio: 'inherit',
});

// 4. Ràng buộc CHECK tồn kho (Prisma schema không biểu diễn được)
console.log('Thêm ràng buộc CHECK tồn kho...');
const sql = `
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='books_copies_available_non_negative') THEN
    ALTER TABLE books ADD CONSTRAINT books_copies_available_non_negative CHECK (copies_available >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='books_copies_available_within_total') THEN
    ALTER TABLE books ADD CONSTRAINT books_copies_available_within_total CHECK (copies_available <= copies_total);
  END IF;
END $$;`;
// Truyền SQL qua stdin. Dùng `-c "<sql>"` sẽ bị shell hiểu sai các ký tự
// xuống dòng và dấu $$ của khối DO.
run(`docker exec -i ${CONTAINER} psql -U postgres -d librobe_test -v ON_ERROR_STOP=1 -f -`, {
  input: sql,
});

console.log(
  `\nDatabase test đã sẵn sàng.\n` +
    `  URL  : ${TEST_DB_URL}\n` +
    `  Chạy : npm run test:e2e\n` +
    `  Dọn  : npm run test:e2e:db:down\n`,
);
