# THIẾT KẾ CƠ SỞ DỮ LIỆU (DATABASE SCHEMA & ERD)

Dự án sử dụng hệ quản trị cơ sở dữ liệu quan hệ **PostgreSQL** lưu trữ trên nền tảng đám mây **Supabase Cloud**, được mô hình hóa và đồng bộ thông qua **Prisma ORM v6**.

---

## 1. Cơ Chế Kết Nối Supabase Connection Pooler

Để tối ưu hóa số lượng kết nối đồng thời và tránh cạn kiệt tài nguyên Postgres khi chạy trên môi trường Serverless / Cloud, hệ thống sử dụng 2 chuỗi kết nối:

* **`DATABASE_URL` (Cổng 6543 - PgBouncer Transaction Mode)**:
  * Được ứng dụng NestJS sử dụng cho toàn bộ các truy vấn CRUD thường ngày.
  * Tái sử dụng kết nối ngay sau khi mỗi transaction kết thúc.
  * Bắt buộc có tham số `?pgbouncer=true`.
* **`DIRECT_URL` (Cổng 5432 - Session Mode)**:
  * Kết nối trực tiếp vào Postgres instance.
  * Chỉ được sử dụng khi chạy Prisma CLI (`prisma db push`, `prisma migrate`, `prisma studio`).

> **Lưu ý đặc biệt**: Nếu mật khẩu Supabase chứa ký tự đặc biệt như `$`, bắt buộc phải URL-encode thành `%24` trong chuỗi URI để tránh lỗi parse cú pháp.

---

## 2. Sơ Đồ Thực Thể Mối Quan Hệ (Entity Relationship)

```
┌──────────────┐         1:N          ┌──────────────┐
│  categories  │─────────────────────<│    books     │
└──────────────┘                      └──────┬───────┘
                                             │
┌──────────────┐         1:N                 │ 1:N
│   authors    │─────────────────────<───────┤
└──────────────┘                             │
                                             │
                                      ┌──────┴───────┐
                                      │  borrowings  │
                                      └──────┬───────┘
┌──────────────┐         1:N                 │ N:1
│   members    │─────────────────────────────┘
└──────┬───────┘
       │ 1:1 (optional)
┌──────┴───────┐
│    users     │
└──────────────┘
```

---

## 3. Chi Tiết Các Bảng Dữ Liệu

### A. Bảng `books` (Kho Sách Thư Viện)
* `id` (`String`, Primary Key, CUID / UUID): Mã định danh duy nhất.
* `isbn` (`String`, Unique): Mã số chuẩn quốc tế ISBN-10 / ISBN-13.
* `title` (`String`): Tựa đề sách.
* `authorId` (`String`, Foreign Key -> `authors.id`): Tác giả.
* `categoryId` (`String`, Foreign Key -> `categories.id`): Thể loại.
* `publisher` (`String`): Nhà xuất bản.
* `publishYear` (`Int`): Năm xuất bản.
* `copiesTotal` (`Int`): Tổng số bản in nhập kho.
* `copiesAvailable` (`Int`): Số lượng bản in hiện đang có sẵn trên kệ.
* `shelfLocation` (`String`): Vị trí giá kệ (ví dụ: Kệ A1-03).
* `status` (`Enum: AVAILABLE | BORROWED | OUT_OF_STOCK`): Trạng thái tồn kho.
* `createdAt`, `updatedAt` (`DateTime`).

### B. Bảng `borrowings` (Giao Dịch Mượn / Trả Sách)
* `id` (`String`, Primary Key): Mã phiếu mượn.
* `transactionCode` (`String`, Unique): Mã phiếu chuẩn (ví dụ: `BRW-20261016-0001`).
* `memberId` (`String`, Foreign Key -> `members.id`): Độc giả mượn sách.
* `bookId` (`String`, Foreign Key -> `books.id`): Sách được mượn.
* `borrowDate` (`DateTime`): Ngày mượn thực tế.
* `dueDate` (`DateTime`): Hạn chót hoàn trả (mặc định +14 ngày).
* `returnDate` (`DateTime`, Nullable): Ngày độc giả trả sách về kho.
* `status` (`Enum: BORROWED | RETURNED | OVERDUE`): Trạng thái phiếu mượn.
* `renewCount` (`Int`, default 0): Số lần đã gia hạn (tối đa 2 lần).
* `fineAmount` (`Float`, default 0): Tiền phạt quá hạn (5.000 VNĐ / ngày trễ).
* `finePaid` (`Boolean`, default false): Đã thu tiền phạt hay chưa.

### C. Bảng `members` (Độc Giả & Thẻ Thư Viện)
* `id` (`String`, Primary Key): Mã định danh độc giả.
* `cardNumber` (`String`, Unique): Số thẻ thư viện tự sinh (ví dụ: `LIB-2026-0001`).
* `fullName`, `email`, `phone`, `address` (`String`): Thông tin liên hệ.
* `membershipExpiry` (`DateTime`): Ngày hết hạn thẻ (mặc định +1 năm).
* `status` (`Enum: ACTIVE | EXPIRED | SUSPENDED`): Trạng thái thẻ.
* `maxBorrowLimit` (`Int`, default 5): Hạn mức số sách được mượn cùng lúc.
* `currentBorrowedCount` (`Int`, default 0): Số lượng sách hiện đang giữ.

### D. Bảng `users` (Tài Khoản Đăng Nhập Hệ Thống)
* `id` (`String`, Primary Key).
* `email` (`String`, Unique).
* `phone` (`String`, Unique, Nullable).
* `password` (`String`): Mật khẩu đã băm bằng `bcryptjs`.
* `fullName` (`String`).
* `role` (`Enum: ADMIN | LIBRARIAN | MEMBER`): Phân quyền người dùng.
* `isActive` (`Boolean`, default true).
* `memberId` (`String`, Unique, Nullable): Liên kết sang hồ sơ độc giả nếu vai trò là `MEMBER`.

### E. Bảng `categories` & `authors`
* Lưu danh mục thể loại (Công nghệ thông tin, Kinh tế, Văn học...) và tiểu sử tác giả.
