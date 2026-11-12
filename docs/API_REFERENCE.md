# TÀI LIỆU API REFERENCE (LIBROBE)

Backend Librobe cung cấp hệ thống RESTful API hoàn chỉnh với tiền tố toàn cục `/api`. 
Toàn bộ API được mô tả trực quan và hỗ trợ test trực tiếp trên Swagger UI tại đường dẫn:
👉 **`https://api.leorank.site/api/docs`** (hoặc `http://localhost:3000/api/docs`)

---

## 1. Cơ Chế Xác Thực (Authentication)

* Hầu hết các endpoint quản trị yêu cầu gửi kèm Bearer JWT Token trong Header:
  ```http
  Authorization: Bearer <your_access_token>
  ```
* Token có hiệu lực trong **24 giờ** kể từ khi đăng nhập thành công.

---

## 2. Danh Sách Endpoints Theo Module

### A. Phân Hệ Xác Thực (`/api/auth`)

| Phương thức | Endpoint | Yêu cầu Token | Mô tả |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/login` | Không | Đăng nhập bằng Email / SĐT / Username + Mật khẩu |
| `POST` | `/api/auth/register` | Không | Đăng ký tài khoản độc giả hoặc nhân viên |
| `POST` | `/api/auth/forgot-password` | Không | Gửi email chứa liên kết đặt lại mật khẩu |
| `POST` | `/api/auth/reset-password` | Không | Đặt mật khẩu mới bằng token một lần |
| `GET` | `/api/auth/me` | **Có** | Lấy thông tin hồ sơ của tài khoản đang đăng nhập |
| `POST` | `/api/auth/change-password` | **Có** | Đổi mật khẩu tài khoản |

Chi tiết đầy đủ về request, response, lỗi và mapping frontend của hai endpoint reset mật khẩu xem tại [`PASSWORD_RESET_API.md`](PASSWORD_RESET_API.md).

`GET /api/auth/me` trả thêm `memberId` cho tài khoản có vai trò `MEMBER`. Với tài khoản `ADMIN` hoặc `LIBRARIAN`, trường này có giá trị `null`.

#### Ví dụ Request Đăng Nhập (`POST /api/auth/login`):
```json
{
  "identifier": "chien",
  "password": "Chienhpt102$$"
}
```
*Hệ thống hỗ trợ cả tài khoản Master Admin (`ADMIN_USERNAME` từ `.env`) và tài khoản seed database (`admin@librobe.com` / `Admin@123`).*

---

### B. Phân Hệ Sách & Kho Thư Viện (`/api/books`)

| Phương thức | Endpoint | Yêu cầu Token | Mô tả |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/books` | Không | Danh sách sách có phân trang, tìm kiếm, lọc thể loại/tác giả |
| `GET` | `/api/books/:id` | Không | Xem chi tiết 1 cuốn sách theo mã ID |
| `GET` | `/api/books/isbn/:isbn` | Không | Tra cứu nhanh sách theo mã chuẩn ISBN |
| `POST` | `/api/books` | **Có (Admin)** | Thêm đầu sách mới vào kho thư viện |
| `PATCH` | `/api/books/:id` | **Có (Admin)** | Cập nhật thông tin hoặc số lượng bản in tồn kho |
| `DELETE` | `/api/books/:id` | **Có (Admin)** | Xóa sách khỏi thư viện (nếu không có ai đang mượn) |

#### Query Parameters Hỗ Trợ (`GET /api/books`):
* `page`: Trang hiện tại (mặc định: 1)
* `limit`: Số mục mỗi trang (mặc định: 10, tối đa: 100)
* `search`: Từ khóa tìm kiếm (tiêu đề, tác giả, ISBN, vị trí kệ)
* `categoryId`: Lọc theo ID thể loại
* `authorId`: Lọc theo ID tác giả
* `sortBy`: Trường sắp xếp (mặc định: `createdAt`)
* `sortOrder`: `ASC` hoặc `DESC` (mặc định: `DESC`)

---

### C. Phân Hệ Mượn / Trả Sách (`/api/borrowings`)

| Phương thức | Endpoint | Yêu cầu Token | Mô tả |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/borrowings` | **Có** | Danh sách tất cả phiếu mượn (lọc theo trạng thái) |
| `GET` | `/api/borrowings/overdue` | **Có** | Danh sách các phiếu mượn quá hạn cần thu hồi |
| `GET` | `/api/borrowings/:id` | **Có** | Xem chi tiết 1 phiếu mượn |
| `POST` | `/api/borrowings` | **Có** | Tạo phiếu mượn sách mới cho độc giả |
| `POST` | `/api/borrowings/:id/return`| **Có** | Hoàn trả sách về kho, tự động tính tiền phạt trễ hạn |
| `POST` | `/api/borrowings/:id/renew` | **Có** | Gia hạn theo chính sách thư viện; MEMBER chỉ gia hạn lượt mượn của mình |
| `POST` | `/api/borrowings/:id/pay-fine`| **Có** | Ghi nhận độc giả đã thanh toán tiền phạt quá hạn |

#### Gia hạn và thông tin khóa nút trên Flutter

Áp dụng cho `POST /api/borrowings/:id/renew` và `PATCH /api/borrowing-slips/:id/renew`:

- `ADMIN`, `LIBRARIAN` được gia hạn thay độc giả, vẫn phải thỏa điều kiện gia hạn.
- `MEMBER` chỉ được gia hạn khi `memberId` của tài khoản đã xác thực khớp `memberId` của phiếu. Không khớp hoặc chưa liên kết thẻ độc giả: **403 Forbidden**.
- Danh tính được lấy từ người dùng mà `JwtAuthGuard` xác thực qua JWT. Không sử dụng `memberId` hay `role` trong body để cấp quyền. Lịch sử `renewedBy` lưu ID tài khoản này; trường `renewedBy` do client gửi lên đã ngừng sử dụng.

`GET /api/borrowings/:id` và `GET /api/borrowing-slips/:id` trả thêm ba trường ở cấp gốc của JSON, bên cạnh các thông tin phiếu đang có:

```json
{
  "id": "brw-01",
  "memberId": "mem-01",
  "canRenew": false,
  "reasonCode": "ACTIVE_RESERVATION",
  "message": "Sách đã có người khác đặt trước"
}
```

Khi đủ điều kiện: `canRenew: true`, `reasonCode: null`, `message: "Phiếu mượn đủ điều kiện gia hạn"`.

| `reasonCode` | Ý nghĩa | HTTP khi gửi yêu cầu gia hạn |
| :--- | :--- | :--- |
| `NOT_OWNER` | Người gọi không được gia hạn phiếu này | 403 |
| `INVALID_STATUS` | Phiếu đã trả sách hoặc không ở trạng thái được gia hạn | 400 |
| `OVERDUE` | Phiếu quá hạn theo chính sách hiện tại | 400 |
| `MAX_RENEWALS_REACHED` | Đã hết số lần gia hạn (`LOAN_RENEW_MAX_COUNT`, mặc định 1) | 400 |
| `OUTSIDE_RENEWAL_WINDOW` | Chưa vào khoảng thời gian cho phép gia hạn (`LOAN_RENEW_WINDOW_DAYS`) | 400 |
| `ACTIVE_RESERVATION` | Sách có độc giả khác đặt trước còn hiệu lực | 409 |

Các lý do được xét theo thứ tự trên. Reservation chỉ chặn khi `LOAN_RENEW_BLOCK_WHEN_RESERVED=true`; chỉ tính `PENDING`/`READY` chưa hết hạn của độc giả khác. Với phiếu trả một phần, chỉ kiểm tra các dòng sách còn `PENDING`/`BORROWING`.

Flutter dùng `canRenew` để bật/tắt nút và `message` để hiển thị lý do. Kết quả GET phản ánh thời điểm tra cứu; API gia hạn luôn đánh giá lại trong transaction, nên client vẫn cần xử lý lỗi 400/403/409 rồi tải lại chi tiết. Thiếu JWT hoặc JWT không hợp lệ trả **401**, phiếu không tồn tại trả **404**.

---

### D. Phân Hệ Độc Giả & Thẻ Thư Viện (`/api/members`)

| Phương thức | Endpoint | Yêu cầu Token | Mô tả |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/members` | **Có** | Danh sách thành viên thư viện kèm phân trang |
| `GET` | `/api/members/:id` | **Có** | Xem hồ sơ độc giả và lịch sử mượn |
| `GET` | `/api/members/card/:cardNumber`| **Có**| Tra cứu độc giả bằng mã số thẻ `LIB-2026-XXXX` |
| `POST` | `/api/members` | **Có** | Đăng ký độc giả mới, tự sinh mã thẻ chuẩn |
| `PATCH` | `/api/members/:id` | **Có** | Cập nhật thông tin, gia hạn thẻ hoặc khóa thẻ |
| `DELETE` | `/api/members/:id` | **Có** | Xóa hồ sơ độc giả |

---

### E. Phân Hệ Thống Kê & Báo Cáo (`/api/stats`)

| Phương thức | Endpoint | Yêu cầu Token | Mô tả |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/stats` | Không | Báo cáo KPI tổng quan, Top sách mượn nhiều nhất, Cảnh báo quá hạn |
| `GET` | `/api/health` | Không | Health Check kiểm tra trạng thái hoạt động của server |
