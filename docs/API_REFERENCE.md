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
| `GET` | `/api/auth/me` | **Có** | Lấy thông tin hồ sơ của tài khoản đang đăng nhập |
| `POST` | `/api/auth/change-password` | **Có** | Đổi mật khẩu tài khoản |

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
| `POST` | `/api/borrowings/:id/renew` | **Có** | Gia hạn thời gian mượn thêm ngày (tối đa 2 lần) |
| `POST` | `/api/borrowings/:id/pay-fine`| **Có** | Ghi nhận độc giả đã thanh toán tiền phạt quá hạn |

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
