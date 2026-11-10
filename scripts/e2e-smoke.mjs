// Kiểm chứng end-to-end trên database thật: 3 tình huống quan trọng nhất.
// Script tự dọn dữ liệu test ở cuối. Không in ra bất kỳ thông tin bí mật nào.
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

const API = 'http://localhost:3999/api';
const prisma = new PrismaClient();

// Đọc .env để lấy tài khoản admin, không in giá trị ra màn hình
const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);

let TOKEN = '';
const H = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` });

async function call(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: H(),
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {}
  return { status: res.status, body: json };
}

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

const SUFFIX = Date.now().toString().slice(-7);
const EMAILS = [];
const ISBNS = [];

try {
  // ---- Đăng nhập ----
  const login = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identifier: env.ADMIN_USERNAME,
      password: env.ADMIN_PASSWORD,
    }),
  });
  const loginBody = await login.json();
  TOKEN = loginBody.accessToken || '';
  if (!TOKEN) throw new Error(`Dang nhap that bai: HTTP ${login.status}`);
  console.log('Dang nhap thanh cong\n');

  const authorId = (await call('GET', '/authors?limit=1')).body.data[0].id;
  const categoryId = (await call('GET', '/categories?limit=1')).body.data[0].id;

  const mkMember = async (tag) => {
    const email = `smoke.${tag}.${SUFFIX}@librobe.test`;
    EMAILS.push(email);
    const r = await call('POST', '/members', {
      fullName: `Smoke ${tag.toUpperCase()}`,
      email,
      phone: `09${SUFFIX}${tag === 'a' ? 1 : tag === 'b' ? 2 : 3}`,
      address: 'Dia chi kiem thu',
      maxBorrowLimit: 5,
    });
    if (r.status !== 201) throw new Error(`Tao doc gia that bai: ${JSON.stringify(r.body)}`);
    return r.body.id;
  };

  const mkBook = async (copies, tag) => {
    const isbn = `978${SUFFIX}${tag}`.slice(0, 13).padEnd(13, '0');
    ISBNS.push(isbn);
    const r = await call('POST', '/books', {
      isbn,
      title: `Smoke Book ${tag}`,
      authorId,
      categoryId,
      publisher: 'NXB Kiem Thu',
      publishYear: 2024,
      copiesTotal: copies,
      price: 200000,
      shelfLocation: 'S-01',
      description: 'Sach phuc vu kiem thu tu dong',
    });
    if (r.status !== 201) throw new Error(`Tao sach that bai: ${JSON.stringify(r.body)}`);
    return r.body.id;
  };

  const mA = await mkMember('a');
  const mB = await mkMember('b');

  // =========================================================================
  console.log('--- TINH HUONG 3: hai doc gia cung muon ban sach cuoi cung ---');
  // =========================================================================
  const bookLast = await mkBook(1, '1');

  const [r1, r2] = await Promise.all([
    call('POST', '/borrowings', { memberId: mA, bookId: bookLast }),
    call('POST', '/borrowings', { memberId: mB, bookId: bookLast }),
  ]);
  const codes = [r1.status, r2.status].sort((a, b) => a - b);
  check(
    'Dung 1 request thanh cong (201) va 1 request bi chan (409)',
    codes[0] === 201 && codes[1] === 409,
    `nhan duoc ${codes.join(' / ')}`,
  );

  const stock = await prisma.book.findUnique({
    where: { id: bookLast },
    select: { copiesAvailable: true },
  });
  check('Ton kho = 0, khong bi am', stock.copiesAvailable === 0, `copiesAvailable=${stock.copiesAvailable}`);

  const activeLoans = await prisma.borrowing.count({
    where: { bookId: bookLast, status: { in: ['BORROWED', 'OVERDUE'] } },
  });
  check('Chi co dung 1 phieu muon duoc tao', activeLoans === 1, `so phieu=${activeLoans}`);

  // =========================================================================
  console.log('\n--- TINH HUONG 4: tra sach muon 5 ngay -> phat 25.000 VND ---');
  // =========================================================================
  const bookX = await mkBook(5, '2');
  const loan = (await call('POST', '/borrowings', { memberId: mA, bookId: bookX })).body;

  // Dich han tra ve 5 ngay truoc de mo phong tre han
  await prisma.$executeRawUnsafe(
    `UPDATE borrowings SET due_date = NOW() - INTERVAL '5 days' WHERE id = $1`,
    loan.id,
  );

  const afterReturn = await call('POST', `/borrowings/${loan.id}/return`, { notes: 'Tra muon' });
  check(
    'Tien phat = 25000 (5 ngay x 5000 x 1 cuon)',
    afterReturn.body?.fineAmount === 25000,
    `fineAmount=${afterReturn.body?.fineAmount}`,
  );
  check(
    'Da tra sach (RETURNED) nhung CHUA nop phat (finePaid=false)',
    afterReturn.body?.status === 'RETURNED' && afterReturn.body?.finePaid === false,
    `status=${afterReturn.body?.status}, finePaid=${afterReturn.body?.finePaid}`,
  );

  const dup = await call('POST', `/borrowings/${loan.id}/return`, {});
  const dupRow = await prisma.borrowing.findUnique({
    where: { id: loan.id },
    select: { fineAmount: true },
  });
  check(
    'Tra sach lap lai bi chan (400) va KHONG cong phat lan hai',
    dup.status === 400 && dupRow.fineAmount === 25000,
    `HTTP ${dup.status}, fineAmount van = ${dupRow.fineAmount}`,
  );

  const debt = await call('GET', `/members/${mA}/debt-summary`);
  check(
    'No phat chan muon tiep (canBorrow=false, blockReason=UNPAID_FINE)',
    debt.body?.canBorrow === false && debt.body?.blockReason === 'UNPAID_FINE',
    `canBorrow=${debt.body?.canBorrow}, blockReason=${debt.body?.blockReason}`,
  );

  const blocked = await call('POST', '/borrowings', { memberId: mA, bookId: bookX });
  check('Luong GHI thuc su bi chan khi no phat (400)', blocked.status === 400, `HTTP ${blocked.status}`);

  const paid = await call('POST', `/borrowings/${loan.id}/pay-fine`);
  check(
    'Thanh toan phat -> finePaid=true va co finePaidAt',
    paid.body?.finePaid === true && !!paid.body?.finePaidAt,
    `finePaid=${paid.body?.finePaid}`,
  );

  // =========================================================================
  console.log('\n--- TINH HUONG 5: gia han & chan gia han khi co nguoi dat truoc ---');
  // =========================================================================
  const bookY = await mkBook(3, '3');
  const loanR = (await call('POST', '/borrowings', {
    memberId: mA,
    bookId: bookY,
    durationDays: 2,
  })).body;

  const renew1 = await call('POST', `/borrowings/${loanR.id}/renew`, {
    extraDays: 7,
    renewedBy: 'Thu thu Lan',
  });
  const expectedDue = new Date(new Date(loanR.dueDate).getTime() + 7 * 86400000).getTime();
  check(
    'Gia han thanh cong: renewCount=1 va dueDate = han cu + 7 ngay',
    renew1.status === 200 &&
      renew1.body.renewCount === 1 &&
      new Date(renew1.body.dueDate).getTime() === expectedDue,
    `renewCount=${renew1.body?.renewCount}`,
  );

  const history = await call('GET', `/borrowings/${loanR.id}/renewals`);
  check(
    'Luu lich su gia han (audit) day du',
    history.body?.length === 1 &&
      history.body[0].sequence === 1 &&
      history.body[0].extraDays === 7 &&
      history.body[0].renewedBy === 'Thu thu Lan',
    `so ban ghi=${history.body?.length}`,
  );

  const renew2 = await call('POST', `/borrowings/${loanR.id}/renew`, { extraDays: 7 });
  check('Gia han lan 2 bi chan (400, toi da 1 lan)', renew2.status === 400, `HTTP ${renew2.status}`);

  // Doc gia B dat truoc chinh cuon sach do
  const loanR2 = (await call('POST', '/borrowings', {
    memberId: mB,
    bookId: bookY,
    durationDays: 2,
  })).body;

  const rsv = await call('POST', '/reservations', { memberId: mA, bookId: bookY });
  check(
    'Tao phieu dat truoc thanh cong (201)',
    rsv.status === 201 && !!rsv.body.reservationCode,
    `code=${rsv.body?.reservationCode}, status=${rsv.body?.status}`,
  );

  const renewBlocked = await call('POST', `/borrowings/${loanR2.id}/renew`, { extraDays: 7 });
  const stillZero = await prisma.borrowing.findUnique({
    where: { id: loanR2.id },
    select: { renewCount: true, dueDate: true },
  });
  check(
    'CHAN gia han khi co doc gia khac dat truoc (409)',
    renewBlocked.status === 409,
    `HTTP ${renewBlocked.status}`,
  );
  check(
    'Gia han bi chan -> renewCount van = 0, han tra khong doi',
    stillZero.renewCount === 0 &&
      new Date(stillZero.dueDate).getTime() === new Date(loanR2.dueDate).getTime(),
    `renewCount=${stillZero.renewCount}`,
  );

  const queue = await call('GET', `/reservations/book/${bookY}/queue`);
  check(
    'Hang doi dat truoc cua cuon sach hien dung 1 phieu',
    queue.body?.length === 1,
    `so phieu trong hang doi=${queue.body?.length}`,
  );

  // =========================================================================
  console.log('\n--- TOAN VEN DU LIEU ---');
  // =========================================================================
  const badStock = await prisma.$queryRawUnsafe(
    `SELECT count(*)::int n FROM books WHERE copies_available < 0 OR copies_available > copies_total`,
  );
  check('Khong co cuon sach nao ton kho am hoac vuot tong so ban', badStock[0].n === 0, `n=${badStock[0].n}`);

  const badStatus = await prisma.$queryRawUnsafe(
    `SELECT count(*)::int n FROM borrowings
     WHERE (status='RETURNED' AND return_date IS NULL)
        OR (status<>'RETURNED' AND return_date IS NOT NULL)`,
  );
  check('Trang thai phieu muon nhat quan voi ngay tra', badStatus[0].n === 0, `n=${badStatus[0].n}`);
} catch (err) {
  console.error('\nLOI KHI CHAY KIEM CHUNG:', err.message);
  process.exitCode = 1;
} finally {
  // ---- Don du lieu test ----
  try {
    const members = await prisma.member.findMany({
      where: { email: { in: EMAILS } },
      select: { id: true },
    });
    const ids = members.map((m) => m.id);
    if (ids.length) {
      await prisma.loanRenewal.deleteMany({
        where: { borrowing: { memberId: { in: ids } } },
      });
      await prisma.reservation.deleteMany({ where: { memberId: { in: ids } } });
      await prisma.borrowing.deleteMany({ where: { memberId: { in: ids } } });
      await prisma.member.deleteMany({ where: { id: { in: ids } } });
    }
    if (ISBNS.length) await prisma.book.deleteMany({ where: { isbn: { in: ISBNS } } });
    console.log('\nDa don sach du lieu kiem thu.');
  } catch (e) {
    console.error('Don du lieu khong hoan tat:', e.message);
  }

  const pass = results.filter((r) => r.pass).length;
  console.log(`\n==== KET QUA: ${pass}/${results.length} kiem tra PASS ====`);
  if (pass !== results.length) {
    console.log('Cac kiem tra that bai:');
    results.filter((r) => !r.pass).forEach((r) => console.log('   -', r.name, `(${r.detail})`));
    process.exitCode = 1;
  }
  await prisma.$disconnect();
}
