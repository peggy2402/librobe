# LIBROBE WORKSPACE RULES & CODING STANDARDS
> File quy tắc dự án Librobe được tự động nạp bởi Antigravity AI Agent trong toàn bộ các phiên làm việc.

---

## 1. TUYỆT ĐỐI KHÔNG DÙNG ICON EMOJI (No Emojis Policy)
- **Quy tắc**: Tuyệt đối không sử dụng ký tự biểu cảm emoji (như icon mặt cười, quyển sách, tên lửa, bàn tay chỉ hướng hay bất kỳ ký tự Unicode emoji nào) trong cả giao diện người dùng (HTML, CSS, JS), thông báo toast, tài liệu UI, hay mã nguồn backend.
- **Giải pháp thay thế**: 
  - Sử dụng **SVG Icons inline** (sử dụng icon vector chuẩn như Lucide Icons, Heroicons hoặc SVG có `viewBox="0 0 24 24"`, `stroke="currentColor"`).
  - Sử dụng icon class hoặc CSS glyphs chuyên nghiệp.
  - Văn bản hành chính/kỹ thuật phải nghiêm túc, rõ ràng, hiện đại.

---

## 2. MODULARITY: TÁCH FILE NHỎ GỌN (Component & Widget Decomposition)
- **Quy tắc**: Không bao giờ viết toàn bộ ứng dụng dồn vào 1 file duy nhất (Monolithic file).
- **Frontend**:
  - Tách CSS theo các tầng: `variables.css` (design tokens), `layout.css` (cấu trúc khung), `components.css` (button, modal, card, table), `auth.css` (màn hình login).
  - Tách JavaScript thành các module độc lập theo chức năng (ES Modules hoặc separate files):
    - `api.js`: Lớp giao tiếp HTTP API, header Bearer token, xử lý timeout/error.
    - `auth.js`: Trạng thái phiên đăng nhập, JWT, profile.
    - `books.js`: Nghiệp vụ quản lý sách và kho.
    - `borrowings.js`: Nghiệp vụ mượn/trả sách, tính phạt, gia hạn.
    - `members.js`: Nghiệp vụ quản lý độc giả, thẻ thư viện.
    - `ui.js`: Xử lý Modal, Toast notification, Tabs chuyển đổi, Mobile sidebar.
- **Backend (NestJS)**:
  - Mỗi domain tách thành Module riêng biệt với đầy đủ: `*.controller.ts`, `*.service.ts`, `dto/*.dto.ts`, `entities/*.entity.ts`.
  - Không nhét logic database vào Controller; Controller chỉ đảm nhận validation và response mapping.

---

## 3. RESPONSIVE DESIGN BẮT BUỘC (Mobile First & Desktop Support)
- **Quy tắc**: Mọi giao diện phải thích ứng hoàn hảo trên màn hình Mobile (< 768px), Tablet (768px - 1024px) và Desktop (> 1024px).
- **Yêu cầu cụ thể**:
  - Bắt buộc có nút toggle Navigation Drawer / Sidebar trên màn hình di động.
  - Các bảng dữ liệu (Tables) phải có thanh trượt ngang `overflow-x: auto` hoặc responsive card view trên điện thoại để không bị tràn màn hình.
  - Form và Modal phải co giãn theo `max-width` và padding phù hợp trên thiết bị nhỏ (`width: 90vw`, `max-width: 520px`).
  - Hỗ trợ viewport touch target tối thiểu 44px x 44px cho các nút bấm trên mobile.

---

## 4. DESIGN TOKENS CHUẨN - KHÔNG SUY ĐOÁN PX TÙY TIỆN
- **Quy tắc**: Không gõ bừa bãi các giá trị pixel kỳ dị (`padding: 13px`, `margin: 27px`, `font-size: 15.5px`).
- **Hệ thống Spacing chuẩn**: Tuân thủ hệ lưới 4px / 8px (ví dụ: `4px`, `8px`, `12px`, `16px`, `24px`, `32px`, `48px`) hoặc dùng biến `--spacing-*`.
- **Đơn vị**: Ưu tiên sử dụng `rem`, `em`, `%`, `vh/vw` cho typography và layout.
- **Bảng màu**: Luôn dùng CSS Custom Properties (`--bg-primary`, `--bg-surface`, `--text-primary`, `--border-color`, `--accent-primary`). Không dùng màu hex thô phân tán rải rác trong code.

---

## 5. LOGIC BACKEND CHẶT CHẼ, AN TOÀN (Robust Backend Standards)
- **Prisma & Database**:
  - Mọi thao tác ghi nhiều bảng liên quan (ví dụ mượn sách: tạo borrowing + trừ copiesAvailable) bắt buộc phải gói trong Prisma Transaction (`this.prisma.$transaction(...)`).
  - Sử dụng DTO và Class-Validator cho 100% request body và query params.
  - Trả về mã HTTP chuẩn: 200 (OK), 201 (Created), 400 (Bad Request), 401 (Unauthorized), 403 (Forbidden), 404 (Not Found), 409 (Conflict).
- **Bảo mật & Biến môi trường**:
  - Không bao giờ hardcode mật khẩu, secret key, chuỗi kết nối database trong code. Luôn đọc từ `process.env`.
  - Hashing mật khẩu bằng `bcryptjs` với salt round tối thiểu là 10.

---

## 6. QUY TẮC POPUP & MODAL (Desktop Esc Key & Backdrop Dismiss)
- **Quy tắc**: Bất kỳ màn hình nào là popup / modal hiển thị ở giữa màn hình trên Desktop BẮT BUỘC phải:
  - Cho phép người dùng nhấn **phím `Esc`** trên bàn phím để đóng/thoát nhanh lập tức.
  - Cho phép click ra ngoài vùng backdrop nền tối để đóng modal.
  - Luôn có nút icon "X" ở góc trên bên phải và nút "Đóng" ở chân modal (footer).

---

## 7. XÁC NHẬN KHI THAY ĐỔI THÔNG TIN (Confirmation Dialog Standard)
- **Quy tắc**: Khi thực hiện bất kỳ thao tác nào làm thay đổi dữ liệu (Chỉnh sửa sách, Cập nhật thông tin độc giả, Trả sách, Gia hạn, Xóa dữ liệu...):
  - BẮT BUỘC phải hiển thị một Modal Xác Nhận (Confirmation Dialog) hỏi lại người dùng trước khi gửi yêu cầu tới máy chủ.
  - Modal xác nhận BẮT BUỘC phải có tối thiểu 2 nút rõ ràng:
    - **Nút "Hủy"**: Đóng modal, không thực hiện hành động.
    - **Nút "Xác nhận"**: Tiến hành thực thi thay đổi.
  - Tuyệt đối không dùng hàm `window.confirm()` thô ráp của trình duyệt mà phải dùng UI Dialog đẹp mắt, đồng bộ của hệ thống.

---

## 8. RESPONSIVE MODAL: DESKTOP POPUP VS MOBILE BOTTOM SHEET
- **Quy tắc**: Trải nghiệm xem chi tiết hoặc form trên thiết bị di động phải khác biệt so với máy tính bàn:
  - **Trên Desktop (> 768px)**: Hiển thị dạng Popup căn giữa màn hình (`centered modal`) với hiệu ứng scale/fade nhẹ.
  - **Trên Mobile (<= 768px)**: Tự động chuyển đổi thành **Bottom Sheet** trượt từ dưới đáy màn hình lên:
    - Bo tròn góc phía trên (`border-radius: 20px 20px 0 0`).
    - Có thanh kéo ngón tay (`pull indicator / drag handle`) ở đỉnh sheet.
    - Chiếm từ 80% đến 90% chiều cao màn hình (`max-height: 88vh`), cuộn nội dung mượt mà.

---

## 9. RESPONSIVE DATA PRESENTATION: DESKTOP TABLE VS MOBILE CARD LIST
- **Quy tắc**: Trình diễn danh sách dữ liệu phải tối ưu theo từng kích thước màn hình:
  - **Trên Desktop (> 768px)**: Hiển thị dạng **Bảng dữ liệu (Table View)** nhiều cột, căn lề chuẩn, xem được tổng quan toàn bộ thông tin.
  - **Trên Mobile (<= 768px)**: Ẩn bảng dữ liệu và BẮT BUỘC chuyển đổi thành **Dạng Thẻ Danh Sách (Card List View)**:
    - Mỗi phần tử (Sách, Phiếu mượn, Độc giả) là một thẻ Card riêng biệt với padding thoáng đãng.
    - Hiển thị đầy đủ thông tin nhận diện (Tiêu đề, mã định danh, badge trạng thái màu sắc, ngày tháng).
    - Các nút hành động được thiết kế to bản, dễ bấm bằng ngón tay cái, không gây hiện tượng tràn ngang màn hình.

