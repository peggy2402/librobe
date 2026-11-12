// Kiểm chứng end-to-end 5 việc vừa làm, trên database thật. Tự dọn dữ liệu.
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

const API = 'http://localhost:3999/api';
const prisma = new PrismaClient();
const S = Date.now().toString().slice(-7);
// Mật khẩu chỉ tồn tại trong lần chạy này, dùng chung cho đăng ký và đăng nhập.
const testPassword = randomBytes(24).toString('hex');
const env = Object.fromEntries(readFileSync('.env', 'utf8').split('\n')
  .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));

const EMAILS = [];
const ISBNS = [];
const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

const call = async (method, path, token, body) => {
  const h = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = `Bearer ${token}`;
  const r = await fetch(`${API}${path}`, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, body: j };
};
const login = async (id, pw) => (await call('POST', '/auth/login', null, { identifier: id, password: pw })).body.accessToken;

try {
  const admin = await login(env.ADMIN_USERNAME, env.ADMIN_PASSWORD);
  if (!admin) throw new Error('khong dang nhap duoc admin');

  // ===== VIEC 4: chan tu khai role khi dang ky =====
  console.log('--- VIEC 4: chan leo thang dac quyen qua /auth/register ---');
  const atkEmail = `rbac.atk.${S}@librobe.test`; EMAILS.push(atkEmail);
  const reg = await call('POST', '/auth/register', null, {
    email: atkEmail, phone: `09${S}1`, password: testPassword,
    fullName: 'Ke Tan Cong', role: 'ADMIN',
  });
  check('Tu dang ky voi role=ADMIN -> bi buoc thanh MEMBER',
    reg.status === 201 && reg.body?.user?.role === 'MEMBER',
    `HTTP ${reg.status}, role=${reg.body?.user?.role}`);

  const atkToken = reg.body?.accessToken;

  // ===== VIEC 1: phan quyen =====
  console.log('\n--- VIEC 1: RolesGuard ---');
  const authorId = (await call('GET', '/authors?limit=1', admin)).body.data[0].id;
  const categoryId = (await call('GET', '/categories?limit=1', admin)).body.data[0].id;

  const isbn = `979${S}1`.slice(0, 13).padEnd(13, '0'); ISBNS.push(isbn);
  const bk = await call('POST', '/books', admin, { isbn, title: 'Sach RBAC', authorId, categoryId,
    publisher: 'NXB', publishYear: 2024, copiesTotal: 3, price: 100000,
    shelfLocation: 'R-01', description: 'Test phan quyen' });
  check('ADMIN tao duoc sach', bk.status === 201, `HTTP ${bk.status}`);

  // endpoint truoc day hoan toan cong khai
  const noTok = await call('GET', '/books', null);
  check('GET /books khi KHONG co token -> 401 (truoc day la 200)', noTok.status === 401, `HTTP ${noTok.status}`);
  const noTokM = await call('GET', '/members', null);
  check('GET /members khi KHONG co token -> 401 (truoc day ro lo PII)', noTokM.status === 401, `HTTP ${noTokM.status}`);
  const noTokCreate = await call('POST', '/members', null, { fullName: 'X', email: `x.${S}@t.test`, phone: `09${S}2`, address: 'Y' });
  check('POST /members khi KHONG co token -> 401 (truoc day tao duoc ban ghi that)', noTokCreate.status === 401, `HTTP ${noTokCreate.status}`);
  const noTokStats = await call('GET', '/stats', null);
  check('GET /stats khi KHONG co token -> 401', noTokStats.status === 401, `HTTP ${noTokStats.status}`);

  // MEMBER bi chan khoi cac thao tac quan tri
  const mDel = await call('DELETE', `/books/${bk.body.id}`, atkToken);
  check('MEMBER xoa sach -> 403', mDel.status === 403, `HTTP ${mDel.status}`);
  const mCreate = await call('POST', '/members', atkToken, { fullName: 'Z', email: `z.${S}@t.test`, phone: `09${S}3`, address: 'W' });
  check('MEMBER tao the doc gia -> 403', mCreate.status === 403, `HTTP ${mCreate.status}`);
  const mStats = await call('GET', '/stats', atkToken);
  check('MEMBER xem bao cao -> 403', mStats.status === 403, `HTTP ${mStats.status}`);
  const mUsers = await call('GET', '/users', atkToken);
  check('MEMBER xem danh sach tai khoan -> 403', mUsers.status === 403, `HTTP ${mUsers.status}`);

  // ===== LO HONG GOC: MEMBER tu duyet phieu cua chinh minh =====
  console.log('\n--- LO HONG GOC: MEMBER tu duyet phieu muon ---');
  const mEmail = `rbac.m.${S}@librobe.test`; EMAILS.push(mEmail);
  const member = (await call('POST', '/members', admin, { fullName: 'Doc Gia RBAC', email: mEmail,
    phone: `09${S}6`, address: 'Dia chi', maxBorrowLimit: 5 })).body;
  await prisma.user.update({ where: { email: atkEmail }, data: { memberId: member.id } });

  const slip = await call('POST', '/borrowing-slips', atkToken, {
    memberId: member.id, items: [{ bookId: bk.body.id, quantity: 1 }] });
  check('MEMBER van tu lap duoc phieu muon (dung thiet ke workflow)', slip.status === 201, `HTTP ${slip.status}`);

  const selfApprove = await call('PATCH', `/borrowing-slips/${slip.body.id}/approve`, atkToken);
  check('MEMBER tu duyet phieu cua chinh minh -> 403 (truoc day la 200)',
    selfApprove.status === 403, `HTTP ${selfApprove.status}`);

  // ===== VIEC 2 + 3: audit nguoi thuc hien =====
  console.log('\n--- VIEC 2+3: luu khoa ngoai nguoi phe duyet / tu choi / huy ---');
  const adminUser = await prisma.user.findUnique({ where: { email: 'admin@librobe.com' }, select: { id: true } });

  const appr = await call('PATCH', `/borrowing-slips/${slip.body.id}/approve`, admin);
  check('ADMIN duyet duoc phieu', appr.status === 200 && appr.body?.status === 'BORROWED', `HTTP ${appr.status}`);
  check('approvedBy (email) duoc ghi', !!appr.body?.approvedBy, `${appr.body?.approvedBy}`);
  check('approvedById = khoa ngoai tro users.id', appr.body?.approvedById === adminUser.id, `${appr.body?.approvedById}`);

  const s2 = (await call('POST', '/borrowing-slips', admin, { memberId: member.id, items: [{ bookId: bk.body.id, quantity: 1 }] })).body;
  const rej = await call('PATCH', `/borrowing-slips/${s2.id}/reject`, admin, { reason: 'Thu tuc the chua hoan tat' });
  check('rejectedBy + rejectedById duoc ghi (truoc day KHONG luu ai tu choi)',
    rej.status === 200 && rej.body?.rejectedBy && rej.body?.rejectedById === adminUser.id,
    `by=${rej.body?.rejectedBy}, id=${rej.body?.rejectedById}`);

  const s3 = (await call('POST', '/borrowing-slips', admin, { memberId: member.id, items: [{ bookId: bk.body.id, quantity: 1 }] })).body;
  await call('PATCH', `/borrowing-slips/${s3.id}/approve`, admin);
  const can = await call('PATCH', `/borrowing-slips/${s3.id}/cancel`, admin, { reason: 'Doc gia tra lai ngay' });
  check('cancelledBy + cancelledById duoc ghi (truoc day KHONG luu ai huy)',
    can.status === 200 && can.body?.cancelledBy && can.body?.cancelledById === adminUser.id,
    `by=${can.body?.cancelledBy}, id=${can.body?.cancelledById}`);

  // ===== VIEC 5: ADMIN nang vai tro =====
  console.log('\n--- VIEC 5: ADMIN nang doc gia len thu thu ---');
  const target = await prisma.user.findUnique({ where: { email: atkEmail }, select: { id: true, memberId: true } });

  const up = await call('PATCH', `/users/${target.id}/role`, admin, { role: 'LIBRARIAN' });
  check('ADMIN nang MEMBER -> LIBRARIAN', up.status === 200 && up.body?.role === 'LIBRARIAN', `HTTP ${up.status}, role=${up.body?.role}`);
  check('Giu nguyen lien ket the doc gia (memberId)', up.body?.memberId === target.memberId, `memberId=${up.body?.memberId}`);
  check('Response khong chua mat khau', up.body && !('password' in up.body), '');

  // sau khi len thu thu thi duyet duoc phieu
  const libToken = await login(atkEmail, testPassword);
  const s4 = (await call('POST', '/borrowing-slips', admin, { memberId: member.id, items: [{ bookId: bk.body.id, quantity: 1 }] })).body;
  const libAppr = await call('PATCH', `/borrowing-slips/${s4.id}/approve`, libToken);
  check('Sau khi len LIBRARIAN thi duyet duoc phieu -> 200', libAppr.status === 200, `HTTP ${libAppr.status}`);

  const libDel = await call('DELETE', `/books/${bk.body.id}`, libToken);
  check('LIBRARIAN van KHONG xoa duoc sach (chi ADMIN) -> 403/409', [403, 409].includes(libDel.status), `HTTP ${libDel.status}`);

  // chot an toan
  const selfDemote = await call('PATCH', `/users/${adminUser.id}/role`, admin, { role: 'MEMBER' });
  check('ADMIN tu ha vai tro chinh minh -> 400', selfDemote.status === 400, `HTTP ${selfDemote.status}`);
  const lastAdmin = await prisma.user.count({ where: { role: 'ADMIN', isActive: true } });
  check(`He thong van con ${lastAdmin} ADMIN hoat dong`, lastAdmin >= 1, `${lastAdmin}`);

  const selfLock = await call('PATCH', `/users/${adminUser.id}/status`, admin, { isActive: false });
  check('ADMIN tu khoa chinh minh -> 400', selfLock.status === 400, `HTTP ${selfLock.status}`);

  const listUsers = await call('GET', '/users?role=LIBRARIAN', admin);
  check('ADMIN xem duoc danh sach tai khoan theo vai tro',
    listUsers.status === 200 && Array.isArray(listUsers.body?.data), `HTTP ${listUsers.status}, ${listUsers.body?.meta?.totalItems} tai khoan LIBRARIAN`);
} catch (e) {
  console.error('\nLOI:', e.message);
  process.exitCode = 1;
} finally {
  try {
    const us = await prisma.user.findMany({ where: { email: { in: EMAILS } }, select: { id: true } });
    if (us.length) {
      await prisma.passwordResetToken.deleteMany({ where: { userId: { in: us.map((u) => u.id) } } });
      await prisma.user.deleteMany({ where: { id: { in: us.map((u) => u.id) } } });
    }
    const ms = await prisma.member.findMany({ where: { email: { in: EMAILS } }, select: { id: true } });
    const ids = ms.map((m) => m.id);
    if (ids.length) {
      const sl = await prisma.borrowingSlip.findMany({ where: { memberId: { in: ids } }, select: { id: true } });
      await prisma.loanRenewal.deleteMany({ where: { slipId: { in: sl.map((s) => s.id) } } });
      await prisma.borrowingSlipItem.deleteMany({ where: { slipId: { in: sl.map((s) => s.id) } } });
      await prisma.borrowingSlip.deleteMany({ where: { memberId: { in: ids } } });
      await prisma.borrowing.deleteMany({ where: { memberId: { in: ids } } });
      await prisma.member.deleteMany({ where: { id: { in: ids } } });
    }
    if (ISBNS.length) await prisma.book.deleteMany({ where: { isbn: { in: ISBNS } } });
    await prisma.member.deleteMany({ where: { email: { contains: `@t.test` } } });
    console.log('\nDa don du lieu test.');
  } catch (e) { console.error('Don du lieu chua xong:', e.message); }
  const pass = results.filter((r) => r.pass).length;
  console.log(`==== ${pass}/${results.length} kiem tra PASS ====`);
  if (pass !== results.length) {
    results.filter((r) => !r.pass).forEach((r) => console.log('  THAT BAI:', r.name));
    process.exitCode = 1;
  }
  await prisma.$disconnect();
}
