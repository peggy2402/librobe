# 📚 Librobe - Hệ Thống Quản Lý Thư Viện Backend (Library Management System API)

Dự án Backend chuyên nghiệp cho hệ thống **Quản lý Thư viện Số**, được xây dựng trên nền tảng **NestJS** kết hợp chuẩn tài liệu trực quan hóa **Swagger / OpenAPI UI**, hỗ trợ đầy đủ quy trình quản lý sách, độc giả, mượn/trả và thống kê báo cáo thời gian thực.

---

## 🎯 Điểm Nổi Bật Của Hệ Thống

1. **Kiến Trúc Module Hóa (Clean Architecture & SOLID)**:
   - Tách biệt rõ rệt giữa Presentation Layer (Controllers), Domain/Business Layer (Services, Entities, Enums) và Data Access Layer (Database Service).
   - Mô hình lưu trữ thread-safe In-Memory kết hợp Seed Data phong phú, dễ dàng chuyển đổi sang PostgreSQL, MySQL (TypeORM/Prisma) hoặc MongoDB khi cần.
2. **Swagger / OpenAPI Documentation Toàn Diện**:
   - Tích hợp tài liệu trực quan hóa API tại `http://localhost:3000/api/docs`.
   - Đầy đủ HTTP Methods (`GET`, `POST`, `PATCH`, `DELETE`), DTO Schemas, mã lỗi chuẩn RESTful (`200`, `201`, `400`, `404`, `409`).
   - Tự động chuyển hướng từ trang chủ `http://localhost:3000/` đến ngay trang tài liệu Swagger UI.
3. **Data Validation & Error Handling Chặt Chẽ**:
   - Sử dụng `class-validator` và `class-transformer` với `ValidationPipe` toàn cục tự động lọc bỏ trường rác (`whitelist: true`) và chuyển đổi kiểu dữ liệu.
   - Bộ lọc ngoại lệ `AllExceptionsFilter` đồng nhất hóa định dạng phản hồi lỗi trên toàn bộ hệ thống.
4. **Nghiệp Vụ Mượn - Trả Sách Cốt Lõi**:
   - Kiểm tra điều kiện độc giả: Trạng thái thẻ `ACTIVE`, hạn sử dụng thẻ, không nợ sách quá hạn, không vượt trần hạn mức (`maxBorrowLimit`).
   - Tự động trừ và bù kho sách `copiesAvailable` ngay khi phát sinh giao dịch.
   - Tự động quét và phát hiện sách trễ hạn, tính tiền phạt theo ngày (5.000 VNĐ / ngày trễ hạn).
   - Hỗ trợ thủ tục gia hạn mượn sách có kiểm soát (tối đa 2 lần, mỗi lần thêm 7-14 ngày).

---

## 🏗️ Cấu Trúc Thư Mục Dự Án

```
librobe/
├── src/
│   ├── common/                               # Thành phần dùng chung toàn hệ thống
│   │   ├── dto/
│   │   │   ├── api-response.dto.ts           # Schema chuẩn cho response thông báo & lỗi
│   │   │   └── pagination.dto.ts             # DTO phân trang & tìm kiếm đa năng
│   │   ├── enums/
│   │   │   ├── book-status.enum.ts           # AVAILABLE, OUT_OF_STOCK, DISCONTINUED...
│   │   │   ├── member-status.enum.ts         # ACTIVE, SUSPENDED, EXPIRED
│   │   │   └── borrowing-status.enum.ts      # BORROWED, RETURNED, OVERDUE
│   │   └── filters/
│   │       └── http-exception.filter.ts      # Global Exception Filter
│   ├── modules/
│   │   ├── database/                         # Tầng dữ liệu In-Memory & Hạt giống (Seed Data)
│   │   │   ├── database.service.ts
│   │   │   ├── database.module.ts
│   │   │   └── seed-data.ts
│   │   ├── categories/                       # Module Quản lý Thể loại sách
│   │   ├── authors/                          # Module Quản lý Tác giả
│   │   ├── books/                            # Module Quản lý Sách & Kho lưu trữ
│   │   ├── members/                          # Module Quản lý Độc giả & Thẻ thư viện
│   │   ├── borrowings/                       # Module Nghiệp vụ Mượn / Trả / Gia hạn / Phạt
│   │   └── stats/                            # Module Thống kê & Dashboard
│   ├── app.controller.ts                     # Root redirect -> Swagger UI & Health Check
│   ├── app.module.ts                         # Root Module kết nối toàn bộ hệ thống
│   └── main.ts                               # Bootstrap server & cấu hình Swagger UI
└── test/                                     # Kiểm thử e2e & unit tests
```

---

## 🚀 Hướng Dẫn Cài Đặt & Chạy Dự Án

### Yêu Cầu Môi Trường
- **Node.js**: >= 18.0.0 (khuyến nghị Node 20+)
- **npm** hoặc **yarn**

### 1. Khởi Chạy Server Ở Chế Độ Phát Triển (Development)
```bash
# Khởi động ứng dụng với chế độ hot-reload
npm run start:dev
```

Ngay sau khi server khởi chạy, mở trình duyệt và truy cập:
- 📖 **Swagger UI Documentation**: [http://localhost:3000/api/docs](http://localhost:3000/api/docs)
- 🏠 **Trang Chủ (Tự động chuyển hướng đến Docs)**: [http://localhost:3000/](http://localhost:3000/)
- 💓 **Health Check**: [http://localhost:3000/api/health](http://localhost:3000/api/health)

### 2. Kiểm Tra Mã Nguồn & Chạy Test
```bash
# Biên dịch TypeScript sang JavaScript
npm run build

# Chạy toàn bộ Unit Tests
npm run test

# Chạy End-to-End Tests
npm run test:e2e

# Phân tích tĩnh cú pháp mã nguồn (Linting)
npm run lint
```

---

## 📋 Danh Sách API Endpoints (Swagger Catalog)

### 🔑 0. Xác Thực & Tài Khoản (`/api/auth`)
| Phương thức | Endpoint | Mô tả |
| :--- | :--- | :--- |
| `POST` | `/api/auth/register` | **Đăng ký**: Tạo tài khoản mới gồm `email`, `phone`, `password`, `fullName` (mã hóa Bcrypt, tự liên kết thẻ thư viện) |
| `POST` | `/api/auth/login` | **Đăng nhập**: Đăng nhập linh hoạt bằng `email` hoặc `phone` + `password`, cấp Bearer JWT Token |
| `GET` | `/api/auth/me` | **Thông tin cá nhân**: Lấy hồ sơ tài khoản đang đăng nhập (yêu cầu Bearer Token) |
| `POST` | `/api/auth/change-password` | **Đổi mật khẩu**: Cập nhật mật khẩu mới cho tài khoản (yêu cầu Bearer Token) |

### 1. Quản Lý Sách (`/api/books`)
| Phương thức | Endpoint | Mô tả |
| :--- | :--- | :--- |
| `GET` | `/api/books` | Lấy danh sách sách (tìm kiếm từ khóa, lọc theo thể loại, tác giả, trạng thái, phân trang) |
| `GET` | `/api/books/:id` | Xem thông tin chi tiết một cuốn sách |
| `GET` | `/api/books/isbn/:isbn` | Tra cứu sách nhanh theo mã số tiêu chuẩn quốc tế ISBN |
| `POST` | `/api/books` | Nhập thêm sách mới vào thư viện |
| `PATCH` | `/api/books/:id` | Cập nhật thông tin sách, số lượng tồn kho hoặc vị trí kệ |
| `DELETE` | `/api/books/:id` | Xóa sách khỏi hệ thống (chỉ xóa khi không có ai đang mượn) |

### 2. Quản Lý Mượn - Trả Sách (`/api/borrowings`)
| Phương thức | Endpoint | Mô tả |
| :--- | :--- | :--- |
| `POST` | `/api/borrowings` | **Mượn sách**: Tạo phiếu mượn mới, tự động trừ kho và kiểm tra tính hợp lệ của thẻ |
| `POST` | `/api/borrowings/:id/return` | **Trả sách**: Hoàn tất phiếu, hoàn lại sách vào kho, tự động tính tiền phạt trễ hạn |
| `POST` | `/api/borrowings/:id/renew` | **Gia hạn**: Tăng thêm thời hạn mượn (tối đa 2 lần, mỗi lần 7-14 ngày) |
| `POST` | `/api/borrowings/:id/pay-fine` | **Đóng tiền phạt**: Xác nhận đã thu tiền phạt quá hạn từ độc giả |
| `GET` | `/api/borrowings` | Danh sách lịch sử mượn trả kèm bộ lọc theo độc giả, sách, trạng thái |
| `GET` | `/api/borrowings/overdue` | Danh sách các phiếu mượn đã quá hạn chót trả cần đôn đốc thu hồi |
| `GET` | `/api/borrowings/:id` | Xem chi tiết phiếu mượn |

### 3. Quản Lý Độc Giả (`/api/members`)
| Phương thức | Endpoint | Mô tả |
| :--- | :--- | :--- |
| `GET` | `/api/members` | Danh sách độc giả, tìm kiếm theo tên, email, SĐT, số thẻ |
| `GET` | `/api/members/:id` | Chi tiết hồ sơ độc giả và số sách đang mượn |
| `GET` | `/api/members/card/:cardNumber` | Tra cứu độc giả qua mã thẻ thư viện (VD: `LIB-2026-0001`) |
| `POST` | `/api/members` | Đăng ký độc giả mới, tự động cấp mã thẻ và hạn sử dụng |
| `PATCH` | `/api/members/:id` | Cập nhật hồ sơ độc giả, gia hạn hạn thẻ |
| `DELETE` | `/api/members/:id` | Xóa hồ sơ độc giả (chỉ xóa khi không còn sách nợ) |

### 4. Quản Lý Thể Loại & Tác Giả (`/api/categories`, `/api/authors`)
| Phương thức | Endpoint | Mô tả |
| :--- | :--- | :--- |
| `GET` | `/api/categories` | Danh sách thể loại sách kèm số lượng sách thuộc thể loại |
| `POST` | `/api/categories` | Thêm mới một thể loại sách |
| `GET` | `/api/authors` | Danh sách tác giả kèm số lượng tác phẩm đang có trong thư viện |
| `POST` | `/api/authors` | Thêm mới một tác giả |

### 5. Thống Kê & Báo Cáo (`/api/stats`)
| Phương thức | Endpoint | Mô tả |
| :--- | :--- | :--- |
| `GET` | `/api/stats` | **Dashboard**: Thống kê tổng số sách, số bản in, sách đang mượn, sách quá hạn, tiền phạt và Top 5 cuốn sách mượn nhiều nhất |

---

## 🧪 Dữ Liệu Hạt Giống Có Sẵn (Seed Data)
Dự án được tích hợp sẵn dữ liệu mẫu thực tế để trải nghiệm ngay trên Swagger UI mà không cần gõ dữ liệu thủ công:
- **Tài Khoản Đăng Nhập Mẫu (Auth)**:
  - 👑 **Admin**: `admin@librobe.com` / SĐT: `0909000001` / Mật khẩu: `Admin@123`
  - 📖 **Thủ thư (Librarian)**: `librarian@librobe.com` / SĐT: `0909000002` / Mật khẩu: `Librarian@123`
  - 👤 **Độc giả (Member)**: `an.nguyen@example.com` / SĐT: `0901234567` / Mật khẩu: `Member@123`
- **6 Cuốn Sách Nổi Tiếng**: *Clean Code*, *Clean Architecture*, *Đắc Nhân Tâm*, *Nhà Giả Kim*, *Sapiens*, *Mắt Biếc*.
- **5 Tác Giả Lừng Danh**: Robert C. Martin, Dale Carnegie, Paulo Coelho, Yuval Noah Harari, Nguyễn Nhật Ánh.
- **5 Thể Loại Sách**: Công nghệ thông tin, Kỹ năng sống, Văn học & Tiểu thuyết, Kinh tế, Khoa học & Lịch sử.
- **4 Độc Giả Tiêu Biểu**: Bạn đọc thông thường, sinh viên mượn nhiều, độc giả có thẻ đã hết hạn để kiểm thử ràng buộc nghiệp vụ.
- **4 Phiếu Mượn Mẫu**: Phiếu đang mượn (`BORROWED`), phiếu đã hoàn trả (`RETURNED`), phiếu trễ hạn (`OVERDUE`) để kiểm tra logic tính tiền phạt quá hạn.
