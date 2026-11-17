/**
 * Mô phỏng trình duyệt tải lại trang khi ĐÃ đăng nhập, kiểm tra các nút bấm
 * có bị ẩn sai do không đọc được vai trò hay không.
 *
 * Bối cảnh: `GET /auth/me` trả profile phẳng, còn `POST /auth/login` bọc trong
 * `{ user }`. Code cũ luôn đọc `res.user` nên sau mỗi lần F5, currentUser bị
 * xóa, vai trò thành "không xác định" và `applyRoleVisibility` ẩn toàn bộ nút
 * có `data-require-role` — cột THAO TÁC trống trơn.
 *
 * Chạy: node scripts/verify-role-visibility.mjs
 */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const FILES = [
  'public/js/api.js',
  'public/js/ui.js',
  'public/js/stats.js',
  'public/js/books.js',
  'public/js/borrowings.js',
  'public/js/members.js',
  'public/js/users.js',
  'public/js/auth.js',
];

function fakeEl(attrs = {}) {
  const t = {
    style: {},
    classList: { add() {}, remove() {}, contains: () => false },
    _attrs: attrs,
    textContent: '',
    innerHTML: '',
    value: '',
    addEventListener() {},
    getAttribute: (k) => attrs[k] ?? null,
    setAttribute(k, v) {
      attrs[k] = v;
    },
    querySelector: () => fakeEl(),
    querySelectorAll: () => [],
    closest: () => null,
    appendChild() {},
    remove() {},
    click() {},
    focus() {},
    reset() {},
  };
  return new Proxy(t, {
    get(o, k) {
      if (k in o) return o[k];
      if (typeof k === 'string' && k.startsWith('on')) return null;
      return () => undefined;
    },
    set(o, k, v) {
      o[k] = v;
      return true;
    },
  });
}

/**
 * @param {object} opts
 * @param {'flat'|'wrapped'} opts.meShape dạng response của /auth/me
 * @param {string} opts.role vai trò trả về
 */
async function run({ meShape, role }) {
  // Các phần tử giao diện có khai báo quyền
  const guarded = [
    fakeEl({ 'data-require-role': 'ADMIN,LIBRARIAN' }), // nút Duyệt phiếu
    fakeEl({ 'data-require-role': 'ADMIN,LIBRARIAN' }), // nút Trả sách
    fakeEl({ 'data-require-role': 'ADMIN' }), // nút Xóa
    fakeEl({ 'data-require-role': 'ADMIN' }), // nav Tài khoản & Phân quyền
  ];

  const store = new Map([['librobe_token', 'token-hop-le']]);
  const profile = {
    id: 'user-01',
    email: 'admin@librobe.com',
    fullName: 'Quản Trị Viên',
    role,
    memberId: null,
    isActive: true,
  };

  const sandbox = {
    console: { log() {}, error() {}, warn() {} },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
    document: {
      getElementById: () => fakeEl(),
      querySelector: () => fakeEl(),
      querySelectorAll: (sel) => (sel === '[data-require-role]' ? guarded : []),
      createElement: () => fakeEl(),
      body: fakeEl(),
      addEventListener() {},
      removeEventListener() {},
    },
    fetch: async (url) => {
      const u = String(url);
      if (u.includes('/auth/me')) {
        return {
          status: 200,
          ok: true,
          json: async () => (meShape === 'flat' ? profile : { user: profile }),
        };
      }
      // Phải trả về danh sách KHÔNG rỗng, nếu không `loadBorrowings` return sớm
      // ở nhánh "chưa có phiếu nào" và không chạm tới bước ẩn/hiện theo quyền —
      // phép thử sẽ không tái hiện được triệu chứng thật.
      if (u.includes('/borrowing-slips')) {
        return {
          status: 200,
          ok: true,
          json: async () => ({
            data: [
              {
                id: 'slip-1',
                slipNumber: 'SLIP-2026-0001',
                memberName: 'Nguyễn Văn An',
                memberCardNumber: 'LIB-2026-0001',
                status: 'BORROWED',
                dueDate: new Date(Date.now() + 86400000).toISOString(),
                totalFine: 0,
                finePaid: false,
                renewCount: 0,
                items: [
                  {
                    id: 'item-1',
                    bookId: 'book-1',
                    bookTitle: 'Nhà Giả Kim',
                    quantity: 1,
                    returnedQuantity: 0,
                    lostQuantity: 0,
                    status: 'BORROWING',
                  },
                ],
              },
            ],
            meta: { totalItems: 1 },
          }),
        };
      }

      return {
        status: 200,
        ok: true,
        json: async () => ({ data: [], meta: { totalItems: 0 } }),
      };
    },
    setTimeout,
    clearTimeout,
    URLSearchParams,
    Promise, Array, Object, JSON, String, Number, Boolean, Date, Math, Error,
    isNaN, parseInt, parseFloat,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.location = { search: '', href: 'http://localhost/admin', reload() {} };

  const ctx = vm.createContext(sandbox);
  for (const f of FILES) {
    new vm.Script(readFileSync(f, 'utf8'), { filename: f }).runInContext(ctx);
  }

  // Mô phỏng tải lại trang khi đã có token
  await sandbox.auth.checkSession();
  await new Promise((r) => setTimeout(r, 50));

  // Mô phỏng người dùng bấm vào tab "Mượn & Trả Sách".
  // Bước này mới là nơi nút bấm được render rồi áp quyền ẩn/hiện —
  // `loadInitialData()` không nạp danh sách phiếu mượn.
  await sandbox.borrowings.loadBorrowings();
  await new Promise((r) => setTimeout(r, 50));

  const savedUser = store.get('librobe_user');
  return {
    savedRole: savedUser ? JSON.parse(savedUser).role : null,
    hidden: guarded.filter((e) => e.style.display === 'none').length,
    total: guarded.length,
  };
}

const results = [];
const check = (n, ok, d) => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? `  (${d})` : ''}`);
};

console.log('--- ADMIN tải lại trang, /auth/me trả profile PHẲNG (dạng thật) ---');
const admin = await run({ meShape: 'flat', role: 'ADMIN' });
check('Lưu đúng vai trò vào localStorage', admin.savedRole === 'ADMIN', `savedRole=${admin.savedRole}`);
check('KHÔNG nút nào bị ẩn sai', admin.hidden === 0, `${admin.hidden}/${admin.total} bị ẩn`);

console.log('\n--- Vẫn hoạt động nếu /auth/me bọc trong { user } ---');
const wrapped = await run({ meShape: 'wrapped', role: 'ADMIN' });
check('Lưu đúng vai trò', wrapped.savedRole === 'ADMIN', `savedRole=${wrapped.savedRole}`);
check('KHÔNG nút nào bị ẩn sai', wrapped.hidden === 0, `${wrapped.hidden}/${wrapped.total} bị ẩn`);

console.log('\n--- LIBRARIAN: ẩn đúng 2 nút chỉ dành cho ADMIN ---');
const lib = await run({ meShape: 'flat', role: 'LIBRARIAN' });
check('Lưu đúng vai trò', lib.savedRole === 'LIBRARIAN', `savedRole=${lib.savedRole}`);
check('Ẩn đúng 2 phần tử yêu cầu ADMIN', lib.hidden === 2, `${lib.hidden}/${lib.total} bị ẩn`);

console.log('\n--- MEMBER: ẩn toàn bộ nút quản trị ---');
const member = await run({ meShape: 'flat', role: 'MEMBER' });
check('Ẩn hết 4 phần tử quản trị', member.hidden === 4, `${member.hidden}/${member.total} bị ẩn`);

const pass = results.filter(Boolean).length;
console.log(`\n==== ${pass}/${results.length} kiểm tra PASS ====`);
if (pass !== results.length) process.exitCode = 1;
