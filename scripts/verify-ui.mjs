// Kiểm chứng trang quản trị tài khoản: tài nguyên tĩnh + luồng API mà UI gọi.
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

const BASE = 'http://localhost:3999';
const prisma = new PrismaClient();
const env = Object.fromEntries(readFileSync('.env', 'utf8').split('\n')
  .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));

const out = [];
const check = (n, ok, d) => { out.push({ n, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? `  (${d})` : ''}`); };

try {
  // --- 1. Tai nguyen tinh ---
  console.log('--- Tai nguyen tinh ---');
  const html = await (await fetch(`${BASE}/admin`)).text();
  check('index.html co nav item "Tài Khoản & Phân Quyền"', html.includes('Tài Khoản &amp; Phân Quyền'));
  check('nav item gan data-require-role="ADMIN"', /data-tab="tab-users" data-require-role="ADMIN"/.test(html));
  check('co tab pane #tab-users', html.includes('id="tab-users"'));
  check('co bang #users-tbody', html.includes('id="users-tbody"'));
  check('co filter vai tro #users-filter-role', html.includes('id="users-filter-role"'));
  check('co o tim kiem #users-search', html.includes('id="users-search"'));
  check('da nhung <script src="/js/users.js">', html.includes('/js/users.js'));
  check('3 nut ghi tinh gan quyen ADMIN,LIBRARIAN',
    (html.match(/data-require-role="ADMIN,LIBRARIAN"/g) || []).length === 3,
    `${(html.match(/data-require-role="ADMIN,LIBRARIAN"/g) || []).length} nut`);

  const js = await (await fetch(`${BASE}/js/users.js`)).text();
  check('/js/users.js phuc vu duoc', js.includes('window.users = users'));
  check('users.js goi dung endpoint doi vai tro', js.includes('/role'));
  check('users.js goi dung endpoint khoa/mo', js.includes('/status'));

  const authJs = await (await fetch(`${BASE}/js/auth.js`)).text();
  check('auth.js hien thi dung ca 3 vai tro',
    authJs.includes("LIBRARIAN: 'Thủ Thư'") && authJs.includes("MEMBER: 'Độc Giả'"));
  check('auth.js co applyRoleVisibility', authJs.includes('applyRoleVisibility'));

  const appJs = await (await fetch(`${BASE}/js/app.js`)).text();
  check('app.js khoi tao users module', appJs.includes('users.init()'));
  check('app.js lazy-load khi mo tab-users', appJs.includes("'tab-users'") && appJs.includes('users.loadUsers()'));

  // --- 2. Luong API ma UI goi ---
  console.log('\n--- Luong API ma UI goi ---');
  const lg = await fetch(`${BASE}/api/auth/login`, { method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: env.ADMIN_USERNAME, password: env.ADMIN_PASSWORD }) });
  const token = (await lg.json()).accessToken;
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  const list = await fetch(`${BASE}/api/users?limit=100`, { headers: H });
  const lb = await list.json();
  check('GET /api/users?limit=100 (UI dung de render bang)',
    list.status === 200 && Array.isArray(lb.data), `HTTP ${list.status}, ${lb.meta?.totalItems} tai khoan`);
  check('Response khong chua mat khau',
    lb.data.every((u) => !('password' in u)));

  const filt = await fetch(`${BASE}/api/users?role=MEMBER&limit=100`, { headers: H });
  const fb = await filt.json();
  check('Filter theo vai tro hoat dong',
    filt.status === 200 && fb.data.every((u) => u.role === 'MEMBER'), `${fb.data.length} MEMBER`);

  const srch = await fetch(`${BASE}/api/users?search=admin&limit=10`, { headers: H });
  check('Tim kiem hoat dong', srch.status === 200, `HTTP ${srch.status}`);

  // --- 3. Doi vai tro that roi hoan nguyen ---
  console.log('\n--- Doi vai tro that (roi hoan nguyen) ---');
  const target = fb.data.find((u) => u.email === 'an.nguyen@example.com');
  if (!target) throw new Error('khong tim thay tai khoan mau an.nguyen@example.com');

  const up = await fetch(`${BASE}/api/users/${target.id}/role`, { method: 'PATCH', headers: H,
    body: JSON.stringify({ role: 'LIBRARIAN' }) });
  const ub = await up.json();
  check('PATCH /role nang MEMBER -> LIBRARIAN', up.status === 200 && ub.role === 'LIBRARIAN', `role=${ub.role}`);
  check('Giu nguyen lien ket the doc gia', ub.memberId === target.memberId, `memberId=${ub.memberId}`);

  const back = await fetch(`${BASE}/api/users/${target.id}/role`, { method: 'PATCH', headers: H,
    body: JSON.stringify({ role: 'MEMBER' }) });
  check('Hoan nguyen ve MEMBER', back.status === 200 && (await back.json()).role === 'MEMBER');

  // --- 4. Chot an toan ma UI dua vao ---
  console.log('\n--- Chot an toan ---');
  const me = lb.data.find((u) => u.email === 'admin@librobe.com');
  const self = await fetch(`${BASE}/api/users/${me.id}/role`, { method: 'PATCH', headers: H,
    body: JSON.stringify({ role: 'MEMBER' }) });
  check('Tu ha vai tro chinh minh -> 400 (UI cung da disable select)', self.status === 400, `HTTP ${self.status}`);

  const same = await fetch(`${BASE}/api/users/${me.id}/role`, { method: 'PATCH', headers: H,
    body: JSON.stringify({ role: 'ADMIN' }) });
  check('Doi sang vai tro dang co -> 400', same.status === 400, `HTTP ${same.status}`);

  const adminCount = await prisma.user.count({ where: { role: 'ADMIN', isActive: true } });
  check(`Van con ${adminCount} ADMIN hoat dong`, adminCount >= 1);
} catch (e) {
  console.error('\nLOI:', e.message);
  process.exitCode = 1;
} finally {
  const g = await prisma.user.groupBy({ by: ['role'], _count: { role: true } });
  console.log('\nVai tro trong DB:', g.map((x) => `${x.role}=${x._count.role}`).join(', '));
  const pass = out.filter((r) => r.ok).length;
  console.log(`==== ${pass}/${out.length} kiem tra PASS ====`);
  if (pass !== out.length) { out.filter((r) => !r.ok).forEach((r) => console.log('  THAT BAI:', r.n)); process.exitCode = 1; }
  await prisma.$disconnect();
}
