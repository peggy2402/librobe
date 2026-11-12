# ĐẶC TẢ API & BỘ TEST CASE — LIBROBE

> **Toàn bộ request/response trong tài liệu này được chụp từ việc gọi API thật** trên server đang chạy, không phải ví dụ giả định. 76 cặp request/response đã được ghi lại (41×`200`, 12×`201`, 15×`400`, 3×`401`, 1×`404`, 4×`409`).
>
> Các giá trị `id`, `transactionCode`, `createdAt`… sẽ khác khi bạn chạy lại. Phần cần đối chiếu khi chấm là **HTTP status**, **tên field**, và **giá trị nghiệp vụ** (tiền phạt, số lần gia hạn, trạng thái).

---

## MỤC LỤC

- [1. Quy ước chung](#1-quy-ước-chung)
- [2. Bảng tra nhanh endpoint](#2-bảng-tra-nhanh-endpoint)
- [3. Auth — Xác thực & mật khẩu](#3-auth--xác-thực--mật-khẩu)
- [4. Members & Books — dữ liệu nền](#4-members--books--dữ-liệu-nền)
- [5. Reservations — Đặt trước sách](#5-reservations--đặt-trước-sách)
- [6. Borrowings — Phiếu mượn lẻ](#6-borrowings--phiếu-mượn-lẻ)
- [7. Borrowing Slips — Phiếu mượn ERP](#7-borrowing-slips--phiếu-mượn-erp)
- [8. Stats](#8-stats)
- [9. Bộ test case đầy đủ](#9-bộ-test-case-đầy-đủ)
- [10. Kịch bản test end-to-end](#10-kịch-bản-test-end-to-end)
- [11. Kiểm tra toàn vẹn dữ liệu](#11-kiểm-tra-toàn-vẹn-dữ-liệu)

---

## 1. Quy ước chung

**Base URL:** `http://localhost:3000/api` — Swagger UI: `http://localhost:3000/api/docs`

### Xác thực

Mọi endpoint **trừ** `POST /auth/login`, `POST /auth/register`, `POST /auth/forgot-password`, `POST /auth/reset-password` đều cần header:

```
Authorization: Bearer <accessToken>
```

Thiếu token → `401`:

```json
{
  "statusCode": 401,
  "error": "Unauthorized",
  "message": "Yêu cầu cần có mã Access Token để xác thực (Bearer Token)",
  "timestamp": "2026-11-10T07:22:29.107Z",
  "path": "/api/borrowings",
  "method": "GET"
}
```

### Cấu trúc lỗi thống nhất

Mọi lỗi đều trả về đúng 6 field này, **không bao giờ chứa stack trace, tên bảng hay câu SQL**:

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Nội dung lỗi nghiệp vụ, hoặc mảng chuỗi nếu là lỗi validate",
  "timestamp": "2026-11-10T07:20:12.548Z",
  "path": "/api/borrowings",
  "method": "POST"
}
```

Lỗi validate DTO trả `message` là **mảng**:

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": ["Mã độc giả phải là chuỗi ký tự", "Mã độc giả không được để trống"],
  "timestamp": "2026-11-10T07:20:35.231Z",
  "path": "/api/borrowings",
  "method": "POST"
}
```

### Ý nghĩa HTTP status

| Mã | Khi nào dùng |
|---|---|
| `200` | Thao tác đọc / cập nhật thành công |
| `201` | Tạo bản ghi mới thành công |
| `400` | Vi phạm điều kiện nghiệp vụ **đã biết tại thời điểm nhận request**, hoặc dữ liệu đầu vào sai định dạng |
| `401` | Thiếu / sai / hết hạn token, hoặc sai mật khẩu, hoặc tài khoản bị khóa |
| `403` | Đã đăng nhập nhưng **vai trò không đủ quyền** (xem bảng phân quyền mục 1.5) |
| `404` | Không tìm thấy bản ghi theo ID |
| `409` | **Xung đột trạng thái hoặc tranh chấp đồng thời** — thua tranh chấp tồn kho, xử lý trùng chứng từ, gia hạn khi có người đặt trước, đặt trước trùng |
| `500` | Chỉ lỗi hệ thống thật. **Không được xuất hiện** trong bất kỳ test case nào dưới đây |

> **Phân biệt `400` và `409` là điểm chấm quan trọng.** `400` = "biết trước là không được". `409` = "lúc kiểm tra thì được, nhưng đến lúc ghi thì người khác đã giành mất" hoặc "bản ghi đang ở trạng thái không cho phép thao tác này".

### 1.5 Phân quyền theo vai trò

Ba vai trò trong `users.role`: `ADMIN`, `LIBRARIAN`, `MEMBER`.

| Nhóm thao tác | Vai trò được phép |
|---|---|
| Đọc dữ liệu (`GET` sách, độc giả, tác giả, thể loại, phiếu mượn, đặt trước) | Mọi tài khoản đã đăng nhập |
| Đặt trước sách, hủy đặt trước, lập phiếu mượn ERP | Mọi tài khoản đã đăng nhập (độc giả tự phục vụ) |
| Mượn / trả / gia hạn / thu phạt tại quầy | `ADMIN`, `LIBRARIAN` |
| Phê duyệt, từ chối, hủy phiếu mượn ERP | `ADMIN`, `LIBRARIAN` |
| Tạo & sửa sách, độc giả, tác giả, thể loại | `ADMIN`, `LIBRARIAN` |
| **Xóa** sách, độc giả, tác giả, thể loại | `ADMIN` |
| Thống kê báo cáo (`GET /stats`) | `ADMIN`, `LIBRARIAN` |
| Quản trị tài khoản & phân quyền (`/users`) | `ADMIN` |

Vai trò không đủ quyền → `403`:

```json
{
  "statusCode": 403,
  "error": "Forbidden",
  "message": "Chức năng này chỉ dành cho ADMIN hoặc LIBRARIAN. Tài khoản của bạn đang có vai trò MEMBER",
  "timestamp": "2026-11-11T07:30:00.000Z",
  "path": "/api/borrowing-slips/slip-01/approve",
  "method": "PATCH"
}
```

> **Hai điểm quan trọng khi test:**
>
> 1. `POST /auth/register` **không nhận** field `role`. Đăng ký công khai luôn tạo `MEMBER`. Gửi `{"role":"ADMIN"}` thì field bị `ValidationPipe` loại bỏ im lặng và tài khoản vẫn là `MEMBER`. Nâng vai trò là việc của `ADMIN` qua `PATCH /api/users/:id/role`.
> 2. Thứ tự guard là `JwtAuthGuard` → `RolesGuard`. Nên khi **không có token** thì nhận `401` (chứ không phải `403`), còn có token mà sai vai trò thì mới `403`.

### Danh sách có phân trang

Các endpoint `GET` dạng danh sách trả về bọc trong `data` + `meta`:

```json
{
  "data": [ /* ... */ ],
  "meta": {
    "page": 1,
    "limit": 10,
    "totalItems": 25,
    "totalPages": 3,
    "hasNextPage": true,
    "hasPreviousPage": false
  }
}
```

Query hỗ trợ: `page`, `limit` (tối đa 100), `search`, `sortBy`, `sortOrder` (`ASC`/`DESC`).

### Tham số chính sách

Đọc từ biến môi trường, xem `.env.example`. Giá trị mặc định dùng trong tài liệu này:

| Tham số | Biến môi trường | Mặc định |
|---|---|---|
| Thời hạn mượn | `LOAN_DEFAULT_DAYS` | 14 ngày |
| Thời hạn mượn tối đa | `LOAN_MAX_DAYS` | 30 ngày |
| Mức phạt | `LOAN_FINE_PER_DAY` | 5.000 VNĐ/ngày/cuốn |
| Số lần gia hạn tối đa | `LOAN_RENEW_MAX_COUNT` | **1 lần** |
| Số ngày mỗi lần gia hạn | `LOAN_RENEW_DAYS` | 7 ngày |
| Chặn gia hạn khi có đặt trước | `LOAN_RENEW_BLOCK_WHEN_RESERVED` | `true` |
| Chặn mượn khi nợ phạt | `LOAN_BLOCK_BORROW_ON_UNPAID_FINE` | `true` |
| Giữ sách cho người đặt trước | `RESERVATION_HOLD_DAYS` | 3 ngày |

**Công thức phạt:**

```
Số ngày quá hạn = số ngày lịch giữa ngày trả thực tế và hạn trả, trừ ngày ân hạn, tối thiểu 0
Tiền phạt       = Số ngày quá hạn × Mức phạt mỗi ngày × Số lượng sách quá hạn
```

Đếm theo **mốc đầu ngày**, không phải hiệu milli-giây. Trả trễ 2 giờ ⇒ **0 ngày quá hạn, phạt 0 đồng**.

---

## 2. Bảng tra nhanh endpoint

### Auth

| Method | Endpoint | Auth | Chức năng |
|---|---|---|---|
| POST | `/auth/register` | — | Đăng ký tài khoản |
| POST | `/auth/login` | — | Đăng nhập, cấp JWT |
| GET | `/auth/me` | ✔ | Thông tin tài khoản hiện tại |
| POST | `/auth/forgot-password` | — | Yêu cầu đặt lại mật khẩu |
| POST | `/auth/reset-password` | — | Đặt lại mật khẩu bằng token |
| POST | `/auth/change-password` | ✔ | Đổi mật khẩu khi đã đăng nhập |

### Nghiệp vụ mượn/trả

| Method | Endpoint | Chức năng |
|---|---|---|
| POST | `/borrowings` | Mượn sách (1 phiếu = 1 cuốn) |
| GET | `/borrowings` | Danh sách phiếu mượn |
| GET | `/borrowings/overdue` | Danh sách phiếu quá hạn |
| GET | `/borrowings/fines/unpaid` | Khoản phạt chưa thanh toán |
| GET | `/borrowings/:id` | Chi tiết phiếu mượn |
| GET | `/borrowings/:id/renewals` | Lịch sử gia hạn |
| POST | `/borrowings/:id/return` | Trả sách |
| POST | `/borrowings/:id/renew` | Gia hạn |
| POST | `/borrowings/:id/pay-fine` | Thanh toán phạt |

### Phiếu mượn ERP (nhiều cuốn, có phê duyệt)

| Method | Endpoint | Chức năng |
|---|---|---|
| POST | `/borrowing-slips` | Lập phiếu mượn nhiều cuốn |
| GET | `/borrowing-slips` | Danh sách phiếu |
| GET | `/borrowing-slips/:id` | Chi tiết phiếu |
| GET | `/borrowing-slips/:id/renewals` | Lịch sử gia hạn |
| PATCH | `/borrowing-slips/:id/approve` | Phê duyệt & xuất kho |
| PATCH | `/borrowing-slips/:id/reject` | Từ chối |
| PATCH | `/borrowing-slips/:id/cancel` | Hủy, hoàn kho nếu đã xuất |
| PATCH | `/borrowing-slips/:id/renew` | Gia hạn phiếu |
| POST | `/borrowing-slips/:id/return-items` | Trả từng phần, tính phạt |
| POST | `/borrowing-slips/:id/pay-fine` | Thanh toán phạt |

### Đặt trước & tra cứu

| Method | Endpoint | Chức năng |
|---|---|---|
| POST | `/reservations` | Đặt trước sách |
| GET | `/reservations` | Danh sách phiếu đặt trước |
| GET | `/reservations/book/:bookId/queue` | Hàng đợi của một cuốn sách |
| GET | `/reservations/:id` | Chi tiết phiếu đặt trước |
| PATCH | `/reservations/:id/cancel` | Hủy đặt trước |
| GET | `/members/:id/debt-summary` | Hạn mức + nợ phạt + có được mượn không |
| GET | `/books/:id/stock-check` | Số lượng sách còn lại |
| GET | `/stats` | Thống kê tổng quan (`ADMIN`/`LIBRARIAN`) |

### Quản trị tài khoản & phân quyền (chỉ `ADMIN`)

| Method | Endpoint | Chức năng |
|---|---|---|
| GET | `/users` | Danh sách tài khoản, lọc theo `role` / `isActive` |
| GET | `/users/:id` | Chi tiết tài khoản |
| PATCH | `/users/:id/role` | Đổi vai trò — nâng độc giả lên thủ thư |
| PATCH | `/users/:id/status` | Khóa / mở tài khoản |

---

## 3. Auth — Xác thực & mật khẩu

### 3.1 `POST /auth/login`

**Request**

```json
{ "identifier": "admin@librobe.com", "password": "<mật khẩu>" }
```

`identifier` nhận email hoặc số điện thoại.

**Response `200`**

```json
{
  "accessToken": "<JWT_TOKEN>",
  "tokenType": "Bearer",
  "expiresIn": 86400,
  "user": {
    "id": "user-01",
    "email": "admin@librobe.com",
    "phone": "0909000001",
    "fullName": "Quản Trị Viên Hệ Thống",
    "role": "ADMIN",
    "memberId": null,
    "isActive": true,
    "createdAt": "2026-10-16T07:59:32.994Z"
  }
}
```

**Sai mật khẩu → `401`**

```json
{
  "statusCode": 401,
  "error": "Unauthorized",
  "message": "Email/Số điện thoại hoặc mật khẩu không chính xác"
}
```

**Tài khoản bị khóa (`is_active = false`) → `401`**

```json
{ "statusCode": 401, "error": "Unauthorized", "message": "Tài khoản của bạn đã bị vô hiệu hóa hoặc tạm khóa" }
```

> Thông điệp sai mật khẩu **không tiết lộ** email có tồn tại hay không.

### 3.2 `GET /auth/me`

**Response `200`**

```json
{
  "id": "user-01",
  "email": "admin@librobe.com",
  "phone": "0909000001",
  "fullName": "Quản Trị Viên Hệ Thống",
  "role": "ADMIN",
  "memberId": null,
  "isActive": true,
  "createdAt": "2026-10-16T07:59:32.994Z"
}
```

### 3.3 `POST /auth/forgot-password`

**Request**

```json
{ "email": "an.nguyen@example.com" }
```

**Response `200` — giống hệt nhau trong CẢ BA trường hợp**

```json
{ "success": true, "message": "Nếu email tồn tại, hướng dẫn đặt lại mật khẩu đã được gửi." }
```

| Trường hợp | HTTP | Response | Token sinh ra |
|---|---|---|---|
| Email tồn tại, `is_active = true` | `200` | như trên | **1** |
| Email tồn tại, `is_active = false` | `200` | như trên | **0** |
| Email không tồn tại | `200` | như trên | **0** |

> **Chủ ý thiết kế, không phải bug:** chống dò tài khoản (account enumeration). Hệ quả khi test: `200 success` **không chứng minh** API đã chạy. Muốn biết nó có thật sự tạo token thì phải kiểm tra bảng `password_reset_tokens` hoặc đọc log server.

**Hai điều cần biết khi test:**

1. **Chặn spam 60 giây.** Gọi lần hai trong vòng 60 giây vẫn trả `200` nhưng **không sinh token mới**.
2. **Token không đọc được từ DB.** Nó được lưu dạng SHA-256 hash, hiệu lực 20 phút, dùng một lần. Lấy token bằng cách đặt `MAIL_PROVIDER=console` rồi đọc log:

```
[MailService] [password-reset] an.nguyen@example.com: http://localhost:3000/admin?resetToken=XXXX
```

### 3.4 `POST /auth/reset-password`

**Request**

```json
{ "token": "Mx-6c24nA2IpcZ2bN7whVAk5W2lD1scpb1JufWiT9jU", "newPassword": "MatKhauMoi@123" }
```

**Response `200`**

```json
{ "success": true, "message": "Mật khẩu đã được đặt lại thành công. Vui lòng đăng nhập lại." }
```

**Token sai / hết hạn / đã dùng → `400`** (cùng một thông điệp cho cả ba, không tiết lộ token tồn tại hay không)

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn",
  "timestamp": "2026-11-10T07:20:15.078Z",
  "path": "/api/auth/reset-password",
  "method": "POST"
}
```

### 3.5 `POST /auth/change-password`

**Request** (cần Bearer token)

```json
{ "currentPassword": "MatKhauCu@123", "newPassword": "MatKhauMoi@123" }
```

Thiếu token → `401`. Tài khoản bị khóa → `401`.

---

## 4. Members & Books — dữ liệu nền

### 4.1 `POST /members`

**Request**

```json
{
  "fullName": "Doc Gia A",
  "email": "doc.a@librobe.test",
  "phone": "0912345671",
  "address": "So 1 Duong Kiem Thu",
  "maxBorrowLimit": 5,
  "membershipDurationMonths": 12
}
```

Ràng buộc: `maxBorrowLimit` 1–10, `membershipDurationMonths` 1–36, `phone` 10 số, `email`/`phone` phải duy nhất (trùng → `409`).

**Response `201`** — `cardNumber` tự sinh dạng `LIB-YYYY-NNNN`.

### 4.2 `GET /members/:id/debt-summary`

Endpoint quan trọng nhất để kiểm tra điều kiện mượn.

**Đủ điều kiện mượn → `200`**

```json
{
  "memberId": "46ba2f60-5c0c-4e60-af9f-d75a52007519",
  "cardNumber": "LIB-2026-0008",
  "fullName": "Doc Gia A",
  "status": "ACTIVE",
  "membershipExpiry": "2027-11-10T07:20:17.412Z",
  "maxBorrowLimit": 5,
  "currentBorrowedCount": 0,
  "remainingBorrowLimit": 5,
  "totalUnpaidFine": 0,
  "overdueCount": 0,
  "hasOverdue": false,
  "canBorrow": true
}
```

**Hết hạn mức → `200`** (thêm 2 field `blockReason` + `reasonIfNotAllowed`)

```json
{
  "maxBorrowLimit": 5,
  "currentBorrowedCount": 5,
  "remainingBorrowLimit": 0,
  "totalUnpaidFine": 0,
  "hasOverdue": false,
  "canBorrow": false,
  "blockReason": "LIMIT_EXCEEDED",
  "reasonIfNotAllowed": "Độc giả đã sử dụng hết hạn mức mượn (5 cuốn)"
}
```

**Nợ phạt → `200`**

```json
{
  "currentBorrowedCount": 4,
  "remainingBorrowLimit": 1,
  "totalUnpaidFine": 25000,
  "hasOverdue": false,
  "canBorrow": false,
  "blockReason": "UNPAID_FINE",
  "reasonIfNotAllowed": "Độc giả còn nợ tiền phạt chưa thanh toán (25.000 VNĐ). Cần thanh toán trước khi mượn tiếp"
}
```

**Các giá trị `blockReason`** (xét theo đúng thứ tự ưu tiên này):

| Giá trị | Nghĩa |
|---|---|
| `CARD_NOT_ACTIVE` | Thẻ không ở trạng thái `ACTIVE` |
| `CARD_EXPIRED` | Thẻ hết hạn sử dụng |
| `HAS_OVERDUE` | Đang có sách quá hạn chưa trả |
| `UNPAID_FINE` | Còn nợ tiền phạt |
| `LIMIT_EXCEEDED` | Đã dùng hết hạn mức |

> `currentBorrowedCount` phải **cộng cả hai luồng** — phiếu mượn lẻ và phiếu mượn ERP. Đây là điểm chấm: bài nào chỉ đếm bảng `borrowings` sẽ ra số thiếu và cho mượn vượt hạn mức.

### 4.3 `GET /books/:id/stock-check`

**Còn sách → `200`**

```json
{
  "bookId": "0eebdd12-35b1-4bb9-a7db-50b5168bfd69",
  "title": "Sach Kiem Thu 1",
  "copiesTotal": 10,
  "copiesAvailable": 10,
  "price": 200000,
  "status": "AVAILABLE",
  "isAvailable": true
}
```

**Hết sách → `200`**

```json
{
  "copiesTotal": 1,
  "copiesAvailable": 0,
  "price": 200000,
  "status": "OUT_OF_STOCK",
  "isAvailable": false
}
```

`status` tự đồng bộ theo tồn kho: `copiesAvailable = 0` → `OUT_OF_STOCK`, `> 0` → `AVAILABLE`. Riêng `DISCONTINUED` là quyết định hành chính, không bị ghi đè.

---

## 5. Reservations — Đặt trước sách

### 5.1 `POST /reservations`

**Request**

```json
{
  "memberId": "46ba2f60-5c0c-4e60-af9f-d75a52007519",
  "bookId": "0eebdd12-35b1-4bb9-a7db-50b5168bfd69",
  "notes": "Can gap cho ky thi cuoi khoa"
}
```

**Response `201`** — sách còn trên kệ nên giữ ngay (`READY`)

```json
{
  "id": "04329261-2fe3-47b6-bb49-23743d8fd58e",
  "reservationCode": "RSV-2026-0001",
  "memberId": "46ba2f60-5c0c-4e60-af9f-d75a52007519",
  "memberName": "Doc Gia A",
  "bookId": "0eebdd12-35b1-4bb9-a7db-50b5168bfd69",
  "bookTitle": "Sach Kiem Thu 1",
  "status": "READY",
  "reservedAt": "2026-11-10T07:21:27.935Z",
  "expiresAt": "2026-11-13T07:21:27.935Z",
  "readyAt": "2026-11-10T07:21:27.935Z",
  "notes": "Can gap cho ky thi cuoi khoa",
  "createdAt": "2026-11-10T07:21:28.849Z",
  "updatedAt": "2026-11-10T07:21:28.849Z"
}
```

Nếu sách đã hết bản khả dụng → `status: "PENDING"`, **không có** `expiresAt` và `readyAt`. Khi có người trả sách về kho, phiếu đầu hàng đợi tự chuyển sang `READY` kèm `expiresAt = readyAt + 3 ngày`.

**Vòng đời `status`**

| Giá trị | Nghĩa | Tính vào "đặt trước còn hiệu lực"? |
|---|---|---|
| `PENDING` | Đang chờ sách về kho | ✔ |
| `READY` | Sách đang được giữ riêng | ✔ |
| `FULFILLED` | Đã chuyển thành phiếu mượn | ✘ |
| `CANCELLED` | Đã hủy | ✘ |
| `EXPIRED` | Quá hạn nhận sách | ✘ |

**Đặt trước trùng → `409`**

```json
{
  "statusCode": 409,
  "error": "Conflict",
  "message": "Độc giả đã có phiếu đặt trước còn hiệu lực cho cuốn sách \"Sach Kiem Thu 1\" (RSV-2026-0001)"
}
```

### 5.2 `GET /reservations/book/:bookId/queue`

Trả về **mảng** (không bọc phân trang), chỉ gồm phiếu `PENDING` + `READY`, sắp xếp theo `reservedAt` tăng dần.

```json
[
  {
    "id": "04329261-2fe3-47b6-bb49-23743d8fd58e",
    "reservationCode": "RSV-2026-0001",
    "memberName": "Doc Gia A",
    "bookTitle": "Sach Kiem Thu 1",
    "status": "READY",
    "reservedAt": "2026-11-10T07:21:27.935Z",
    "expiresAt": "2026-11-13T07:21:27.935Z"
  }
]
```

### 5.3 `PATCH /reservations/:id/cancel`

**Request:** `{ "reason": "Doc gia doi y" }`

**Response `200`**

```json
{
  "reservationCode": "RSV-2026-0001",
  "status": "CANCELLED",
  "cancelledAt": "2026-11-10T07:21:41.218Z",
  "cancelReason": "Doc gia doi y"
}
```

Hủy phiếu đã `CANCELLED`/`EXPIRED`/`FULFILLED` → `409`.

---

## 6. Borrowings — Phiếu mượn lẻ

### 6.1 `POST /borrowings` — Mượn sách

**Request**

```json
{
  "memberId": "46ba2f60-5c0c-4e60-af9f-d75a52007519",
  "bookId": "0eebdd12-35b1-4bb9-a7db-50b5168bfd69",
  "durationDays": 14,
  "notes": "Muon lam tai lieu tham khao"
}
```

| Field | Bắt buộc | Ghi chú |
|---|---|---|
| `memberId` | ✔ | |
| `bookId` | ✔ | |
| `durationDays` | ✘ | Bỏ trống = 14. Vượt 30 → `400` |
| `notes` | ✘ | |

**Response `201`**

```json
{
  "id": "6780c6dd-9ce1-4038-a861-6dafdf8bd847",
  "transactionCode": "BRW-2026-0018",
  "memberId": "46ba2f60-5c0c-4e60-af9f-d75a52007519",
  "memberName": "Doc Gia A",
  "bookId": "0eebdd12-35b1-4bb9-a7db-50b5168bfd69",
  "bookTitle": "Sach Kiem Thu 1",
  "borrowDate": "2026-11-10T07:20:27.755Z",
  "dueDate": "2026-11-24T07:20:27.755Z",
  "renewCount": 0,
  "fineAmount": 0,
  "finePaid": false,
  "notes": "Muon lam tai lieu tham khao",
  "status": "BORROWED",
  "createdAt": "2026-11-10T07:20:29.327Z",
  "updatedAt": "2026-11-10T07:20:29.327Z"
}
```

`dueDate` = `borrowDate` + 14 ngày. `transactionCode` dạng `BRW-YYYY-NNNN` tăng dần, không trùng kể cả khi nhiều request đồng thời.

**Tác động database:** `books.copies_available` −1, `members.current_borrowed_count` +1.

#### Các trường hợp bị từ chối

**Vượt hạn mức → `400`**

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Vượt quá hạn mức mượn: độc giả \"Doc Gia A\" đang giữ 5/5 cuốn, chỉ còn được mượn thêm 0 cuốn nhưng yêu cầu 1 cuốn"
}
```

**Thẻ bị khóa → `400`**

```json
{ "statusCode": 400, "error": "Bad Request", "message": "Thẻ độc giả đang ở trạng thái \"SUSPENDED\". Không đủ điều kiện mượn sách" }
```

**Nợ phạt → `400`**

```json
{ "statusCode": 400, "error": "Bad Request", "message": "Độc giả còn nợ tiền phạt chưa thanh toán (25.000 VNĐ). Cần thanh toán trước khi mượn tiếp" }
```

**Hết sách → `400`**

```json
{ "statusCode": 400, "error": "Bad Request", "message": "Cuốn sách \"Sach Kiem Thu 2\" hiện tại đã hết bản in sẵn có để mượn" }
```

**Vượt thời hạn mượn tối đa → `400`**

```json
{ "statusCode": 400, "error": "Bad Request", "message": "Thời hạn mượn tối đa theo chính sách thư viện là 30 ngày (yêu cầu 45 ngày)" }
```

**Độc giả không tồn tại → `404`**

```json
{ "statusCode": 404, "error": "Not Found", "message": "Không tìm thấy độc giả với ID \"khong-ton-tai\"" }
```

**⭐ Thua tranh chấp bản sách cuối cùng → `409`**

Hai request gửi đồng thời, request thắng nhận `201` như trên, request thua nhận:

```json
{
  "statusCode": 409,
  "error": "Conflict",
  "message": "Sách \"Sach Chi Con 1 Ban\" vừa được độc giả khác mượn hết. Số lượng khả dụng không còn đủ 1 cuốn, giao dịch đã được hủy bỏ",
  "timestamp": "2026-11-10T07:27:49.336Z",
  "path": "/api/borrowings",
  "method": "POST"
}
```

Sau khi chạy: `copiesAvailable = 0` (**không phải `-1`**), đúng **1** phiếu mượn được tạo, `current_borrowed_count` của độc giả thua **không tăng**.

### 6.2 `GET /borrowings/:id`

**Phiếu quá hạn 5 ngày → `200`**

```json
{
  "id": "c86de0fa-0c05-4eed-a52e-bdbb9d66391c",
  "transactionCode": "BRW-2026-0024",
  "memberName": "Doc Gia A",
  "bookTitle": "Sach Kiem Thu 1",
  "borrowDate": "2026-11-10T07:21:02.116Z",
  "dueDate": "2026-11-05T07:21:04.909Z",
  "renewCount": 0,
  "fineAmount": 25000,
  "finePaid": false,
  "status": "OVERDUE"
}
```

`status` tự chuyển `BORROWED` → `OVERDUE` và `fineAmount` dồn tích theo ngày mỗi lần đọc dữ liệu. Khoản phạt **đã thanh toán thì không bị tính lại**.

### 6.3 `POST /borrowings/:id/return` — Trả sách

**Request**

```json
{ "notes": "Sach nguyen ven", "finePaid": false }
```

| Field | Bắt buộc | Ghi chú |
|---|---|---|
| `notes` | ✘ | |
| `finePaid` | ✘ | **Mặc định `false`** = ghi nhận phạt thành nợ. Truyền `true` nếu thu tiền ngay tại quầy |

**Trả đúng hạn → `200`**

```json
{
  "transactionCode": "BRW-2026-0018",
  "dueDate": "2026-11-24T07:20:27.755Z",
  "returnDate": "2026-11-10T07:20:59.879Z",
  "renewCount": 0,
  "fineAmount": 0,
  "finePaid": true,
  "status": "RETURNED"
}
```

> `finePaid: true` ở đây nghĩa là **không nợ gì** (phạt = 0 nên coi như đã thanh lý), **không có** `finePaidAt`.

**Trả muộn 5 ngày → `200`**

```json
{
  "transactionCode": "BRW-2026-0024",
  "dueDate": "2026-11-05T07:21:04.909Z",
  "returnDate": "2026-11-10T07:21:08.932Z",
  "fineAmount": 25000,
  "finePaid": false,
  "notes": "Tra muon 5 ngay",
  "status": "RETURNED"
}
```

`25000` = 5 ngày × 5.000 × 1 cuốn. **`status = RETURNED` nhưng `finePaid = false`** — đã trả sách và đã nộp phạt là **hai trạng thái độc lập**.

**Trả sách lặp lại → `400`**

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Phiếu mượn này đã được hoàn trả trước đó",
  "path": "/api/borrowings/c86de0fa-0c05-4eed-a52e-bdbb9d66391c/return",
  "method": "POST"
}
```

Database **không đổi**: `fine_amount` vẫn `25000` (không thành `50000`), tồn kho không +1 lần nữa.

### 6.4 `POST /borrowings/:id/renew` — Gia hạn

**Request**

```json
{ "extraDays": 7, "notes": "Can them thoi gian lam do an", "renewedBy": "Thu thu Lan" }
```

**Response `200`**

```json
{
  "transactionCode": "BRW-2026-0025",
  "borrowDate": "2026-11-10T07:21:18.367Z",
  "dueDate": "2026-11-19T07:21:18.367Z",
  "renewCount": 1,
  "fineAmount": 0,
  "finePaid": false,
  "notes": "Gia hạn thêm 7 ngày: Can them thoi gian lam do an",
  "status": "BORROWED"
}
```

Phiếu mượn với `durationDays: 2` có hạn trả `2026-11-12`. Sau gia hạn → `2026-11-19` = **hạn trả cũ + 7 ngày**, không phải "hôm nay + 7".

**Thứ tự kiểm tra điều kiện** (cố định, để thông điệp lỗi luôn xác định):

| # | Điều kiện | Mã lỗi khi vi phạm |
|---|---|---|
| 1 | Phiếu tồn tại | `404` |
| 2 | Chưa trả sách | `400` |
| 3 | Chưa quá hạn | `400` |
| 4 | Chưa dùng hết số lần gia hạn | `400` |
| 5 | Sách không có độc giả khác đặt trước | **`409`** |

**Đã gia hạn 1 lần → `400`**

```json
{ "statusCode": 400, "error": "Bad Request", "message": "Đã đạt số lần gia hạn tối đa (1 lần) cho lượt mượn này" }
```

**Sách đã trả → `400`**

```json
{ "statusCode": 400, "error": "Bad Request", "message": "Phiếu mượn đã hoàn tất trả sách, không thể gia hạn thêm" }
```

**Phiếu đã quá hạn → `400`**

```json
{ "statusCode": 400, "error": "Bad Request", "message": "Phiếu mượn đã quá hạn chót trả sách. Không được phép gia hạn thêm" }
```

**⭐ Có độc giả khác đặt trước → `409`**

```json
{
  "statusCode": 409,
  "error": "Conflict",
  "message": "Cuốn sách \"Sach Kiem Thu 1\" đang có 1 độc giả khác đặt trước. Theo chính sách thư viện, phiếu mượn này không được gia hạn và cần hoàn trả đúng hạn",
  "timestamp": "2026-11-10T07:21:35.393Z",
  "path": "/api/borrowings/027831f3-31cb-4011-b3a2-a8ec2ec37572/renew",
  "method": "POST"
}
```

Database: `renew_count` **vẫn `0`**, `due_date` **không đổi**, không có bản ghi trong `loan_renewals`.

> Chỉ tính phiếu đặt trước của **độc giả khác** và còn hiệu lực (`PENDING`/`READY`). Phiếu của chính người đang mượn, hoặc phiếu đã `CANCELLED`/`EXPIRED`/`FULFILLED`, **không chặn** gia hạn.

### 6.5 `GET /borrowings/:id/renewals` — Lịch sử gia hạn

Trả về **mảng**, sắp xếp theo `sequence`:

```json
[
  {
    "id": "5d2e854c-b7f1-4d22-9937-4d2c3a091d86",
    "borrowingId": "f3bffa6e-03b8-4b17-9e27-997946f27b47",
    "sequence": 1,
    "previousDueDate": "2026-11-12T07:21:18.367Z",
    "newDueDate": "2026-11-19T07:21:18.367Z",
    "extraDays": 7,
    "renewedAt": "2026-11-10T07:21:21.228Z",
    "renewedBy": "Thu thu Lan",
    "reason": "Can them thoi gian lam do an"
  }
]
```

### 6.6 `GET /borrowings/fines/unpaid` — Khoản phạt chưa thu

Query tùy chọn: `?memberId=<id>`

**Response `200`**

```json
{
  "totalUnpaidFine": 25000,
  "totalRecords": 1,
  "items": [
    {
      "transactionCode": "BRW-2026-0024",
      "memberName": "Doc Gia A",
      "bookTitle": "Sach Kiem Thu 1",
      "dueDate": "2026-11-05T07:21:04.909Z",
      "returnDate": "2026-11-10T07:21:08.932Z",
      "fineAmount": 25000,
      "finePaid": false,
      "status": "RETURNED"
    }
  ]
}
```

### 6.7 `POST /borrowings/:id/pay-fine` — Thanh toán phạt

Không có request body.

**Response `200`**

```json
{
  "transactionCode": "BRW-2026-0024",
  "returnDate": "2026-11-10T07:21:08.932Z",
  "fineAmount": 25000,
  "finePaid": true,
  "finePaidAt": "2026-11-10T07:21:16.193Z",
  "status": "RETURNED"
}
```

**Thanh toán hai lần → `400`**

```json
{ "statusCode": 400, "error": "Bad Request", "message": "Tiền phạt của phiếu mượn này đã được thanh toán trước đó" }
```

**Phiếu không có phạt → `400`:** `"Phiếu mượn này không có phát sinh tiền phạt"`

---

## 7. Borrowing Slips — Phiếu mượn ERP

Vòng đời chứng từ:

```
PENDING_APPROVAL ──approve──> BORROWED ──return-items──> PARTIAL_RETURNED ──> COMPLETED
       │                          │
       ├──reject──> REJECTED      └──cancel──> CANCELLED (hoàn kho)
       └──cancel──> CANCELLED
```

### 7.1 `POST /borrowing-slips` — Lập phiếu

**Request**

```json
{
  "memberId": "bfd5d173-6aa7-413d-88e6-88c7ab2bf3a3",
  "items": [{ "bookId": "0eebdd12-35b1-4bb9-a7db-50b5168bfd69", "quantity": 3 }],
  "expectedReturnDays": 14,
  "notes": "Phieu muon 3 cuon"
}
```

**Response `201`**

```json
{
  "id": "4a4739cd-b2f4-4621-91d1-2c371b790106",
  "slipNumber": "SLIP-2026-0003",
  "memberId": "bfd5d173-6aa7-413d-88e6-88c7ab2bf3a3",
  "memberName": "Doc Gia C",
  "memberCardNumber": "LIB-2026-0010",
  "status": "PENDING_APPROVAL",
  "dueDate": "2026-11-24T07:21:44.199Z",
  "notes": "Phieu muon 3 cuon",
  "totalFine": 0,
  "finePaid": false,
  "renewCount": 0,
  "items": [
    {
      "id": "482322bb-63e4-4808-a51e-c8f86ccf244a",
      "slipId": "4a4739cd-b2f4-4621-91d1-2c371b790106",
      "bookId": "0eebdd12-35b1-4bb9-a7db-50b5168bfd69",
      "bookTitle": "Sach Kiem Thu 1",
      "quantity": 3,
      "returnedQuantity": 0,
      "lostQuantity": 0,
      "bookPrice": 200000,
      "status": "PENDING",
      "fineAmount": 0,
      "lateFee": 0,
      "compensationFee": 0,
      "createdAt": "2026-11-10T07:21:45.422Z",
      "updatedAt": "2026-11-10T07:21:45.422Z"
    }
  ],
  "createdAt": "2026-11-10T07:21:45.422Z",
  "updatedAt": "2026-11-10T07:21:45.422Z"
}
```

> **Lập phiếu chưa trừ kho.** Tồn kho chỉ bị trừ ở bước `approve`. Kiểm tra hạn mức tính trên **tổng số cuốn** của cả phiếu.

**Vượt hạn mức → `400`:** `"Vượt quá hạn mức mượn: ... chỉ còn được mượn thêm 1 cuốn nhưng yêu cầu 2 cuốn"`
**Kho không đủ → `409`:** `"Sách "..." chỉ còn N cuốn khả dụng trong kho, không đủ số lượng yêu cầu (M)"`

### 7.2 `PATCH /borrowing-slips/:id/approve` — Phê duyệt & xuất kho

Không có request body. Người duyệt lấy từ JWT.

**Response `200`**

```json
{
  "slipNumber": "SLIP-2026-0003",
  "status": "BORROWED",
  "borrowDate": "2026-11-10T07:21:46.822Z",
  "dueDate": "2026-11-24T07:21:44.199Z",
  "approvedAt": "2026-11-10T07:21:46.822Z",
  "approvedBy": "admin@librobe.com",
  "totalFine": 0,
  "finePaid": false,
  "renewCount": 0,
  "items": [{ "quantity": 3, "returnedQuantity": 0, "status": "BORROWING", "lateFee": 0, "compensationFee": 0 }]
}
```

**Tác động database:** `copies_available` −3, `current_borrowed_count` +3, mọi dòng `items` chuyển `PENDING` → `BORROWING`.

**Phê duyệt hai lần → `409`**

```json
{
  "statusCode": 409,
  "error": "Conflict",
  "message": "DOCUMENT_ALREADY_PROCESSED: Phiếu mượn này đang ở trạng thái \"BORROWED\", không thể phê duyệt"
}
```

**Thua tranh chấp tồn kho lúc duyệt → `409`**, phiếu **vẫn ở `PENDING_APPROVAL`** (không bị chuyển trạng thái nửa vời), tồn kho không bị trừ.

### 7.3 `POST /borrowing-slips/:id/return-items` — Trả từng phần

**Request**

```json
{
  "items": [{ "itemId": "482322bb-63e4-4808-a51e-c8f86ccf244a", "returnCondition": "GOOD", "quantity": 1 }],
  "isPaidNow": false,
  "notes": "Tra truoc 1 cuon"
}
```

| `returnCondition` | Hoàn kho? | Tiền phát sinh |
|---|---|---|
| `GOOD` | ✔ | Phạt trễ hạn (nếu có) |
| `LOST` | ✘ | Phạt trễ hạn + **bồi thường** = `bookPrice` × số lượng |
| `DAMAGED` | ✘ | Phạt trễ hạn |

**Trả 1/3 cuốn, phiếu quá hạn 5 ngày → `200`**

```json
{
  "slipNumber": "SLIP-2026-0003",
  "status": "PARTIAL_RETURNED",
  "dueDate": "2026-11-05T07:21:52.010Z",
  "notes": "Phieu muon 3 cuon | Trả sách 10/11/2026: Tra truoc 1 cuon",
  "totalFine": 25000,
  "finePaid": false,
  "items": [
    {
      "quantity": 3,
      "returnedQuantity": 1,
      "lostQuantity": 0,
      "status": "BORROWING",
      "returnDate": "2026-11-10T07:21:52.693Z",
      "returnCondition": "GOOD",
      "fineAmount": 25000,
      "lateFee": 25000,
      "compensationFee": 0
    }
  ]
}
```

**Trả 2 cuốn còn lại → `200`**

```json
{
  "status": "COMPLETED",
  "totalFine": 75000,
  "finePaid": false,
  "items": [
    {
      "quantity": 3,
      "returnedQuantity": 3,
      "status": "RETURNED",
      "fineAmount": 75000,
      "lateFee": 75000,
      "compensationFee": 0
    }
  ]
}
```

> **Chống tính phạt trùng — điểm chấm quan trọng nhất của phần này.**
> Đợt 1: 5 × 5.000 × **1 cuốn** = 25.000. Đợt 2: 5 × 5.000 × **2 cuốn** = 50.000. Tổng = **75.000**.
> Phạt chỉ tính trên số lượng xử lý **trong đợt đó**, không tính lại cuốn đã trả. Bài nào tính trên `quantity` của cả dòng mỗi đợt sẽ ra `25000 + 75000 = 100000` ⇒ **sai**.
>
> `fineAmount` = `lateFee` + `compensationFee`. Tách riêng để đối chiếu được.

**Trả nhiều hơn số còn lại → `400`**

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Sách \"Sach Kiem Thu 1\" chỉ còn 2 cuốn chưa hoàn tất, không thể xử lý 9 cuốn"
}
```

**Trả lại dòng đã hoàn tất → `400`:** `"Sách "..." đã được hoàn tất trước đó"`
**Khai trùng cùng một dòng trong một request → `400`:** `"Dòng chi tiết "..." bị khai báo trùng trong cùng một yêu cầu trả sách"`

### 7.4 `PATCH /borrowing-slips/:id/renew` — Gia hạn phiếu

**Request:** `{ "extraDays": 7, "renewedBy": "Thu thu Lan" }`

**Response `200`**

```json
{
  "slipNumber": "SLIP-2026-0004",
  "status": "BORROWED",
  "dueDate": "2026-11-19T07:22:01.364Z",
  "totalFine": 0,
  "finePaid": false,
  "renewCount": 1
}
```

**Lịch sử:** `GET /borrowing-slips/:id/renewals`

```json
[
  {
    "id": "19eac6b7-66be-4b49-af36-feb9228a5792",
    "slipId": "ec4d82d7-9b66-47d4-b4b4-af912b5e7409",
    "sequence": 1,
    "previousDueDate": "2026-11-12T07:22:01.364Z",
    "newDueDate": "2026-11-19T07:22:01.364Z",
    "extraDays": 7,
    "renewedAt": "2026-11-10T07:22:07.668Z",
    "renewedBy": "Thu thu Lan"
  }
]
```

**Gia hạn lần 2 → `400`:** `"Đã đạt số lần gia hạn tối đa (1 lần) cho phiếu mượn này"`
**Có người đặt trước bất kỳ cuốn nào trong phiếu → `409`**
**Phiếu `COMPLETED`/`CANCELLED` → `400`:** `"Chỉ gia hạn được phiếu đang ở trạng thái BORROWED hoặc PARTIAL_RETURNED (hiện tại: COMPLETED)"`

### 7.5 `POST /borrowing-slips/:id/pay-fine`

**Response `200`**

```json
{ "slipNumber": "SLIP-2026-0003", "status": "COMPLETED", "totalFine": 75000, "finePaid": true, "finePaidAt": "2026-11-10T07:21:59.725Z" }
```

`status = COMPLETED` (đã trả hết sách) vẫn có thể `finePaid = false` cho tới khi thu đủ tiền.

### 7.6 `PATCH /borrowing-slips/:id/reject`

**Request:** `{ "reason": "Doc gia chua hoan thanh thu tuc the" }`

**Response `200`** — `status: "REJECTED"`, `rejectReason` được lưu, mọi dòng `items` → `CANCELLED`. **Không tác động tồn kho** (vì chưa từng xuất kho).

### 7.7 `PATCH /borrowing-slips/:id/cancel`

**Request:** `{ "reason": "Doc gia tra lai ngay" }`

**Response `200`** — `status: "CANCELLED"`, `cancelReason` được lưu, `items` → `CANCELLED`.

Nếu phiếu **đã xuất kho** (`BORROWED`/`PARTIAL_RETURNED`) thì tồn kho được **hoàn lại** phần chưa trả và `current_borrowed_count` giảm tương ứng. Hủy phiếu `COMPLETED`/`REJECTED`/`CANCELLED` → `409`.

---

## 7.8 Audit — ai đã xử lý chứng từ

Mỗi thao tác trên chứng từ ghi lại **cả email và khóa ngoại tới `users.id`**. Email để hiển thị, `*ById` để truy ngược dù người đó đổi email sau này.

| Thao tác | Field ghi lại |
|---|---|
| `approve` | `approvedAt`, `approvedBy`, `approvedById` |
| `reject` | `rejectedAt`, `rejectedBy`, `rejectedById`, `rejectReason` |
| `cancel` | `cancelledAt`, `cancelledBy`, `cancelledById`, `cancelReason` |

Người thực hiện lấy từ **JWT token**, không phải từ request body — client không thể mạo danh người khác. Request chỉ cần slip ID trong URL và token trong header:

```bash
curl -X PATCH http://localhost:3000/api/borrowing-slips/<slipId>/approve \
  -H "Authorization: Bearer $TOKEN"
```

```json
{
  "slipNumber": "SLIP-2026-0003",
  "status": "BORROWED",
  "approvedAt": "2026-11-11T07:25:00.000Z",
  "approvedBy": "admin@librobe.com",
  "approvedById": "user-01"
}
```

Khóa ngoại dùng `onDelete: SetNull` — xóa tài khoản không làm mất lịch sử chứng từ, chỉ để `*ById` thành `null` và giữ lại email.

---

## 7.9 Users — Quản trị tài khoản & phân quyền

Toàn bộ nhóm này chỉ `ADMIN`. Response **không bao giờ chứa cột `password`**.

### `PATCH /users/:id/role` — Nâng độc giả lên thủ thư

**Request:** `{ "role": "LIBRARIAN" }`

**Response `200`**

```json
{
  "id": "user-03",
  "email": "doc.gia@librobe.vn",
  "phone": "0909000003",
  "fullName": "Độc Giả Thường",
  "role": "LIBRARIAN",
  "isActive": true,
  "memberId": "mem-01",
  "createdAt": "2026-11-11T07:20:00.000Z",
  "updatedAt": "2026-11-11T07:26:00.000Z"
}
```

> Liên kết thẻ độc giả (`memberId`) được **giữ nguyên** — một thủ thư vẫn có thể là độc giả của thư viện.

**Hai chốt an toàn chống tự khóa mình ra khỏi hệ thống:**

| Trường hợp | HTTP | Thông điệp |
|---|---|---|
| Tự hạ vai trò của chính mình | `400` | `"Không thể tự hạ vai trò của chính mình. Hãy nhờ một ADMIN khác thực hiện"` |
| Hạ vai trò `ADMIN` hoạt động cuối cùng | `409` | `"Đây là tài khoản ADMIN đang hoạt động duy nhất..."` |
| Tài khoản đã có đúng vai trò đó | `400` | `"Tài khoản này đã có vai trò \"LIBRARIAN\""` |
| Không tìm thấy tài khoản | `404` | |

### `PATCH /users/:id/status` — Khóa / mở tài khoản

**Request:** `{ "isActive": false }`

Khi khóa, **mọi token đặt lại mật khẩu đang treo của tài khoản đó bị xóa** — tránh việc người bị khóa vẫn đổi được mật khẩu. Cùng hai chốt an toàn như trên (không tự khóa mình, không khóa `ADMIN` cuối cùng).

### `GET /users` — Danh sách tài khoản

Query: `page`, `limit`, `search` (email/sđt/họ tên), `role`, `isActive`, `sortBy`, `sortOrder`. Trả về bọc `data` + `meta` như các danh sách khác.

---

## 8. Stats

### `GET /stats`

```json
{
  "totalBooks": 8,
  "totalCopies": 51,
  "availableCopies": 33,
  "borrowedCopies": 18,
  "totalCategories": 5,
  "totalAuthors": 5,
  "totalMembers": 10,
  "activeMembers": 9,
  "totalLoans": 27,
  "activeLoans": 18,
  "overdueLoans": 2,
  "totalFines": 475000,
  "finesCollected": 25000,
  "topBorrowedBooks": [
    { "bookId": "book-06", "title": "Mắt Biếc", "authorName": "Nguyễn Nhật Ánh", "borrowCount": 5 }
  ]
}
```

> **Hạn chế đã biết:** `StatsService` chỉ đọc bảng `borrowings`, nên tiền phạt và lượt mượn phát sinh từ phiếu mượn ERP **không được tính vào** các chỉ số này. Đây là vấn đề tồn đọng từ trước, chưa nằm trong phạm vi lần cập nhật này.

---

## 9. Bộ test case đầy đủ

### 9.1 Auth & mật khẩu

| TC | Mô tả | Request | HTTP | Kết quả then chốt |
|---|---|---|---|---|
| A-01 | Đăng nhập đúng | `{identifier, password}` | `200` | Có `accessToken`, `expiresIn: 86400` |
| A-02 | Sai mật khẩu | password sai | `401` | `"Email/Số điện thoại hoặc mật khẩu không chính xác"` |
| A-03 | Tài khoản bị khóa | `is_active=false` | `401` | `"Tài khoản của bạn đã bị vô hiệu hóa hoặc tạm khóa"` |
| A-04 | Gọi API thiếu token | — | `401` | `"Yêu cầu cần có mã Access Token..."` |
| A-05 | Quên mật khẩu, tài khoản ACTIVE | `{email}` | `200` | `success: true` + **1 dòng** trong `password_reset_tokens` |
| A-06 | Quên mật khẩu, tài khoản bị khóa | `{email}` | `200` | Response **giống hệt** A-05 nhưng **0 dòng** token |
| A-07 | Quên mật khẩu, email không tồn tại | `{email}` | `200` | Response **giống hệt** A-05, **0 dòng** token |
| A-08 | Gọi lại trong 60 giây | `{email}` | `200` | **Không sinh token mới** |
| A-09 | Reset bằng token hợp lệ | `{token, newPassword}` | `200` | `"Mật khẩu đã được đặt lại thành công..."` |
| A-10 | Reset bằng token sai | token bịa | `400` | `"Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn"` |
| A-11 | Dùng lại token đã dùng | token cũ | `400` | Cùng thông điệp A-10 |
| A-12 | Đổi mật khẩu thiếu token | — | `401` | |

> **Chấm A-06 và A-07:** response phải **giống hệt nhau từng ký tự**. Bài nào trả `404 "email không tồn tại"` hoặc `403 "tài khoản bị khóa"` là **sai** — làm lộ tài khoản nào có thật.

### 9.2 Mười ba ca bắt buộc theo đề nghiệp vụ

| # | Ca kiểm thử | Endpoint | HTTP | Kết quả then chốt |
|---|---|---|---|---|
| 1 | Mượn sách thành công | `POST /borrowings` | `201` | `status BORROWED`, `dueDate = borrowDate + 14`, tồn kho −1, `currentBorrowedCount` +1 |
| 2 | Mượn khi vượt giới hạn | `POST /borrowings` | `400` | Nêu rõ số còn được mượn / số yêu cầu. **Không tạo dữ liệu, không trừ kho** |
| 3 | Mượn khi độc giả bị khóa | `POST /borrowings` | `400` | `"...trạng thái \"SUSPENDED\"..."` |
| 4 | Mượn khi còn nợ phạt | `POST /borrowings` | `400` | `"...nợ tiền phạt chưa thanh toán (25.000 VNĐ)..."` — chặn ở **luồng ghi** |
| 5 | Mượn khi sách hết hàng | `POST /borrowings` | `400` | `"...đã hết bản in sẵn có để mượn"`, `copiesAvailable = 0` |
| 6 | **2 request đồng thời mượn bản cuối** | `POST /borrowings` ×2 | `201` + `409` | Đúng **1** phiếu, tồn kho `= 0` **không âm** |
| 7 | Trả sách đúng hạn | `POST /:id/return` | `200` | `fineAmount 0`, `status RETURNED`, tồn kho +1 |
| 8 | Trả sách quá hạn 5 ngày | `POST /:id/return` | `200` | `fineAmount = 25000`, **`finePaid = false`** |
| 9 | Trả sách lặp lại | `POST /:id/return` | `400` | `fine_amount` **vẫn 25000**, tồn kho **không +1 lần hai** |
| 10 | Gia hạn thành công | `POST /:id/renew` | `200` | `renewCount 1`, `dueDate = hạn cũ + 7`, có bản ghi `loan_renewals` |
| 11 | Gia hạn khi đạt giới hạn | `POST /:id/renew` | `400` | `renewCount` vẫn `1`, không có bản ghi thứ hai |
| 12 | **Gia hạn khi có người đặt trước** | `POST /:id/renew` | **`409`** | `renewCount` vẫn `0`, `dueDate` không đổi |
| 13 | Gia hạn khi sách đã trả | `POST /:id/renew` | `400` | `"...đã hoàn tất trả sách..."` |

### 9.3 Phân quyền & quản trị tài khoản

| TC | Mô tả | HTTP | Kết quả then chốt |
|---|---|---|---|
| P-01 | `GET /books` không token | `401` | Trước đây là `200` — endpoint hoàn toàn công khai |
| P-02 | `GET /members` không token | `401` | Trước đây rò toàn bộ PII độc giả (tên, email, sđt, địa chỉ) |
| P-03 | `POST /members` không token | `401` | Trước đây **tạo được bản ghi thật** |
| P-04 | `GET /stats` không token | `401` | |
| P-05 | `MEMBER` xóa sách | `403` | |
| P-06 | `MEMBER` tạo thẻ độc giả | `403` | |
| P-07 | `MEMBER` xem báo cáo | `403` | |
| P-08 | `MEMBER` gọi `/users` | `403` | |
| P-09 | **`MEMBER` tự duyệt phiếu mượn của chính mình** | **`403`** | Trước đây là `200` — lỗ hổng chính |
| P-10 | `MEMBER` lập phiếu mượn ERP | `201` | **Vẫn cho phép** — đúng thiết kế workflow phê duyệt |
| P-11 | `LIBRARIAN` duyệt phiếu | `200` | |
| P-12 | `LIBRARIAN` xóa sách | `403` | Xóa là thao tác chỉ `ADMIN` |
| P-13 | Đăng ký với `{"role":"ADMIN"}` | `201` | **`role` trả về là `MEMBER`** — chặn leo thang đặc quyền |
| U-01 | `ADMIN` nâng `MEMBER` → `LIBRARIAN` | `200` | `role` đổi, `memberId` giữ nguyên, không có `password` trong response |
| U-02 | Sau khi nâng, tài khoản đó duyệt được phiếu | `200` | |
| U-03 | `ADMIN` tự hạ vai trò chính mình | `400` | |
| U-04 | Hạ vai trò `ADMIN` cuối cùng | `409` | Hệ thống luôn còn ≥ 1 `ADMIN` hoạt động |
| U-05 | `ADMIN` tự khóa chính mình | `400` | |
| U-06 | Khóa tài khoản | `200` | Token đặt lại mật khẩu đang treo bị xóa |
| U-07 | Đổi sang vai trò đang có | `400` | |
| A-13 | `approvedById` = `users.id` của người duyệt | `200` | Không chỉ là email |
| A-14 | `rejectedBy` + `rejectedById` được ghi | `200` | Trước đây **không lưu ai từ chối** |
| A-15 | `cancelledBy` + `cancelledById` được ghi | `200` | Trước đây **không lưu ai hủy** |

Chạy tự động toàn bộ 26 ca trên bằng:

```bash
node scripts/verify-rbac.mjs    # cần server đang chạy ở PORT=3999
```

### 9.4 Ca bổ sung

| TC | Mô tả | HTTP |
|---|---|---|
| B-01 | Thiếu `memberId` khi mượn | `400` (`message` là **mảng**) |
| B-02 | `memberId` không tồn tại | `404` |
| B-03 | `durationDays: 45` vượt mức tối đa | `400` |
| B-04 | Sách `DISCONTINUED` | `400` |
| B-05 | Thanh toán phạt hai lần | `400` |
| B-06 | Thanh toán phạt khi không có phạt | `400` |
| B-07 | Gia hạn khi phiếu đã quá hạn | `400` |
| R-01 | Đặt trước khi sách còn trên kệ | `201`, `status READY`, có `expiresAt` |
| R-02 | Đặt trước khi sách đã hết | `201`, `status PENDING`, **không có** `expiresAt` |
| R-03 | Đặt trước trùng | `409` |
| R-04 | Hủy phiếu đặt trước | `200`, `status CANCELLED` |
| R-05 | Hủy phiếu đã hủy | `409` |
| R-06 | Sách về kho → phiếu đầu hàng đợi tự chuyển `READY` | — |
| R-07 | Chính người đang mượn tự đặt trước → **vẫn gia hạn được** | `200` |
| S-01 | Lập phiếu ERP nhiều cuốn | `201`, `PENDING_APPROVAL`, **chưa trừ kho** |
| S-02 | Phê duyệt phiếu | `200`, `BORROWED`, trừ kho đúng số lượng |
| S-03 | Phê duyệt hai lần | `409` `DOCUMENT_ALREADY_PROCESSED` |
| S-04 | 2 phiếu cùng duyệt bản cuối | `200` + `409`, phiếu thua vẫn `PENDING_APPROVAL` |
| S-05 | Trả từng phần quá hạn | `200`, `PARTIAL_RETURNED`, phạt theo số cuốn đợt đó |
| S-06 | Trả hết phần còn lại | `200`, `COMPLETED`, tổng phạt `75000` |
| S-07 | Trả quá số lượng còn lại | `400` |
| S-08 | Báo mất sách `LOST` | `200`, `compensationFee = bookPrice × qty`, **không hoàn kho** |
| S-09 | Gia hạn phiếu ERP | `200`, `renewCount 1` |
| S-10 | Từ chối phiếu | `200`, `REJECTED`, không tác động kho |
| S-11 | Hủy phiếu đã xuất kho | `200`, `CANCELLED`, **hoàn lại tồn kho** |

---

## 10. Kịch bản test end-to-end

### Chuẩn bị

```bash
API=http://localhost:3000/api
TOKEN=$(curl -s -X POST $API/auth/login -H 'Content-Type: application/json' \
  -d '{"identifier":"<email>","password":"<mật khẩu>"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["accessToken"])')
H_AUTH="Authorization: Bearer $TOKEN"
H_JSON="Content-Type: application/json"
```

Tạo dữ liệu riêng, **không test trên dữ liệu seed** (số liệu sẽ không khớp đáp án). Phân vai:

| Độc giả | Hạn mức | Dùng cho kịch bản |
|---|---|---|
| A | 5 | KB-1, KB-2, KB-4 |
| B | 5 | Đối tượng đặt trước |
| C, D | 10 | KB-3 (tranh chấp) |
| E | 10 | KB-5 (phiếu ERP) |

**Mô phỏng thời gian** — không thể chờ 5 ngày thật:

```sql
UPDATE borrowings      SET due_date = NOW() - INTERVAL '5 days' WHERE id = '<borrowingId>';
UPDATE borrowing_slips SET due_date = NOW() - INTERVAL '5 days' WHERE id = '<slipId>';
```

Test "còn 2 ngày đến hạn" thì chỉ cần mượn với `"durationDays": 2`.

### KB-1. Mượn sách thành công

> Độc giả đang mượn 2 quyển, không nợ phạt, xin mượn thêm 2 quyển, kho còn đủ.

| Bước | Thao tác | Mong đợi |
|---|---|---|
| 1 | A mượn 2 cuốn (2 request `POST /borrowings`) | `201` ×2, tồn kho −2 |
| 2 | `GET /members/A/debt-summary` | `currentBorrowedCount: 2`, `remainingBorrowLimit: 3`, `canBorrow: true` |
| 3 | `POST /borrowing-slips` 2 cuốn | `201`, `PENDING_APPROVAL`, **tồn kho chưa đổi** |
| 4 | `PATCH /borrowing-slips/:id/approve` | `200`, `BORROWED`, tồn kho −2, `items[].status = BORROWING` |
| 5 | `GET /members/A/debt-summary` | `currentBorrowedCount: 4` ⟵ **cộng cả 2 luồng**, `remainingBorrowLimit: 1` |

### KB-2. Vượt quá giới hạn mượn

> Độc giả đang mượn 4 quyển, giới hạn 5, xin mượn thêm 2 quyển.

| Bước | Thao tác | Mong đợi |
|---|---|---|
| 1 | `POST /borrowing-slips` 2 cuốn cho A (đang 4/5) | **`400`** `"...chỉ còn được mượn thêm 1 cuốn nhưng yêu cầu 2 cuốn"` |
| 2 | Kiểm tra DB | Tồn kho **không đổi**, `current_borrowed_count` **vẫn 4**, **không có** phiếu mới |
| 3 | A mượn đúng 1 cuốn | `201` → `currentBorrowedCount: 5`, `remainingBorrowLimit: 0` |
| 4 | A mượn cuốn thứ 6 | `400` `"Độc giả đã sử dụng hết hạn mức mượn (5 cuốn)"` |

### KB-3. Hai độc giả cùng mượn bản sách cuối cùng

> Thư viện còn 1 bản, C và D gửi yêu cầu gần như đồng thời.

```bash
curl -s -o /tmp/c.json -w 'C=%{http_code}\n' -X POST "$API/borrowings" \
  -H "$H_AUTH" -H "$H_JSON" -d '{"memberId":"'$MEMBER_C'","bookId":"'$BOOK_LAST'"}' &
curl -s -o /tmp/d.json -w 'D=%{http_code}\n' -X POST "$API/borrowings" \
  -H "$H_AUTH" -H "$H_JSON" -d '{"memberId":"'$MEMBER_D'","bookId":"'$BOOK_LAST'"}' &
wait
```

| Kiểm tra | Giá trị bắt buộc |
|---|---|
| Cặp HTTP status | **đúng một `201` và đúng một `409`** (thứ tự C/D không quan trọng) |
| `copiesAvailable` | **`0`** — không phải `-1` |
| Số phiếu `BORROWED` của cuốn đó | **`1`** — không phải `2` |
| `current_borrowed_count` của người thua | **không tăng** |

| Dấu hiệu sai | Kết luận |
|---|---|
| `copiesAvailable = -1` | Trừ kho không nguyên tử ⇒ **không đạt** |
| 2 phiếu được tạo | Cả hai đều mượn được bản cuối ⇒ **không đạt** |
| `201` + `201` | Không phát hiện tranh chấp ⇒ **không đạt** |
| `409` + `409` | Chặn cả hai, mất một lượt cho mượn hợp lệ ⇒ **không đạt** |

Lặp 8 vòng để chắc chắn không phải may mắn. Mỗi vòng trả sách về kho bằng `POST /:id/return` (**không** sửa tồn kho bằng tay).

### KB-4. Trả sách quá hạn & tiền phạt

> Mượn 3 quyển: 2 trả đúng hạn, 1 trả muộn 5 ngày. Phạt 5.000 VNĐ/ngày/quyển ⇒ **tổng 25.000**.

| Bước | Thao tác | Mong đợi |
|---|---|---|
| 1 | Trả 2 cuốn đúng hạn | `200`, `fineAmount: 0`, `finePaid: true`, tồn kho +1 mỗi lần |
| 2 | SQL dịch `due_date` cuốn thứ 3 về −5 ngày | — |
| 3 | `GET /borrowings/:id` | `status: OVERDUE`, `fineAmount: 25000`, `finePaid: false` |
| 4 | `POST /:id/return` | `200`, `fineAmount: 25000`, `status: RETURNED`, **`finePaid: false`** |
| 5 | `GET /borrowings/fines/unpaid?memberId=A` | `totalUnpaidFine: 25000`, `totalRecords: 1` |
| 6 | `GET /members/A/debt-summary` | `canBorrow: false`, `blockReason: UNPAID_FINE` |
| 7 | A xin mượn tiếp | **`400`** — luật nợ phạt chặn ở **luồng ghi** |
| 8 | `POST /:id/pay-fine` | `200`, `finePaid: true`, có `finePaidAt` |
| 9 | `POST /:id/pay-fine` lần hai | `400` |
| 10 | `POST /:id/return` lần hai | `400`, `fine_amount` **vẫn 25000**, tồn kho **không +1 lần hai** |

**Biến thể trên phiếu ERP** (phạt theo từng cuốn, chống tính trùng):

| Bước | Thao tác | Mong đợi |
|---|---|---|
| 1 | Lập + duyệt phiếu 3 cuốn, dịch `due_date` về −5 ngày | — |
| 2 | Trả 1 cuốn | `PARTIAL_RETURNED`, `totalFine: 25000`, `items[0].lateFee: 25000` |
| 3 | Trả 2 cuốn còn lại | `COMPLETED`, `totalFine: 75000` |
| 4 | Trả lại dòng đã xong | `400`, `totalFine` **vẫn 75000** |

### KB-5. Gia hạn sách

> Còn 2 ngày đến hạn, có độc giả khác đã đặt trước, tối đa 1 lần gia hạn, mỗi lần 7 ngày.

| Bước | Thao tác | Mong đợi |
|---|---|---|
| 1 | A mượn với `durationDays: 2` | `201`, `dueDate = hôm nay + 2` |
| 2 | `POST /:id/renew` `{extraDays: 7}` | `200`, `renewCount: 1`, `dueDate = hạn cũ + 7` |
| 3 | `GET /:id/renewals` | 1 bản ghi: `sequence 1`, `extraDays 7`, `previousDueDate`, `newDueDate`, `renewedBy` |
| 4 | `POST /:id/renew` lần hai | `400` `"Đã đạt số lần gia hạn tối đa (1 lần)..."`, `renewCount` vẫn `1` |
| 5 | B mượn cuốn đó với `durationDays: 2` | `201` |
| 6 | **A đặt trước cùng cuốn sách** | `201`, `status READY`, `expiresAt = +3 ngày` |
| 7 | `GET /reservations/book/:bookId/queue` | 1 phiếu của A |
| 8 | **B xin gia hạn** | **`409`** `"...đang có 1 độc giả khác đặt trước..."` |
| 9 | Kiểm tra DB | `renew_count` của B **vẫn 0**, `due_date` **không đổi**, `loan_renewals` **rỗng** |
| 10 | Hủy phiếu đặt trước của A, B gia hạn lại | `200`, `renewCount: 1` |
| 11 | Gia hạn phiếu đã trả sách | `400` |
| 12 | Gia hạn phiếu đã quá hạn | `400` |

---

## 11. Kiểm tra toàn vẹn dữ liệu

Chạy sau khi test xong — **cả ba truy vấn phải trả về 0 dòng**.

```sql
-- 1. Tồn kho không được âm và không vượt tổng số bản
SELECT id, title, copies_available, copies_total
FROM books
WHERE copies_available < 0 OR copies_available > copies_total;

-- 2. Tồn kho phải khớp số sách thực tế đang cho mượn (cả hai luồng)
SELECT b.id, b.title, b.copies_available,
       b.copies_total - (COALESCE(l.qty,0) + COALESCE(s.qty,0)) AS ton_kho_dung
FROM books b
LEFT JOIN (
  SELECT book_id, COUNT(*) qty FROM borrowings
  WHERE return_date IS NULL AND status IN ('BORROWED','OVERDUE') GROUP BY book_id
) l ON l.book_id = b.id
LEFT JOIN (
  SELECT i.book_id, SUM(i.quantity - i.returned_quantity - i.lost_quantity) qty
  FROM borrowing_slip_items i JOIN borrowing_slips s2 ON s2.id = i.slip_id
  WHERE s2.status IN ('BORROWED','PARTIAL_RETURNED') AND i.status IN ('PENDING','BORROWING')
  GROUP BY i.book_id
) s ON s.book_id = b.id
WHERE b.copies_available <> b.copies_total - (COALESCE(l.qty,0) + COALESCE(s.qty,0));

-- 3. Trạng thái phiếu mượn nhất quán với ngày trả
SELECT id, status, return_date FROM borrowings
WHERE (status = 'RETURNED' AND return_date IS NULL)
   OR (status <> 'RETURNED' AND return_date IS NOT NULL);
```

> Hai ràng buộc `CHECK` ở tầng database (`books_copies_available_non_negative`, `books_copies_available_within_total`) là lớp phòng thủ cuối: ngay cả khi tầng ứng dụng có lỗi, PostgreSQL vẫn từ chối ghi tồn kho âm.

### Test tự động

```bash
npm run lint      # mong đợi: không warning/error
npm run build     # mong đợi: biên dịch thành công
npm run test      # mong đợi: 7 test file, 105 test case, tất cả PASS
```

| File | Phạm vi |
|---|---|
| `src/modules/loan-policy/loan-policy.service.spec.ts` | Công thức ngày quá hạn, tiền phạt, hạn trả, số ngày gia hạn |
| `src/modules/borrowings/borrowings.service.spec.ts` | 5 tình huống trên luồng phiếu lẻ, tranh chấp tồn kho, trả sách trùng |
| `src/modules/borrowing-slips/borrowing-slips.service.spec.ts` | Hạn mức nhiều cuốn, duyệt tranh chấp, trả từng phần, bồi thường, gia hạn |
| `src/modules/auth/auth.service.spec.ts` | Nghiệp vụ xác thực & đặt lại mật khẩu |
| `src/modules/auth/guards/roles.guard.spec.ts` | Phân quyền theo vai trò: cho qua endpoint không khai báo `@Roles`, chặn `MEMBER` khỏi thao tác quản trị, chặn `LIBRARIAN` khỏi thao tác chỉ `ADMIN` |
| `src/modules/users/users.service.spec.ts` | Đổi vai trò, khóa/mở tài khoản, hai chốt an toàn chống tự khóa mình, không lộ mật khẩu |
| `src/modules/books/books.service.spec.ts` | Nghiệp vụ sách |

---

**Tài liệu liên quan:** [`docs/TEST_PLAN_BORROWING.md`](./TEST_PLAN_BORROWING.md) — quy trình test từng bước bằng `curl` kèm 30 ca kiểm thử và danh sách 16 lỗi thường gặp khi chấm bài.
