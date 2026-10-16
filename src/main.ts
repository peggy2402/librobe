import express from 'express';
import { join } from 'node:path';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule, ObserveInstrument } from './app.module.js';
import { AllExceptionsFilter } from './common/filters/http-exception.filter.js';

async function bootstrap() {
  const app = await NestFactory.create(
    AppModule,
    process.env.OBSERVE_APP_KEY ? { instrument: ObserveInstrument } : undefined,
  );

  // Kích hoạt CORS cho phép frontend kết nối tự do
  app.enableCors();

  // Đăng ký Exception Filter xử lý lỗi tập trung
  app.useGlobalFilters(new AllExceptionsFilter());

  // Đăng ký ValidationPipe tự động kiểm tra và chuyển đổi kiểu dữ liệu DTO
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Cấu hình phục vụ giao diện Web Trang Quản trị (Admin Management Dashboard)
  const publicPath = join(process.cwd(), 'public');
  app.use(express.static(publicPath));
  app.use('/admin', express.static(publicPath));

  // Thiết lập tiền tố toàn cục /api (loại trừ root /, /admin, /dashboard để phục vụ static & redirect)
  app.setGlobalPrefix('api', {
    exclude: ['/', '/admin', '/admin/*', '/dashboard'],
  });

  // Thiết lập Swagger UI OpenAPI Documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Hệ Thống Quản Lý Thư Viện - Library Management API (Librobe)')
    .setDescription(`
## Giới thiệu Dự án
API Backend cho hệ thống **Quản lý Thư viện Số (Library Management System)** được xây dựng trên nền tảng **NestJS** hiện đại.
Tài liệu Swagger này cung cấp đầy đủ thông tin về các endpoints, phương thức HTTP, DTO request schemas, response models và mã phản hồi chuẩn RESTful.

---

### Danh mục Chức năng Nghiệp vụ:
* 📚 **Books (Quản lý Sách & Kho Thư Viện)**: CRUD sách, tra cứu theo mã chuẩn quốc tế ISBN, tìm kiếm đa tiêu chí, theo dõi tồn kho \`copiesAvailable\` và vị trí kệ sách.
* 🏷️ **Categories (Thể loại Sách)**: Quản lý danh mục thể loại, tự động thống kê số lượng sách thuộc thể loại.
* ✍️ **Authors (Tác giả)**: Quản lý hồ sơ tác giả, tiểu sử, năm sinh và liên kết tác phẩm trong thư viện.
* 👤 **Members (Độc giả & Thẻ Thư Viện)**: Đăng ký bạn đọc, tự sinh số thẻ (\`LIB-2026-XXXX\`), quản lý thời hạn thẻ và số lượng sách được phép mượn tối đa.
* 🔄 **Borrowings (Mượn & Trả Sách)**: Tạo phiếu mượn, trả sách về kho, gia hạn thời gian mượn (tối đa 2 lần), tự động tính tiền phạt trễ hạn (5.000 VNĐ / ngày quá hạn).
* 📊 **Dashboard & Statistics (Thống kê)**: Báo cáo chỉ số tổng quan thời gian thực: tổng sách, sách đang mượn, phiếu quá hạn, tiền phạt đã thu và top sách được mượn nhiều nhất.

---

### Bảng Mã Trạng Thái HTTP Chuẩn:
* \`200 OK\`: Yêu cầu thực hiện thành công.
* \`201 Created\`: Bản ghi mới được tạo thành công (Thêm sách, Đăng ký độc giả, Tạo phiếu mượn).
* \`400 Bad Request\`: Dữ liệu gửi lên sai định dạng hoặc vi phạm quy tắc nghiệp vụ (ví dụ: thẻ hết hạn, sách hết hàng).
* \`404 Not Found\`: Không tìm thấy bản ghi theo mã ID yêu cầu.
* \`409 Conflict\`: Trùng lặp dữ liệu duy nhất (ISBN, Email) hoặc vi phạm ràng buộc toàn vẹn khi xóa dữ liệu.
    `)
    .setVersion('1.0.0')
    .setContact('Librobe Library Team', 'https://github.com/librobe', 'contact@librobe.internal')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT Authorization',
        description: 'Dán mã Bearer JWT token nhận được sau khi đăng nhập/đăng ký vào đây',
        in: 'header',
      },
      'JWT-auth',
    )
    .addTag(
      'Auth - Xác thực & Phân quyền (Đăng ký / Đăng nhập)',
      'Đăng ký tài khoản (email, sđt, mật khẩu), đăng nhập, cấp JWT token, xem profile cá nhân và đổi mật khẩu',
    )
    .addTag('Books - Quản lý Sách & Kho Thư Viện', 'Quản lý kho sách, tra cứu theo ISBN, kiểm kê tồn kho')
    .addTag('Categories - Quản lý Thể loại Sách', 'Danh mục thể loại và thống kê sách theo từng nhóm')
    .addTag('Authors - Quản lý Tác giả', 'Quản lý hồ sơ tác giả, tiểu sử và tác phẩm liên kết')
    .addTag('Members - Quản lý Độc Giả & Thẻ Thư Viện', 'Đăng ký thành viên, kiểm soát hạn thẻ và hạn mức mượn')
    .addTag('Borrowings - Quản lý Mượn / Trả Sách', 'Nghiệp vụ mượn sách, trả sách, gia hạn và tính phạt quá hạn')
    .addTag('Dashboard & Statistics - Thống kê Báo cáo', 'Báo cáo chỉ số tổng quan hoạt động thư viện')
    .addTag('Root - Điểm Đầu Của Ứng Dụng', 'Kiểm tra trạng thái máy chủ (Health Check)')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    customSiteTitle: 'Librobe - Library Management API Documentation',
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      docExpansion: 'list',
      filter: true,
      showCommonExtensions: true,
    },
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');

  console.log(`\n======================================================`);
  console.log(`🚀 Hệ thống Quản lý Thư viện (Librobe) đang chạy tại:`);
  console.log(`👉 Backend URL : http://localhost:${port}`);
  console.log(`👉 Trang Quản Lý : http://localhost:${port}/admin`);
  console.log(`👉 Swagger UI  : http://localhost:${port}/api/docs`);
  console.log(`👉 Health Check: http://localhost:${port}/api/health`);
  console.log(`======================================================\n`);
}
await bootstrap();
