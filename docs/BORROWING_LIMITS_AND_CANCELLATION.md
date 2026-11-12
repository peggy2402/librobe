# Hạn mức mượn và hủy phiếu của độc giả

## Hạn mức

`PENDING_APPROVAL` chưa chiếm hạn mức hoặc trừ kho. Backend kiểm tra điều kiện
khi lập phiếu và kiểm tra lại ngay khi duyệt. Số lượng yêu cầu là tổng
`items[].quantity`, không phải số dòng sách. Số đang mượn được tính từ phiếu lẻ
và số cuốn chưa trả/chưa báo mất trên các phiếu ERP đang mượn.

Các endpoint lập phiếu, duyệt phiếu và mượn lẻ trả HTTP 409 khi vượt hạn mức:

```json
{
  "statusCode": 409,
  "code": "BORROW_LIMIT_EXCEEDED",
  "message": "Vượt hạn mức mượn sách",
  "details": {
    "maxBorrowLimit": 5,
    "currentBorrowedCount": 3,
    "requestedQuantity": 3,
    "remainingBorrowLimit": 2
  }
}
```

Response vẫn có các trường chung `error`, `timestamp`, `path`, `method`.
Frontend nên phân biệt lỗi bằng `code`, lấy số lượng từ `details` và tải lại
tình trạng mượn. Các lỗi thẻ không hợp lệ, quá hạn và nợ phạt tiếp tục trả 400.

Khi duyệt thất bại, toàn bộ transaction rollback: phiếu vẫn chờ duyệt;
items, kho, counter, audit và reservation không thay đổi. Có thể duyệt lại
phiếu sau khi độc giả trả sách và đáp ứng đủ các điều kiện mượn.

## Khóa đồng thời

`lockMemberLoans()` khóa dòng `members` bằng `SELECT ... FOR UPDATE` bên trong
transaction `ReadCommitted`. Luồng tạo phiếu, duyệt, mượn lẻ, trả sách lẻ,
trả items và hủy phiếu đều lấy khóa này trước khi ghi phiếu/items/kho.
Với phiếu đã tồn tại, chỉ đọc memberId để lấy khóa, rồi đọc lại dữ liệu phiếu.
Khóa được PostgreSQL giải phóng khi commit/rollback và áp dụng giữa các instance.
Các thao tác trên nhiều sách xử lý theo thứ tự bookId để giảm deadlock.

Khi hai phiếu tranh hạn mức, giao dịch sau phải chờ và đọc lại số sách đã được
giao dịch trước ghi nhận. Atomic update trạng thái phiếu và atomic decrement
tồn kho vẫn được giữ để chặn duyệt trùng và tranh chấp bản sách cuối cùng.

Bản sửa không yêu cầu migration. Các lượt mượn vượt hạn mức đã có vẫn được giữ
đúng lịch sử thực tế; phát sinh mượn mới bị chặn cho đến khi còn đủ hạn mức.

## Member hủy phiếu gửi nhầm

`PATCH /api/borrowing-slips/:id/cancel`, Bearer token, body:

```json
{ "reason": "Gửi nhầm phiếu" }
```

| Người gọi / tình trạng                             | Kết quả                                                          |
| -------------------------------------------------- | ---------------------------------------------------------------- |
| MEMBER, chính chủ, PENDING_APPROVAL                | 200; phiếu và items chuyển CANCELLED; không thay đổi kho/counter |
| MEMBER không có memberId hoặc không phải chủ phiếu | 403                                                              |
| MEMBER chính chủ, phiếu không còn chờ duyệt        | 409                                                              |
| Không có phiếu                                     | 404                                                              |
| Chưa đăng nhập hoặc token không hợp lệ             | 401                                                              |

ADMIN/LIBRARIAN tiếp tục hủy theo quy trình tại quầy, gồm hoàn kho phần còn lại
của phiếu đã xuất sách. Danh tính và memberId được lấy từ user do JwtAuthGuard
xác thực; dữ liệu role/memberId/người hủy trong body không có quyền quyết định.
Audit ghi cancelledById, cancelledBy, cancelledAt và cancelReason.

Khi member hủy đồng thời với duyệt, chỉ một thao tác thành công. Client nhận
409 cần tải lại phiếu. Giao diện gọi API hủy cần xác nhận trước khi gửi.

## Kiểm thử

Chạy unit và HTTP tests: `npm test`.

Chạy integration: `npm run test:e2e -- test/borrowing-limits.e2e-spec.ts`.
Thiết lập `TEST_DATABASE_URL` trong môi trường chạy, trỏ đến PostgreSQL dành
cho kiểm thử và có quyền tạo/xóa schema. Suite tạo schema ngẫu nhiên, push
schema Prisma vào đó rồi tự xóa sau test; không push vào schema có sẵn.
Khi chưa có biến này, 8 test integration được đánh dấu skipped.

Các ca đồng thời dùng khóa chặn ban đầu và chờ hai session thực sự đợi khóa
trên PostgreSQL trước khi thả chạy: hai phiếu cùng member, duyệt với mượn lẻ,
duyệt trùng một phiếu, duyệt với member hủy, trả các dòng khác nhau và hủy tại
quầy với trả một phần. Các ca khác kiểm tra rollback khi thiếu kho ở dòng sau
và duyệt lại sau khi trả sách.
