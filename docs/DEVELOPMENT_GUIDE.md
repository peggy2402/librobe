# HƯỚNG DẪN CÀI ĐẶT PHÁT TRIỂN DÀNH CHO DEVELOPER (DEVELOPMENT GUIDE)

Tài liệu này dành cho các lập trình viên mới tham gia dự án **Librobe** để thiết lập môi trường phát triển cục bộ (Local Development) nhanh chóng và chính xác.

---

## 1. Yêu Cầu Môi Trường (Prerequisites)

* **Node.js**: Phiên bản Node.js LTS hoặc mới nhất (khuyến nghị **v22+** hoặc **v24+**).
* **NPM**: Phiên bản **10+**.
* **Git**: Đã cài đặt trên máy.
* **Tài khoản Supabase**: Để truy cập cơ sở dữ liệu PostgreSQL hoặc sử dụng instance Postgres có sẵn.

---

## 2. Quy Trình Cài Đặt Từ Đầu (Step-by-Step Setup)

### Bước 1: Clone Repository
```bash
git clone https://github.com/peggy2402/librobe.git
cd librobe
```

### Bước 2: Cài Đặt Dependencies
```bash
npm install
```

### Bước 3: Cấu Hình Biến Môi Trường (`.env`)
Tạo file `.env` từ file mẫu `.env.example`:
```bash
cp .env.example .env
```
Mở file `.env` và điền các thông tin kết nối Supabase của bạn:
```env
PORT=3000
JWT_SECRET=XL1mLjt0v2cU9ijTblVy2L7KmbmUxxVcJ7fdk5U268v

# Lưu ý: Mật khẩu có ký tự $ phải đổi thành %24 trong URL
DATABASE_URL="postgresql://postgres.[REF]:[PASS]@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.[REF]:[PASS]@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres"

ADMIN_USERNAME=chien
ADMIN_PASSWORD=Chienhpt102$$
```

### Bước 4: Đồng Bộ Cơ Sở Dữ Liệu & Nạp Dữ Liệu Mẫu
1. Sinh mã nguồn Prisma Client:
   ```bash
   npm run prisma:generate
   ```
2. Đẩy cấu trúc bảng lên cơ sở dữ liệu Supabase:
   ```bash
   npm run prisma:push
   ```
3. Nạp dữ liệu mẫu ban đầu (sách mẫu, danh mục, độc giả, tài khoản admin):
   ```bash
   npm run prisma:seed
   ```

### Bước 5: Khởi Động Server Phát Triển
```bash
npm run start:dev
```
Hệ thống sẽ khởi chạy tại cổng 3000:
* 🖥️ **Trang Quản Trị**: [http://localhost:3000/admin](http://localhost:3000/admin) *(hoặc [http://localhost:3000/](http://localhost:3000/))*
* 📚 **Tài liệu Swagger API**: [http://localhost:3000/api/docs](http://localhost:3000/api/docs)
* 🩺 **Health Check**: [http://localhost:3000/api/health](http://localhost:3000/api/health)

---

## 3. Các Lệnh Thường Dùng (Useful Commands)

| Lệnh | Mục đích |
| :--- | :--- |
| `npm run start:dev` | Chạy backend chế độ theo dõi thay đổi (Hot-Reload) |
| `npm run build` | Tự động sinh Prisma Client và biên dịch dự án ra thư mục `dist/` |
| `npm run start:prod` | Chạy production bundle đã biên dịch (`node dist/main.js`) |
| `npm run lint` | Chạy công cụ phân tích tĩnh `oxlint` kiểm tra lỗi cú pháp |
| `npx tsc --noEmit` | Kiểm tra tính đúng đắn của kiểu dữ liệu TypeScript (Zero errors) |
| `npm run prisma:studio` | Mở giao diện Web Prisma Studio xem và sửa trực tiếp dữ liệu |
| `npm run prisma:seed` | Nạp lại dữ liệu mẫu vào database |

---

## 4. Tài Khoản Đăng Nhập Mặc Định

| Vai trò | Tài khoản (Username / Email) | Mật khẩu | Nguồn |
| :--- | :--- | :--- | :--- |
| **Master Admin** | `chien` | `Chienhpt102$$` | Cấu hình trong `.env` (`ADMIN_USERNAME` / `ADMIN_PASSWORD`) |
| **Admin Mẫu** | `admin@librobe.com` | `Admin@123` | Nạp từ seed data |
| **Thủ Thư** | `librarian@librobe.com` | `Librarian@123` | Nạp từ seed data |
| **Độc Giả** | `an.nguyen@example.com` | `Member@123` | Nạp từ seed data |
