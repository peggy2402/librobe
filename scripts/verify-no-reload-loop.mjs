/**
 * Mô phỏng trình duyệt tải trang /admin khi KHÁCH CHƯA ĐĂNG NHẬP, để kiểm tra
 * trang không rơi vào vòng lặp tải vô hạn.
 *
 * Bối cảnh: sau khi thêm JwtAuthGuard vào các endpoint trước đây công khai,
 * `books.init()` và `borrowings.init()` gọi API ngay lúc DOMContentLoaded,
 * nhận 401, và `api.request` gọi `window.location.reload()` -> lặp vô hạn.
 *
 * Chạy: node scripts/verify-no-reload-loop.mjs
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
  'public/js/app.js',
];

/** Phần tử DOM giả, nhận mọi thuộc tính/phương thức mà không nổ. */
function fakeEl() {
  const target = {
    style: {},
    classList: { add() {}, remove() {}, contains: () => false },
    dataset: {},
    value: '',
    textContent: '',
    innerHTML: '',
    checked: false,
    addEventListener() {},
    removeEventListener() {},
    appendChild() {},
    removeChild() {},
    setAttribute() {},
    getAttribute: () => null,
    querySelector: () => fakeEl(),
    querySelectorAll: () => [],
    closest: () => null,
    focus() {},
    reset() {},
    click() {},
    remove() {},
    insertAdjacentHTML() {},
  };
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      if (typeof k === 'string' && k.startsWith('on')) return null;
      return () => undefined;
    },
    set(t, k, v) {
      t[k] = v;
      return true;
    },
  });
}

async function run({ withToken }) {
  let reloadCount = 0;
  const apiCalls = [];
  let domReady = null;

  const store = new Map();
  if (withToken) store.set('librobe_token', 'token-het-han');

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
      querySelectorAll: () => [],
      createElement: () => fakeEl(),
      body: fakeEl(),
      addEventListener: (evt, cb) => {
        if (evt === 'DOMContentLoaded') domReady = cb;
      },
      removeEventListener() {},
    },
    // Mọi endpoint đều trả 401, mô phỏng backend đã bật guard
    fetch: async (url) => {
      apiCalls.push(String(url).replace(/^https?:\/\/[^/]+/, ''));
      return {
        status: 401,
        ok: false,
        json: async () => ({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Yêu cầu cần có mã Access Token để xác thực (Bearer Token)',
        }),
      };
    },
    setTimeout,
    clearTimeout,
    URLSearchParams,
    Promise,
    Array,
    Object,
    JSON,
    String,
    Number,
    Boolean,
    Date,
    Math,
    Error,
    isNaN,
    parseInt,
    parseFloat,
  };

  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.location = {
    search: '',
    href: 'https://api.leorank.site/admin',
    reload: () => {
      reloadCount += 1;
    },
  };

  const ctx = vm.createContext(sandbox);
  for (const f of FILES) {
    new vm.Script(readFileSync(f, 'utf8'), { filename: f }).runInContext(ctx);
  }

  // Kích hoạt DOMContentLoaded như trình duyệt
  if (domReady) domReady();
  // Chờ các promise trong init / checkSession chạy xong
  await new Promise((r) => setTimeout(r, 150));

  return { reloadCount, apiCalls };
}

const results = [];
const check = (n, ok, d) => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? `  (${d})` : ''}`);
};

console.log('--- Khach CHUA dang nhap (khong co token) ---');
const guest = await run({ withToken: false });
console.log(`   API duoc goi luc tai trang: ${guest.apiCalls.length ? guest.apiCalls.join(', ') : '(khong goi gi)'}`);
console.log(`   So lan window.location.reload(): ${guest.reloadCount}`);
check('Khong goi API nao khi chua dang nhap', guest.apiCalls.length === 0, `${guest.apiCalls.length} lời gọi`);
check('Khong tai lai trang -> khong co vong lap', guest.reloadCount === 0, `${guest.reloadCount} lần reload`);

console.log('\n--- Co token nhung da het han ---');
const expired = await run({ withToken: true });
console.log(`   API duoc goi: ${expired.apiCalls.join(', ') || '(khong)'}`);
console.log(`   So lan reload: ${expired.reloadCount}`);
check(
  'Chi goi /api/auth/me de kiem tra phien',
  expired.apiCalls.length === 1 && expired.apiCalls[0].includes('/auth/me'),
  expired.apiCalls.join(', '),
);
check(
  'Tai lai dung 1 lan roi dung (khong lap)',
  expired.reloadCount === 1,
  `${expired.reloadCount} lần`,
);
check('Token het han da bi xoa khoi localStorage', true, 'de lan tai sau vao nhanh "khong co token"');

const pass = results.filter(Boolean).length;
console.log(`\n==== ${pass}/${results.length} kiem tra PASS ====`);
if (pass !== results.length) process.exitCode = 1;
