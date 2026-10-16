# KIẾN TRÚC HỆ THỐNG LIBROBE (ARCHITECTURE & TECH STACK)

Tài liệu này mô tả chi tiết kiến trúc phần mềm, nguyên lý thiết kế và luồng xử lý dữ liệu của hệ thống **Librobe Backend**.

---

## 1. Ngăn Xếp Công Nghệ (Technology Stack)

| Phân tầng | Công nghệ / Thư viện | Vai trò |
| :--- | :--- | :--- |
| **Runtime & Language** | Node.js v24+, TypeScript 6, ECMAScript Modules (`"type": "module"`) | Môi trường thực thi hiệu năng cao, type-safety |
| **Framework** | NestJS v12 (`@nestjs/core`, `@nestjs/common`, `@nestjs/platform-express`) | Khung ứng dụng dạng module, áp dụng Dependency Injection (DI) |
| **Database & ORM** | PostgreSQL (Supabase Cloud), Prisma ORM v6 (`@prisma/client`) | Lưu trữ dữ liệu quan hệ, type-safe queries, migration tự động |
| **Xác thực (Auth)** | `@nestjs/jwt`, `bcryptjs` | Cấp phát Bearer Token JWT, băm mật khẩu bảo mật (Salt 10) |
| **Tài liệu API** | `@nestjs/swagger`, `swagger-ui-express` | Tự động sinh tài liệu OpenAPI 3.0 Interactive Docs |
| **Validation** | `class-validator`, `class-transformer` | Xác thực dữ liệu đầu vào DTO tự động qua `ValidationPipe` |
| **Frontend** | Vanilla HTML5 / Modular CSS3 / ES6 JavaScript | Single Page Application (SPA) siêu nhẹ, zero dependencies |

---

## 2. Mô Hình Kiến Trúc Phân Tầng (Clean Architecture)

Hệ thống được tổ chức theo cấu trúc 3 tầng chuẩn mực:

```
[ HTTP Request từ Client / Swagger / Web Dashboard ]
                    │
                    ▼
┌────────────────────────────────────────────────────────┐
│  Presentation Layer (Tầng Giao Tiếp)                   │
│  - Controller: Tiếp nhận HTTP request, parse parameters│
│  - ValidationPipe: Tự động validate bằng DTO           │
│  - Guards: JwtAuthGuard, RolesGuard kiểm tra quyền     │
└───────────────────┬────────────────────────────────────┘
                    │
                    ▼
┌────────────────────────────────────────────────────────┐
│  Domain / Business Layer (Tầng Nghiệp Vụ)              │
│  - Service: Chứa 100% logic nghiệp vụ                  │
│  - Tính toán: Tồn kho, tiền phạt 5.000đ/ngày, gia hạn │
│  - Xử lý bất đồng bộ & Exceptions chuyên biệt         │
└───────────────────┬────────────────────────────────────┘
                    │
                    ▼
┌────────────────────────────────────────────────────────┐
│  Data Access Layer (Tầng Dữ Liệu)                      │
│  - PrismaService: Quản lý PrismaClient kết nối Pooler  │
│  - Prisma Transactions: $transaction đảm bảo tính ACID │
│  - Supabase PostgreSQL: Lưu trữ bảng thực tế          │
└────────────────────────────────────────────────────────┘
```

---

## 3. Luồng Xử Lý Nghiệp Vụ Cốt Lõi (Business Flow)

### A. Luồng Mượn Sách (`BorrowingsService.borrowBook`)
1. Nhận yêu cầu: `memberId`, `bookId`, `durationDays`.
2. Kiểm tra độc giả:
   * Thẻ độc giả phải ở trạng thái `ACTIVE` và chưa hết hạn (`membershipExpiry > now`).
   * Không có sách quá hạn chưa hoàn trả.
   * Số lượng sách đang mượn chưa vượt quá `maxBorrowLimit`.
3. Kiểm tra sách trong kho:
   * Sách phải có `copiesAvailable > 0`.
4. **Prisma Transaction (`$transaction`)**:
   * Tạo bản ghi mới trong bảng `borrowings` với trạng thái `BORROWED`, tự sinh mã giao dịch chuẩn `BRW-YYYYMMDD-XXXX`.
   * Giảm `copiesAvailable` của sách đi 1 cuốn.
   * Tăng `currentBorrowedCount` của độc giả lên 1.

### B. Luồng Hoàn Trả Sách (`BorrowingsService.returnBook`)
1. Tìm phiếu mượn theo ID (phải đang ở trạng thái `BORROWED` hoặc `OVERDUE`).
2. Tự động tính tiền phạt trễ hạn:
   * Nếu ngày trả > `dueDate`: Số ngày trễ = `Math.ceil((now - dueDate) / 86400000)`.
   * Tiền phạt = `Số ngày trễ * 5.000 VNĐ`.
3. **Prisma Transaction (`$transaction`)**:
   * Cập nhật trạng thái phiếu mượn sang `RETURNED`, ghi nhận ngày trả thực tế và tiền phạt.
   * Tăng `copiesAvailable` của sách lên 1 cuốn.
   * Giảm `currentBorrowedCount` của độc giả đi 1.

---

## 4. Xử Lý Lỗi Tập Trung (Global Exception Filter)

Toàn bộ các ngoại lệ phát sinh trong hệ thống được đón chặn bởi [`AllExceptionsFilter`](../src/common/filters/http-exception.filter.ts):
* Trả về định dạng JSON chuẩn hóa đồng nhất:
  ```json
  {
    "statusCode": 400,
    "timestamp": "2026-10-16T08:00:00.000Z",
    "path": "/api/borrowings",
    "message": "Số lượng bản in trong kho đã hết. Không thể tạo phiếu mượn."
  }
  ```
* Bắt triệt để các mã lỗi của Prisma (ví dụ: `P2002` lỗi trùng Unique Key chuyển thành `409 Conflict`, `P2025` không tìm thấy bản ghi chuyển thành `404 Not Found`).
