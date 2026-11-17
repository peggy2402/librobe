import { PrismaClient } from '@prisma/client';
import { UserRole } from '../../src/common/enums/user-role.enum.js';
import { TestContext } from '../helpers/test-app.js';

export interface TestActor {
  label: string;
  email: string;
  password: string;
  token: string;
  userId: string;
  /** Thẻ độc giả liên kết với tài khoản (thủ thư không có). */
  memberId: string;
}

export interface TestBook {
  id: string;
  title: string;
  isbn: string;
  copiesTotal: number;
}

export interface LibraryFixture {
  A: TestActor;
  B: TestActor;
  C: TestActor;
  D: TestActor;
  librarian: TestActor;
  books: Record<BookKey, TestBook>;
}

export type BookKey =
  | 'nhaGiaKim'
  | 'matBiec'
  | 'cleanArchitecture'
  | 'sapiens'
  | 'dacNhanTam'
  | 'cleanCode';

const PASSWORD = 'MatKhauTest@123';

/**
 * Mỗi đầu sách chỉ có 1 bản sao. Đây là điều kiện để kịch bản hàng đợi đặt
 * trước xác định được: khi B đang giữ bản duy nhất thì tồn kho = 0 nên A và C
 * đều vào PENDING; lúc B trả thì chỉ đúng 1 phiếu được chuyển READY.
 */
const BOOK_SPECS: Array<{ key: BookKey; title: string; isbn: string; copies: number }> = [
  { key: 'nhaGiaKim', title: 'Nhà Giả Kim', isbn: '9786041000001', copies: 1 },
  { key: 'matBiec', title: 'Mắt Biếc', isbn: '9786041000002', copies: 1 },
  { key: 'cleanArchitecture', title: 'Clean Architecture', isbn: '9786041000003', copies: 1 },
  { key: 'sapiens', title: 'Sapiens', isbn: '9786041000004', copies: 1 },
  { key: 'dacNhanTam', title: 'Đắc Nhân Tâm', isbn: '9786041000005', copies: 1 },
  { key: 'cleanCode', title: 'Clean Code', isbn: '9786041000006', copies: 1 },
];

async function registerActor(
  ctx: TestContext,
  label: string,
  phoneSuffix: string,
): Promise<TestActor> {
  const email = `e2e.${label.toLowerCase()}@librobe.test`;

  const res = await ctx.anon().post('/api/auth/register', {
    email,
    phone: `090000${phoneSuffix}`,
    password: PASSWORD,
    fullName: `Nguoi Dung ${label}`,
  });

  if (res.status !== 201) {
    throw new Error(`Không tạo được tài khoản ${label}: ${JSON.stringify(res.body)}`);
  }

  return {
    label,
    email,
    password: PASSWORD,
    token: res.body.accessToken,
    userId: res.body.user.id,
    memberId: res.body.user.memberId,
  };
}

async function login(ctx: TestContext, email: string): Promise<string> {
  const res = await ctx.anon().post('/api/auth/login', { identifier: email, password: PASSWORD });
  if (res.status !== 200) {
    throw new Error(`Không đăng nhập được ${email}: ${JSON.stringify(res.body)}`);
  }
  return res.body.accessToken;
}

export async function seedLibrary(ctx: TestContext): Promise<LibraryFixture> {
  const prisma: PrismaClient = ctx.prisma;

  // --- Tác giả & thể loại dùng chung ---
  const author = await prisma.author.create({
    data: { name: 'Tác Giả Kiểm Thử', nationality: 'Việt Nam' },
  });
  const category = await prisma.category.create({
    data: { name: 'Thể Loại Kiểm Thử', description: 'Phục vụ E2E' },
  });

  // --- Sáu đầu sách ---
  const books = {} as Record<BookKey, TestBook>;
  for (const spec of BOOK_SPECS) {
    const created = await prisma.book.create({
      data: {
        isbn: spec.isbn,
        title: spec.title,
        authorId: author.id,
        categoryId: category.id,
        publisher: 'NXB Kiểm Thử',
        publishYear: 2024,
        copiesTotal: spec.copies,
        copiesAvailable: spec.copies,
        price: 150000,
        shelfLocation: 'E2E-01',
        description: `Sách ${spec.title} phục vụ kiểm thử E2E`,
      },
    });
    books[spec.key] = {
      id: created.id,
      title: created.title,
      isbn: created.isbn,
      copiesTotal: created.copiesTotal,
    };
  }

  // --- Bốn người mượn sách (đăng ký công khai luôn ra vai trò MEMBER) ---
  const A = await registerActor(ctx, 'A', '0001');
  const B = await registerActor(ctx, 'B', '0002');
  const C = await registerActor(ctx, 'C', '0003');
  const D = await registerActor(ctx, 'D', '0004');

  // --- Thủ thư ---
  // `/auth/register` luôn tạo MEMBER (chặn leo thang đặc quyền), nên vai trò
  // LIBRARIAN được nâng trực tiếp trong DB test, rồi đăng nhập lại để token
  // mang vai trò mới.
  const librarian = await registerActor(ctx, 'Librarian', '0009');
  await prisma.user.update({
    where: { id: librarian.userId },
    data: { role: UserRole.LIBRARIAN },
  });
  librarian.token = await login(ctx, librarian.email);

  return { A, B, C, D, librarian, books };
}
