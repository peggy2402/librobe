# LIBROBE AI AGENT RULES & WORKSPACE GUIDELINES

Tất cả các mô hình AI Agent khi làm việc trong repository **Librobe** phải đọc và tuân thủ tuyệt đối các nguyên tắc sau:

1. **NO EMOJIS**: Không dùng ký tự emoji trong UI, toast notification, code hoặc commit messages. Dùng SVG vector icons.
2. **MODULAR CODE**: Chia nhỏ file code (frontend: tách css/js theo module/component; backend: chia controller, service, dto, entity).
3. **RESPONSIVE FIRST**: Mọi màn hình phải hiển thị mượt mà trên Mobile (320px - 768px) và Desktop (> 1024px). Có mobile menu toggle.
4. **DESIGN SYSTEM TOKENS**: Sử dụng hệ lưới 4/8px và biến CSS `--spacing`, `--color`, không bịa pixel tùy tiện.
5. **SOLID & CLEAN ARCHITECTURE**: Backend NestJS phân tầng rõ ràng, sử dụng Prisma ORM kết nối Supabase, xử lý Transaction an toàn, không dùng mock data in-memory.
6. **POPUP & ESC KEY**: Mọi popup/modal căn giữa màn hình trên Desktop BẮT BUỘC hỗ trợ nhấn phím `Esc` để đóng thoát và click ngoài backdrop để đóng.
7. **CONFIRMATION DIALOG**: Mọi thao tác thay đổi/xóa thông tin BẮT BUỘC phải hỏi lại bằng Modal Xác Nhận gồm 2 nút: "Hủy" và "Xác nhận". Không dùng `window.confirm()`.
8. **MOBILE BOTTOM SHEET**: Trên Desktop là Popup căn giữa màn hình; trên Mobile tự động biến thành Bottom Sheet trượt từ dưới lên kèm thanh kéo ngón tay.
9. **MOBILE CARD LIST**: Trên Desktop là Bảng dữ liệu (Table View); trên Mobile toàn bộ danh sách tự động chuyển thành Thẻ danh sách (Card List) dễ chạm bấm.

Tham khảo chi tiết tại: [.agents/rules/coding-standards.md](file:///Users/peggy2402/Projects/librobe/.agents/rules/coding-standards.md)

