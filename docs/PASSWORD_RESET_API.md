# Hướng dẫn tích hợp API Quên mật khẩu

Tài liệu này dành cho đội frontend tích hợp luồng quên và đặt lại mật khẩu của Librobe.

## 1. Tổng quan

Luồng gồm hai request độc lập:

1. Frontend gửi email tới `POST /api/auth/forgot-password`.
2. Backend gửi email nếu tài khoản tồn tại và trả về thông báo chung.
3. Người dùng mở liên kết có dạng `/admin?resetToken=<token>`.
4. Frontend lấy `resetToken` từ query string và gửi mật khẩu mới tới `POST /api/auth/reset-password`.
5. Người dùng đăng nhập lại bằng API login hiện có.

Hai endpoint này là endpoint public, không cần header `Authorization`. Các API đăng nhập, đăng ký, profile và đổi mật khẩu hiện tại không thay đổi.

Base URL khi chạy local là `http://localhost:3000`; production dùng domain backend đã cấu hình.

## 2. Yêu cầu chung

```http
Content-Type: application/json
```

Không gửi mật khẩu hoặc token trong query của API. Token chỉ xuất hiện trong liên kết email do backend tạo.

Quy tắc mật khẩu mới giống quy tắc đăng ký hiện tại: từ 6 đến 50 ký tự.

## 3. Gửi yêu cầu quên mật khẩu

### Request

```http
POST /api/auth/forgot-password
Content-Type: application/json
```

```json
{
  "email": "user@example.com"
}
```

### Response thành công

HTTP `200 OK` được trả về cho cả email tồn tại và email không tồn tại:

```json
{
  "success": true,
  "message": "Nếu email tồn tại, hướng dẫn đặt lại mật khẩu đã được gửi."
}
```

Frontend luôn nên hiển thị đúng thông báo chung này. Không hiển thị câu “email không tồn tại”, vì điều đó làm lộ danh sách tài khoản.

Backend giới hạn việc tạo token mới cho cùng một tài khoản trong khoảng 60 giây. Nếu người dùng chưa nhận được email, frontend nên chờ rồi yêu cầu lại thay vì gửi liên tục.

### Request không hợp lệ

HTTP `400 Bad Request` nếu email trống hoặc sai định dạng:

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": [
    "Địa chỉ email không đúng định dạng"
  ],
  "timestamp": "2026-11-09T10:00:00.000Z",
  "path": "/api/auth/forgot-password",
  "method": "POST"
}
```

## 4. Đặt lại mật khẩu

### Lấy token từ liên kết email

Nếu URL hiện tại là:

```text
/admin?resetToken=abc123...
```

Frontend đọc token bằng:

```js
const token = new URLSearchParams(window.location.search).get('resetToken');
```

Sau khi đọc token, nên xóa query khỏi thanh địa chỉ bằng `history.replaceState` sau khi reset thành công.

### Request

```http
POST /api/auth/reset-password
Content-Type: application/json
```

```json
{
  "token": "abc123...",
  "newPassword": "NewPassword@123"
}
```

### Response thành công

HTTP `200 OK`:

```json
{
  "success": true,
  "message": "Mật khẩu đã được đặt lại thành công. Vui lòng đăng nhập lại."
}
```

Frontend nên xóa token đã lưu, xóa session hiện tại nếu có và chuyển người dùng về form đăng nhập. API không tự động cấp JWT mới.

### Token không hợp lệ hoặc hết hạn

HTTP `400 Bad Request`:

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn",
  "timestamp": "2026-11-09T10:00:00.000Z",
  "path": "/api/auth/reset-password",
  "method": "POST"
}
```

Token có thời hạn mặc định 20 phút và chỉ sử dụng được một lần. Frontend nên cho phép người dùng quay lại form quên mật khẩu để yêu cầu liên kết mới.

### Mật khẩu không hợp lệ

HTTP `400 Bad Request` nếu `newPassword` ngắn hơn 6 hoặc dài hơn 50 ký tự. `message` có thể là mảng do `ValidationPipe` trả về.

## 5. Mapping vào giao diện hiện tại

Giao diện hiện tại là vanilla JavaScript trong `public/`:

| Trạng thái | Thành phần | API |
| :--- | :--- | :--- |
| Đăng nhập | `#login-form` | `POST /api/auth/login` |
| Quên mật khẩu | `#forgot-password-form` | `POST /api/auth/forgot-password` |
| Đặt lại mật khẩu | `#reset-password-form` | `POST /api/auth/reset-password` |

Các trường frontend:

| Trường | Kiểu | Bắt buộc | Gửi lên |
| :--- | :--- | :--- | :--- |
| `#forgot-email` | email | Có | `email` |
| `#reset-password` | password | Có | `newPassword` |
| `#reset-password-confirm` | password | Có | Không gửi; chỉ kiểm tra trùng ở frontend |
| Query `resetToken` | string | Có khi reset | `token` |

Khi API forgot trả về lỗi mạng hoặc provider email gặp lỗi, frontend vẫn nên hiển thị thông báo chung; backend cố ý không phân biệt email tồn tại để chống account enumeration.

## 6. Ví dụ cURL

```bash
curl -X POST http://localhost:3000/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com"}'
```

```bash
curl -X POST http://localhost:3000/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{"token":"abc123...","newPassword":"NewPassword@123"}'
```

## 7. Cấu hình email

```env
APP_BASE_URL=https://your-domain.com
MAIL_PROVIDER=resend
RESEND_API_KEY=your-resend-api-key
MAIL_FROM=Librobe <no-reply@your-domain.com>
RESET_TOKEN_TTL_MINUTES=20
```

Local có thể đặt `MAIL_PROVIDER=console`; link reset sẽ xuất hiện trong log server. Không dùng `console` trên production.

## 8. Lưu ý tài khoản Master Admin

Tài khoản đăng nhập bằng `ADMIN_USERNAME` và `ADMIN_PASSWORD` trong biến môi trường không thuộc luồng reset email này. Tài khoản database có email, như admin hoặc librarian, mới nhận được liên kết reset. Master Admin vẫn đổi bằng cách cập nhật `ADMIN_PASSWORD` trên môi trường triển khai.
