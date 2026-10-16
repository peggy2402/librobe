# HƯỚNG DẪN TRIỂN KHAI PRODUCTION LÊN RAILWAY & GẮN TÊN MIỀN RIÊNG

Tài liệu này hướng dẫn chi tiết quy trình triển khai (Deploy) hệ thống **Librobe** lên nền tảng đám mây **Railway.app** và cấu hình tên miền riêng **`api.leorank.site`** có chứng chỉ bảo mật SSL (HTTPS) miễn phí.

---

## 1. Cơ Chế CI/CD Tự Động (Continuous Deployment)

* Dự án đã được liên kết trực tiếp giữa **GitHub (`peggy2402/librobe`)** và **Railway**.
* **Cơ chế hoạt động**:
  * Mỗi khi lập trình viên thực hiện lệnh `git push origin main`, GitHub sẽ tự động gửi Webhook thông báo tới Railway.
  * Railway tự động kéo mã nguồn mới nhất về, đọc file cấu hình [`railway.json`](../railway.json), chạy lệnh `npm install && npm run build` và khởi động container `npm run start:prod`.
  * **Bạn không cần phải thao tác thủ công gì trên Railway sau mỗi lần push code!**

---

## 2. Cấu Hình Biến Môi Trường (Environment Variables) Trên Railway

Trên giao diện dự án tại [Railway Dashboard](https://railway.com/) ➔ Chọn service `librobe` ➔ Tab **Variables**:

| Tên biến (Key) | Giá trị (Value) | Giải thích |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Bật chế độ tối ưu production |
| `PORT` | `3000` | Cổng máy chủ lắng nghe traffic |
| `JWT_SECRET` | `XL1mLjt0v2cU9ijTblVy2L7KmbmUxxVcJ7fdk5U268v` | Khóa bí mật mã hóa Bearer Token |
| `DATABASE_URL` | `postgresql://postgres.ovisszrdeqjdgkdhljjn:Chienhpt102%24%24@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true` | Chuỗi kết nối Supabase Pooler |
| `DIRECT_URL` | `postgresql://postgres.ovisszrdeqjdgkdhljjn:Chienhpt102%24%24@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres` | Chuỗi kết nối trực tiếp Prisma |
| `ADMIN_USERNAME`| `chien` | Tên tài khoản Master Admin |
| `ADMIN_PASSWORD`| `Chienhpt102$$` | Mật khẩu tài khoản Master Admin |

---

## 3. Cấu Hình Gắn Tên Miền Riêng (`api.leorank.site`)

### Bước 1: Khai Báo Custom Domain Trên Railway
1. Vào tab **Settings** của service `librobe` trên Railway.
2. Tại mục **Public Networking** ➔ Nhấn **Custom Domain**.
3. Nhập tên miền muốn gán: `api.leorank.site` ➔ Nhấn **Add**.
4. Railway sẽ cấp cho bạn:
   * Giá trị CNAME (ví dụ: `e6hweyfv.up.railway.app`).
   * Giá trị TXT xác thực sở hữu (ví dụ: `_railway-verify.api`).

### Bước 2: Thêm Bản Ghi DNS Tại Nhà Cung Cấp Tên Miền
Đăng nhập vào trang quản trị DNS nơi bạn mua tên miền `leorank.site` (Cloudflare, Namecheap, GoDaddy, v.v.) và thêm 2 bản ghi:

1. **Bản ghi CNAME**:
   * **Type**: `CNAME`
   * **Name / Host**: `api`
   * **Target / Value**: Giá trị CNAME do Railway cấp (ví dụ: `e6hweyfv.up.railway.app`)
   * **Proxy status**: Chuyển thành **DNS Only** (nếu sử dụng Cloudflare) để Let's Encrypt trên Railway tự động cấp SSL.

2. **Bản ghi TXT (Xác thực)**:
   * **Type**: `TXT`
   * **Name / Host**: `_railway-verify.api`
   * **Value**: Mã `railway-verify=...` do Railway cung cấp.

---

## 4. Kiểm Tra Trạng Thái & Khắc Phục Lỗi DNS Cache

* Khi Railway hiển thị dấu tích xanh `✔` bên cạnh tên miền `api.leorank.site`, chứng chỉ SSL Let's Encrypt đã sẵn sàng.
* Nếu máy tính cá nhân chưa truy cập được do modem Wi-Fi lưu cache DNS cũ (`NXDOMAIN`), hãy đổi DNS Wi-Fi sang Google DNS (`8.8.8.8` và `1.1.1.1`):
  ```bash
  networksetup -setdnsservers Wi-Fi 8.8.8.8 1.1.1.1
  ```
* Truy cập để xác nhận:
  * 🖥️ **Trang Quản Trị**: [https://api.leorank.site/admin](https://api.leorank.site/admin) *(hoặc [https://api.leorank.site/](https://api.leorank.site/))*
  * 📚 **Tài liệu Swagger API**: [https://api.leorank.site/api/docs](https://api.leorank.site/api/docs)
  * 🩺 **Health Check**: [https://api.leorank.site/api/health](https://api.leorank.site/api/health)
