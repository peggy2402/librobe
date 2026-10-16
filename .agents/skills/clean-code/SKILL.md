---
name: clean-code
description: >-
  Quy chuẩn viết code sạch, module hóa, thiết kế responsive và bảo mật cho dự án Librobe.
  Kích hoạt khi viết UI frontend, refactor code, tạo component hoặc viết API backend.
---

# Skill: Clean Code & Architecture Guidelines (Librobe)

Skill này cung cấp các hướng dẫn chi tiết để AI Agent tuân thủ nghiêm ngặt các yêu cầu của chủ dự án:

## 1. Frontend Architecture & Modularization
- **File Structure**:
  ```
  public/
  ├── css/
  │   ├── variables.css      # Design tokens (colors, spacing, typography)
  │   ├── layout.css         # Grid, sidebar, topbar, responsive containers
  │   ├── components.css     # Buttons, badges, tables, modals, toasts
  │   └── auth.css           # Màn hình đăng nhập / xác thực
  ├── js/
  │   ├── api.js             # Client HTTP API Wrapper
  │   ├── auth.js            # Auth State & Session Management
  │   ├── ui.js              # UI Helpers (Modals, Toasts, Responsive Drawer)
  │   ├── books.js           # Quản lý kho sách
  │   ├── borrowings.js      # Mượn / trả sách
  │   ├── members.js         # Quản lý độc giả
  │   ├── stats.js           # Báo cáo tổng quan
  │   └── main.js            # Application Bootstrapper
  └── index.html             # HTML Shell
  ```
- **Không dùng Emoji**: Sử dụng SVG inline `<svg viewBox="0 0 24 24" ...>` với Lucide vector icons.
- **Mobile Responsive**:
  - Breakpoints: Mobile (`max-width: 768px`), Tablet (`769px - 1024px`), Desktop (`> 1024px`).
  - Mobile có nút Hamburger Menu để trượt Sidebar ra vào.
  - **Desktop Table vs Mobile Card List**: Trên Desktop dùng `<table>` nhiều cột; trên Mobile (< 768px) tự động chuyển sang `.mobile-card-list` với các `.mobile-data-card` dạng khối card.
  - **Desktop Center Modal vs Mobile Bottom Sheet**: Trên Desktop là popup căn giữa màn hình (đóng bằng phím `Esc` và click backdrop); trên Mobile chuyển thành Bottom Sheet trượt từ đáy lên với thanh kéo ngón tay.
- **Confirmation Dialog**: Mọi thao tác sửa/xóa/đổi trạng thái phải qua `ui.confirm({ title, message })` gồm 2 nút "Hủy" và "Xác nhận".

## 2. Backend NestJS Standards
- 100% logic nghiệp vụ nằm trong Service, Controller chỉ làm nhiệm vụ tiếp nhận HTTP request và validate DTO.
- Mọi thao tác ghi dữ liệu đa thực thể phải dùng `prisma.$transaction(...)`.
- Khóa bảo mật và credentials luôn đọc qua `process.env`.

