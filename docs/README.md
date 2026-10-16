# TÀI LIỆU KỸ THUẬT DỰ ÁN QUẢN LÝ THƯ VIỆN (LIBROBE)

Chào mừng bạn đến với tài liệu kỹ thuật chính thức của hệ thống **Librobe - Library Management System**. 
Dự án được xây dựng với mục tiêu cung cấp giải pháp backend quản trị thư viện số hoàn chỉnh, bảo mật và hiệu năng cao trên nền tảng **NestJS v12**, **Prisma ORM v6**, và **Supabase PostgreSQL**.

---

## Danh Mục Tài Liệu

Tài liệu được phân loại rõ ràng theo từng phân hệ để các thành viên (Backend Dev, Frontend Dev, DevOps) dễ dàng tiếp cận:

1. [Kiến Trúc Hệ Thống (Architecture & Tech Stack)](./ARCHITECTURE.md)
   * Tổng quan mô hình kiến trúc Clean Architecture & SOLID.
   * Ngăn xếp công nghệ (NestJS, Prisma, Supabase, JWT, Vitest).
   * Luồng xử lý dữ liệu và Exception Filter tập trung.

2. [Tài Liệu Chi Tiết API (API Reference)](./API_REFERENCE.md)
   * Toàn bộ 24 RESTful endpoints: Auth, Books, Borrowings, Members, Categories, Authors, Stats.
   * Cấu trúc Header Bearer JWT Authorization, Request DTO và Response format.
   * Bảng mã lỗi HTTP và Swagger UI tích hợp.

3. [Thiết Kế Cơ Sở Dữ Liệu (Database Schema & ERD)](./DATABASE_SCHEMA.md)
   * Chi tiết 6 bảng thực thể: `users`, `books`, `borrowings`, `members`, `categories`, `authors`.
   * Khóa ngoại, quan hệ 1-N, N-N, Indexing và cơ chế Supabase PgBouncer Pooler.

4. [Hướng Dẫn Cài Đặt Phát Triển (Development Setup Guide)](./DEVELOPMENT_GUIDE.md)
   * Yêu cầu môi trường (Node.js v24+, npm).
   * Hướng dẫn thiết lập biến môi trường `.env`.
   * Quy trình chạy Database Migration, nạp dữ liệu mẫu (`prisma db push`, `prisma:seed`).
   * Các lệnh kiểm tra chất lượng mã nguồn (`npm run lint`, `npx tsc --noEmit`).

5. [Hướng Dẫn Triển Khai (Deployment Guide - Railway & Custom Domain)](./DEPLOYMENT_RAILWAY.md)
   * Quy trình CI/CD tự động khi push code lên GitHub.
   * Cấu hình biến môi trường production trên Railway.
   * Hướng dẫn cấu hình DNS CNAME/TXT và cấp phát chứng chỉ SSL (HTTPS) cho domain `api.leorank.site`.

---

## Cấu Trúc Thư Mục Dự Án

```
librobe/
├── .agents/                    # Quy tắc và Skills cho AI Coding Agent
│   ├── rules/                  # Quy chuẩn code clean, no emoji, responsive
│   └── skills/                 # Skills chuyên sâu
├── docs/                       # Tài liệu kỹ thuật chi tiết
│   ├── README.md               # Mục lục tài liệu
│   ├── ARCHITECTURE.md         # Kiến trúc hệ thống
│   ├── API_REFERENCE.md        # Danh mục API
│   ├── DATABASE_SCHEMA.md      # Lược đồ database
│   ├── DEVELOPMENT_GUIDE.md    # Hướng dẫn setup cho dev
│   └── DEPLOYMENT_RAILWAY.md   # Hướng dẫn deploy
├── prisma/                     # Lược đồ và Migration Prisma ORM
│   ├── schema.prisma           # Định nghĩa 6 bảng dữ liệu
│   └── seed.ts                 # Script nạp dữ liệu mẫu ban đầu
├── public/                     # Giao diện Trang Quản Trị (Admin Dashboard Web App)
│   ├── css/                    # Modular CSS Design System (variables, layout, components, auth)
│   ├── js/                     # Modular JavaScript (api, auth, ui, books, borrowings, members, stats)
│   └── index.html              # Shell HTML
├── src/                        # Mã nguồn Backend NestJS
│   ├── common/                 # DTO phân trang, enums, filters toàn cục
│   ├── modules/                # Các domain nghiệp vụ (auth, books, borrowings, members,...)
│   ├── app.controller.ts       # Điều hướng trang chủ và Health check
│   ├── app.module.ts           # Root Module
│   └── main.ts                 # Bootstrap application
├── nest-cli.json               # Cấu hình Nest CLI (hỗ trợ Node ESM)
├── railway.json                # Cấu hình tự động deploy trên Railway.app
├── render.yaml                 # Cấu hình dự phòng trên Render.com
└── package.json                # Quản lý dependencies và scripts
```
