# QUY TRÌNH TEST & KẾT QUẢ MONG ĐỢI — NGHIỆP VỤ MƯỢN / TRẢ / GIA HẠN SÁCH

Tài liệu này dùng cho hai mục đích:

1. **Quy trình test thủ công** để kiểm chứng backend chạy đúng.
2. **Đáp án chuẩn (expected result)** để đối chiếu bài làm của học viên.

Mỗi ca kiểm thử nêu rõ: dữ liệu đầu vào → **HTTP status** → **trường dữ liệu quan trọng trong response** → **trạng thái database sau khi chạy**. Học viên phải ra đúng cả ba, không chỉ đúng status code.

---

## MỤC LỤC

- [PHẦN 0. Chuẩn bị môi trường](#phần-0-chuẩn-bị-môi-trường)
- [PHẦN 1. Bảng tham số chính sách](#phần-1-bảng-tham-số-chính-sách)
- [PHẦN 2. Danh sách API](#phần-2-danh-sách-api)
- [PHẦN 3. Tình huống 1 — Mượn sách thành công](#phần-3-tình-huống-1--mượn-sách-thành-công)
- [PHẦN 4. Tình huống 2 — Vượt quá giới hạn mượn](#phần-4-tình-huống-2--vượt-quá-giới-hạn-mượn)
- [PHẦN 5. Tình huống 3 — Hai độc giả cùng mượn bản sách cuối cùng](#phần-5-tình-huống-3--hai-độc-giả-cùng-mượn-bản-sách-cuối-cùng)
- [PHẦN 6. Tình huống 4 — Trả sách quá hạn & tiền phạt](#phần-6-tình-huống-4--trả-sách-quá-hạn--tiền-phạt)
- [PHẦN 7. Tình huống 5 — Gia hạn sách](#phần-7-tình-huống-5--gia-hạn-sách)
- [PHẦN 8. Bảng đáp án tổng hợp (dùng để chấm điểm)](#phần-8-bảng-đáp-án-tổng-hợp-dùng-để-chấm-điểm)
- [PHẦN 9. Những lỗi thường gặp cần soi khi chấm](#phần-9-những-lỗi-thường-gặp-cần-soi-khi-chấm)

---

## PHẦN 0. Chuẩn bị môi trường

### 0.1 Áp dụng thay đổi database (BẮT BUỘC, chạy một lần)

Nghiệp vụ mới cần 2 bảng (`reservations`, `loan_renewals`) và 5 cột mới. Toàn bộ thay đổi chỉ **THÊM**, không xóa/đổi tên cột nào.

Chọn **một** trong hai cách:

```bash
# Cách A (khuyến nghị cho Supabase): chạy file SQL, đã kiểm tra idempotent
# Mở Supabase SQL Editor -> dán toàn bộ nội dung file -> Run
cat sql/migrations/20261110_loan_policy_reservations.sql
```

```bash
# Cách B: để Prisma đồng bộ schema, rồi bổ sung ràng buộc CHECK bằng SQL
npm run prisma:push
# Sau đó chạy riêng "PHẦN 6" trong file SQL trên để thêm 2 ràng buộc
# books_copies_available_non_negative và books_copies_available_within_total
```

Kiểm tra đã xong:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema='public' AND table_name IN ('reservations','loan_renewals');
-- Mong đợi: trả về đúng 2 dòng
```

### 0.2 Khởi động server

```bash
npm run build
npm run start:dev
```

Swagger: `http://localhost:3000/api/docs`

### 0.3 Lấy JWT token

Mọi API mượn/trả đều yêu cầu `Authorization: Bearer <token>`.

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"identifier":"<email_hoặc_sđt>","password":"<mật_khẩu>"}' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["accessToken"])')

echo "$TOKEN"
```

> Có thể dùng tài khoản quản trị khai trong `.env` (`ADMIN_USERNAME` / `ADMIN_PASSWORD`).

Đặt biến dùng lại cho mọi lệnh phía sau:

```bash
API=http://localhost:3000/api
H_AUTH="Authorization: Bearer $TOKEN"
H_JSON="Content-Type: application/json"
```

### 0.4 Tạo dữ liệu test độc lập

Không test trên dữ liệu seed sẵn có — số liệu sẽ không khớp đáp án. Tạo riêng:

```bash
# Lấy một authorId và categoryId bất kỳ đang có
AUTHOR_ID=$(curl -s "$API/authors?limit=1" -H "$H_AUTH" | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"][0]["id"])')
CATEGORY_ID=$(curl -s "$API/categories?limit=1" -H "$H_AUTH" | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"][0]["id"])')

# Độc giả A — hạn mức 5 cuốn
MEMBER_A=$(curl -s -X POST "$API/members" -H "$H_AUTH" -H "$H_JSON" -d '{
  "fullName":"Test Doc Gia A","email":"test.a@librobe.vn","phone":"0900000001",
  "address":"So 1 Duong Test","maxBorrowLimit":5,"membershipDurationMonths":12
}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')

# Độc giả B — đối tượng đặt trước sách và trả sách phiếu ERP
MEMBER_B=$(curl -s -X POST "$API/members" -H "$H_AUTH" -H "$H_JSON" -d '{
  "fullName":"Test Doc Gia B","email":"test.b@librobe.vn","phone":"0900000002",
  "address":"So 2 Duong Test","maxBorrowLimit":5,"membershipDurationMonths":12
}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')

# Độc giả C và D — CHỈ dùng cho test tranh chấp đồng thời (hạn mức 10 để chạy
# được nhiều vòng lặp mà không bị chặn vì hết hạn mức)
MEMBER_C=$(curl -s -X POST "$API/members" -H "$H_AUTH" -H "$H_JSON" -d '{
  "fullName":"Test Doc Gia C","email":"test.c@librobe.vn","phone":"0900000003",
  "address":"So 3 Duong Test","maxBorrowLimit":10,"membershipDurationMonths":12
}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')

MEMBER_D=$(curl -s -X POST "$API/members" -H "$H_AUTH" -H "$H_JSON" -d '{
  "fullName":"Test Doc Gia D","email":"test.d@librobe.vn","phone":"0900000004",
  "address":"So 4 Duong Test","maxBorrowLimit":10,"membershipDurationMonths":12
}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')

# Độc giả E — CHỈ dùng cho test gia hạn phiếu ERP, giữ trạng thái sạch
MEMBER_E=$(curl -s -X POST "$API/members" -H "$H_AUTH" -H "$H_JSON" -d '{
  "fullName":"Test Doc Gia E","email":"test.e@librobe.vn","phone":"0900000005",
  "address":"So 5 Duong Test","maxBorrowLimit":10,"membershipDurationMonths":12
}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')

# Sách X — 10 bản, dùng cho các ca mượn/trả/gia hạn
BOOK_X=$(curl -s -X POST "$API/books" -H "$H_AUTH" -H "$H_JSON" -d '{
  "isbn":"9790000000011","title":"Test Book X","authorId":"'$AUTHOR_ID'","categoryId":"'$CATEGORY_ID'",
  "publisher":"NXB Test","publishYear":2024,"copiesTotal":10,"price":200000,
  "shelfLocation":"T-01","description":"Sach phuc vu kiem thu"
}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')

# Sách LAST — chỉ 1 bản duy nhất, dùng cho test concurrency
BOOK_LAST=$(curl -s -X POST "$API/books" -H "$H_AUTH" -H "$H_JSON" -d '{
  "isbn":"9790000000028","title":"Test Book LAST","authorId":"'$AUTHOR_ID'","categoryId":"'$CATEGORY_ID'",
  "publisher":"NXB Test","publishYear":2024,"copiesTotal":1,"price":200000,
  "shelfLocation":"T-02","description":"Chi con 1 ban duy nhat"
}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')

echo "MEMBER_A=$MEMBER_A"; echo "MEMBER_B=$MEMBER_B"
echo "MEMBER_C=$MEMBER_C"; echo "MEMBER_D=$MEMBER_D"; echo "MEMBER_E=$MEMBER_E"
echo "BOOK_X=$BOOK_X";     echo "BOOK_LAST=$BOOK_LAST"
```

**Phân vai dữ liệu test** — mỗi độc giả chỉ phục vụ một nhóm ca kiểm thử, để trạng thái của nhóm này không làm sai lệch số liệu mong đợi của nhóm khác:

| Độc giả | Hạn mức | Dùng cho |
|---|---|---|
| A | 5 | Tình huống 1, 2, 4 (mượn, vượt hạn mức, trả & phạt) |
| B | 5 | Đối tượng đặt trước sách; trả sách phiếu ERP |
| C, D | 10 | Chỉ tình huống 3 (tranh chấp đồng thời) |
| E | 10 | Chỉ gia hạn phiếu ERP |

| Sách | Số bản | Dùng cho |
|---|---|---|
| X | 10 | Hầu hết các ca |
| LAST | 1 | Tình huống 3 và ca sách hết hàng |

### 0.5 Thủ thuật mô phỏng thời gian

Không thể chờ 5 ngày thật. Dịch `due_date` về quá khứ bằng SQL:

```sql
-- Làm cho một phiếu mượn lẻ trở thành quá hạn 5 ngày
UPDATE borrowings SET due_date = NOW() - INTERVAL '5 days' WHERE id = '<borrowingId>';

-- Làm cho một phiếu mượn ERP trở thành quá hạn 5 ngày
UPDATE borrowing_slips SET due_date = NOW() - INTERVAL '5 days' WHERE id = '<slipId>';
```

Để test "còn 2 ngày nữa đến hạn" thì chỉ cần mượn với `"durationDays": 2`.

---

## PHẦN 1. Bảng tham số chính sách

Mọi con số dưới đây đọc từ biến môi trường, **không hardcode trong service**. Xem `.env.example`.

| Tham số | Biến môi trường | Mặc định |
|---|---|---|
| Thời hạn mượn | `LOAN_DEFAULT_DAYS` | 14 ngày |
| Thời hạn mượn tối đa | `LOAN_MAX_DAYS` | 30 ngày |
| Mức phạt trễ hạn | `LOAN_FINE_PER_DAY` | 5.000 VNĐ/ngày/cuốn |
| Ngày ân hạn | `LOAN_FINE_GRACE_DAYS` | 0 |
| Số lần gia hạn tối đa | `LOAN_RENEW_MAX_COUNT` | **1 lần** |
| Số ngày mỗi lần gia hạn | `LOAN_RENEW_DAYS` | 7 ngày |
| Chặn gia hạn khi có người đặt trước | `LOAN_RENEW_BLOCK_WHEN_RESERVED` | true |
| Chặn mượn khi nợ phạt | `LOAN_BLOCK_BORROW_ON_UNPAID_FINE` | true |
| Chặn mượn khi có sách quá hạn | `LOAN_BLOCK_BORROW_ON_OVERDUE` | true |
| Hạn mức mượn mặc định | `MEMBER_DEFAULT_BORROW_LIMIT` | 5 cuốn |

**Công thức phạt** (phải khớp chính xác):

```
Số ngày quá hạn = số ngày lịch giữa ngày trả thực tế và hạn trả, trừ số ngày ân hạn, tối thiểu 0
Tiền phạt       = Số ngày quá hạn × Mức phạt mỗi ngày × Số lượng sách quá hạn
```

> **Điểm dễ sai:** đếm ngày theo **mốc đầu ngày**, không phải hiệu milli-giây làm tròn lên. Trả trễ 2 giờ ⇒ **0 ngày quá hạn, phạt 0 đồng**. Bài nào dùng `Math.ceil(hiệu_ms / 86400000)` sẽ phạt 1 ngày ⇒ **sai**.

---

## PHẦN 2. Danh sách API

### Luồng phiếu mượn lẻ — 1 phiếu = 1 cuốn (frontend hiện tại đang dùng)

| Method | Endpoint | Chức năng | Trạng thái |
|---|---|---|---|
| POST | `/api/borrowings` | Mượn sách | Có sẵn, đã sửa |
| POST | `/api/borrowings/:id/return` | Trả sách | Có sẵn, đã sửa |
| POST | `/api/borrowings/:id/renew` | Gia hạn | Có sẵn, đã sửa |
| POST | `/api/borrowings/:id/pay-fine` | Thanh toán phạt | Có sẵn, đã sửa |
| GET | `/api/borrowings` | Danh sách phiếu mượn (phân trang, lọc) | Có sẵn |
| GET | `/api/borrowings/overdue` | Danh sách phiếu quá hạn | Có sẵn |
| GET | `/api/borrowings/:id` | Chi tiết phiếu mượn | Có sẵn |
| GET | `/api/borrowings/fines/unpaid` | Danh sách khoản phạt chưa thu | **Mới** |
| GET | `/api/borrowings/:id/renewals` | Lịch sử gia hạn | **Mới** |

### Luồng phiếu mượn ERP — 1 phiếu nhiều cuốn, có phê duyệt

| Method | Endpoint | Chức năng | Trạng thái |
|---|---|---|---|
| POST | `/api/borrowing-slips` | Lập phiếu mượn nhiều cuốn | Có sẵn, đã sửa |
| PATCH | `/api/borrowing-slips/:id/approve` | Phê duyệt & xuất kho | Có sẵn, đã sửa |
| PATCH | `/api/borrowing-slips/:id/reject` | Từ chối | Có sẵn |
| PATCH | `/api/borrowing-slips/:id/cancel` | Hủy phiếu, hoàn kho | Có sẵn, đã sửa |
| POST | `/api/borrowing-slips/:id/return-items` | Trả từng phần, tính phạt | Có sẵn, đã sửa |
| PATCH | `/api/borrowing-slips/:id/renew` | Gia hạn phiếu | **Mới** |
| GET | `/api/borrowing-slips/:id/renewals` | Lịch sử gia hạn | **Mới** |
| POST | `/api/borrowing-slips/:id/pay-fine` | Thanh toán phạt | **Mới** |

### Đặt trước & tra cứu

| Method | Endpoint | Chức năng | Trạng thái |
|---|---|---|---|
| POST | `/api/reservations` | Đặt trước sách | **Mới** |
| GET | `/api/reservations` | Danh sách phiếu đặt trước | **Mới** |
| GET | `/api/reservations/book/:bookId/queue` | Hàng đợi của một cuốn sách | **Mới** |
| PATCH | `/api/reservations/:id/cancel` | Hủy đặt trước | **Mới** |
| GET | `/api/members/:id/debt-summary` | Hạn mức + nợ phạt + có được mượn không | Có sẵn, đã sửa |
| GET | `/api/books/:id/stock-check` | Số lượng sách còn lại | Có sẵn, đã sửa |

**Không có API nào bị xóa hay đổi đường dẫn.** Frontend trong `public/js/` chạy nguyên không cần sửa.

---

## PHẦN 3. Tình huống 1 — Mượn sách thành công

> Độc giả đang mượn 2 quyển, không nợ phạt, xin mượn thêm 2 quyển, kho còn đủ.

### TC-01. Dựng trạng thái "đang mượn 2 quyển"

```bash
B1=$(curl -s -X POST "$API/borrowings" -H "$H_AUTH" -H "$H_JSON" \
  -d '{"memberId":"'$MEMBER_A'","bookId":"'$BOOK_X'"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')

B2=$(curl -s -X POST "$API/borrowings" -H "$H_AUTH" -H "$H_JSON" \
  -d '{"memberId":"'$MEMBER_A'","bookId":"'$BOOK_X'"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')

curl -s "$API/members/$MEMBER_A/debt-summary" -H "$H_AUTH"
```

**Kết quả mong đợi** — `200 OK`:

| Trường | Giá trị |
|---|---|
| `currentBorrowedCount` | `2` |
| `remainingBorrowLimit` | `3` |
| `maxBorrowLimit` | `5` |
| `totalUnpaidFine` | `0` |
| `hasOverdue` | `false` |
| `canBorrow` | `true` |
| `blockReason` | không có |

**Database:** `books.copies_available` của Sách X giảm từ `10` → `8`.

### TC-02. Mượn thêm 2 quyển (luồng ERP — một phiếu, hai cuốn)

```bash
SLIP=$(curl -s -X POST "$API/borrowing-slips" -H "$H_AUTH" -H "$H_JSON" -d '{
  "memberId":"'$MEMBER_A'",
  "items":[{"bookId":"'$BOOK_X'","quantity":2}],
  "expectedReturnDays":14
}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')

curl -s -X PATCH "$API/borrowing-slips/$SLIP/approve" -H "$H_AUTH"
```

**Kết quả mong đợi khi lập phiếu** — `201 Created`:

| Trường | Giá trị |
|---|---|
| `slipNumber` | `SLIP-2026-NNNN` |
| `status` | `PENDING_APPROVAL` |
| `dueDate` | ngày lập phiếu **+ 14 ngày** |
| `totalFine` | `0` |
| `finePaid` | `false` |
| `renewCount` | `0` |
| `items[0].quantity` | `2` |
| `items[0].status` | `PENDING` |

**Database sau khi lập phiếu:** `copies_available` **vẫn là 8** — lập phiếu chưa xuất kho.

**Kết quả mong đợi khi phê duyệt** — `200 OK`:

| Trường | Giá trị |
|---|---|
| `status` | `BORROWED` |
| `borrowDate` | thời điểm phê duyệt |
| `approvedAt` | thời điểm phê duyệt |
| `approvedBy` | email người duyệt |
| `items[0].status` | `BORROWING` |

**Database sau khi phê duyệt:**

| Bảng.cột | Trước | Sau |
|---|---|---|
| `books.copies_available` (Sách X) | 8 | **6** |
| `members.current_borrowed_count` | 2 | **4** |

```bash
curl -s "$API/members/$MEMBER_A/debt-summary" -H "$H_AUTH"
```

| Trường | Giá trị |
|---|---|
| `currentBorrowedCount` | `4` |
| `remainingBorrowLimit` | `1` |
| `canBorrow` | `true` |

> **Chấm điểm:** `currentBorrowedCount` phải là `4` (2 phiếu lẻ + 2 cuốn trong phiếu ERP). Bài nào chỉ đếm một bảng sẽ ra `2` ⇒ **sai**, và sẽ cho mượn vượt hạn mức ở ca sau.

### TC-03. Mượn 1 cuốn bằng luồng phiếu lẻ, kiểm tra hạn trả

```bash
curl -s -X POST "$API/borrowings" -H "$H_AUTH" -H "$H_JSON" \
  -d '{"memberId":"'$MEMBER_B'","bookId":"'$BOOK_X'","durationDays":14,"notes":"Muon tham khao"}'
```

**Kết quả mong đợi** — `201 Created`:

| Trường | Giá trị |
|---|---|
| `transactionCode` | `BRW-2026-NNNN` (tăng dần, không trùng) |
| `status` | `BORROWED` |
| `borrowDate` | thời điểm gọi API |
| `dueDate` | `borrowDate + 14 ngày` |
| `renewCount` | `0` |
| `fineAmount` | `0` |
| `finePaid` | `false` |
| `returnDate` | không có |
| `memberName`, `bookTitle` | có giá trị thật, không phải "Chưa xác định" |

### TC-04. Vượt thời hạn mượn tối đa

```bash
curl -i -s -X POST "$API/borrowings" -H "$H_AUTH" -H "$H_JSON" \
  -d '{"memberId":"'$MEMBER_B'","bookId":"'$BOOK_X'","durationDays":45}'
```

**Kết quả mong đợi** — `400 Bad Request`:

```
"Thời hạn mượn tối đa theo chính sách thư viện là 30 ngày (yêu cầu 45 ngày)"
```

---

## PHẦN 4. Tình huống 2 — Vượt quá giới hạn mượn

> Độc giả đang mượn 4 quyển, giới hạn 5, xin mượn thêm 2 quyển.

Sau TC-02, `MEMBER_A` đang giữ đúng 4 cuốn, hạn mức 5.

### TC-05. Xin mượn thêm 2 cuốn qua phiếu ERP

```bash
curl -i -s -X POST "$API/borrowing-slips" -H "$H_AUTH" -H "$H_JSON" -d '{
  "memberId":"'$MEMBER_A'",
  "items":[{"bookId":"'$BOOK_X'","quantity":2}]
}'
```

**Kết quả mong đợi** — `400 Bad Request`:

```
"Vượt quá hạn mức mượn: độc giả "Test Doc Gia A" đang giữ 4/5 cuốn,
 chỉ còn được mượn thêm 1 cuốn nhưng yêu cầu 2 cuốn"
```

**Database — phải không thay đổi gì:**

| Kiểm tra | Giá trị |
|---|---|
| `books.copies_available` (Sách X) | **vẫn 6** (không trừ kho) |
| `members.current_borrowed_count` | **vẫn 4** |
| Số dòng trong `borrowing_slips` của độc giả này | **không tăng** |

> **Chấm điểm:** đây là điểm then chốt. Bài nào tạo phiếu trước rồi mới kiểm tra hạn mức, hoặc trừ kho rồi mới rollback bằng tay, sẽ để lại dữ liệu rác ⇒ **sai**.

### TC-06. Mượn đúng 1 cuốn còn lại thì phải thành công

```bash
curl -i -s -X POST "$API/borrowings" -H "$H_AUTH" -H "$H_JSON" \
  -d '{"memberId":"'$MEMBER_A'","bookId":"'$BOOK_X'"}'
```

**Kết quả mong đợi** — `201 Created`. `currentBorrowedCount` → `5`, `remainingBorrowLimit` → `0`.

### TC-07. Mượn cuốn thứ 6 — đã hết hạn mức

```bash
curl -i -s -X POST "$API/borrowings" -H "$H_AUTH" -H "$H_JSON" \
  -d '{"memberId":"'$MEMBER_A'","bookId":"'$BOOK_X'"}'
```

**Kết quả mong đợi** — `400 Bad Request`:

```
"Độc giả đã sử dụng hết hạn mức mượn (5 cuốn)"
```

### TC-08. Thẻ độc giả bị khóa

```bash
curl -s -X PATCH "$API/members/$MEMBER_B" -H "$H_AUTH" -H "$H_JSON" \
  -d '{"status":"SUSPENDED"}'

curl -i -s -X POST "$API/borrowings" -H "$H_AUTH" -H "$H_JSON" \
  -d '{"memberId":"'$MEMBER_B'","bookId":"'$BOOK_X'"}'
```

**Kết quả mong đợi** — `400 Bad Request`:

```
"Thẻ độc giả đang ở trạng thái "SUSPENDED". Không đủ điều kiện mượn sách"
```

Trả thẻ về bình thường để chạy tiếp:

```bash
curl -s -X PATCH "$API/members/$MEMBER_B" -H "$H_AUTH" -H "$H_JSON" -d '{"status":"ACTIVE"}'
```

### TC-09. Sách đã hết bản khả dụng

```bash
# Độc giả C mượn bản duy nhất của Sách LAST
BL0=$(curl -s -X POST "$API/borrowings" -H "$H_AUTH" -H "$H_JSON" \
  -d '{"memberId":"'$MEMBER_C'","bookId":"'$BOOK_LAST'"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')

# Độc giả B xin mượn tiếp -> kho đã hết
curl -i -s -X POST "$API/borrowings" -H "$H_AUTH" -H "$H_JSON" \
  -d '{"memberId":"'$MEMBER_B'","bookId":"'$BOOK_LAST'"}'
```

**Kết quả mong đợi** — `400 Bad Request`:

```
"Cuốn sách "Test Book LAST" hiện tại đã hết bản in sẵn có để mượn"
```

**Database:**

```bash
curl -s "$API/books/$BOOK_LAST/stock-check" -H "$H_AUTH"
```

| Trường | Giá trị |
|---|---|
| `copiesAvailable` | `0` (**không bao giờ âm**) |
| `status` | `OUT_OF_STOCK` |
| `isAvailable` | `false` |

Trả sách lại để Sách LAST sạch sẽ cho tình huống 3:

```bash
curl -s -X POST "$API/borrowings/$BL0/return" -H "$H_AUTH" -H "$H_JSON" -d '{}' > /dev/null
curl -s "$API/books/$BOOK_LAST/stock-check" -H "$H_AUTH"
# Mong đợi: copiesAvailable = 1, status = AVAILABLE
```

---

## PHẦN 5. Tình huống 3 — Hai độc giả cùng mượn bản sách cuối cùng

> Thư viện còn 1 bản. Độc giả A và B gửi yêu cầu gần như đồng thời.
> **Yêu cầu: đúng một giao dịch thành công, tồn kho không âm, giao dịch thất bại rollback toàn bộ.**

### TC-10. Hai request song song

Trước tiên khai báo hàm tiện ích trả lại Sách LAST về kho. Dùng nghiệp vụ trả sách thật, **không** sửa tồn kho bằng tay, để dữ liệu luôn nhất quán giữa các vòng test:

```bash
reset_last() {
  curl -s "$API/borrowings?bookId=$BOOK_LAST&limit=50" -H "$H_AUTH" \
    | python3 -c 'import sys,json
d=json.load(sys.stdin)
for b in d["data"]:
    if b["status"] != "RETURNED":
        print(b["id"])' \
    | while read -r bid; do
        curl -s -X POST "$API/borrowings/$bid/return" -H "$H_AUTH" -H "$H_JSON" -d '{}' > /dev/null
      done
  curl -s "$API/books/$BOOK_LAST/stock-check" -H "$H_AUTH" \
    | python3 -c 'import sys,json;print("ton kho Sach LAST =",json.load(sys.stdin)["copiesAvailable"])'
}

reset_last   # mong đợi in: ton kho Sach LAST = 1
```

```bash
# Hai độc giả khác nhau cùng bắn request trong cùng một thời điểm
curl -s -o /tmp/race_c.json -w 'C=%{http_code}\n' -X POST "$API/borrowings" \
  -H "$H_AUTH" -H "$H_JSON" -d '{"memberId":"'$MEMBER_C'","bookId":"'$BOOK_LAST'"}' &
curl -s -o /tmp/race_d.json -w 'D=%{http_code}\n' -X POST "$API/borrowings" \
  -H "$H_AUTH" -H "$H_JSON" -d '{"memberId":"'$MEMBER_D'","bookId":"'$BOOK_LAST'"}' &
wait

echo '--- C ---'; cat /tmp/race_c.json; echo
echo '--- D ---'; cat /tmp/race_d.json; echo
```

**Kết quả mong đợi:**

| Request | HTTP | Nội dung |
|---|---|---|
| Một request (C hoặc D) | **`201 Created`** | Phiếu mượn hợp lệ, `status: BORROWED` |
| Request còn lại | **`409 Conflict`** | `"Sách "Test Book LAST" vừa được độc giả khác mượn hết. Số lượng khả dụng không còn đủ 1 cuốn, giao dịch đã được hủy bỏ"` |

Thứ tự C/D không quan trọng — quan trọng là **đúng một 201 và đúng một 409**.

**Database sau khi chạy — phần quan trọng nhất:**

```bash
curl -s "$API/books/$BOOK_LAST/stock-check" -H "$H_AUTH"
curl -s "$API/borrowings?bookId=$BOOK_LAST&status=BORROWED" -H "$H_AUTH" \
  | python3 -c 'import sys,json;d=json.load(sys.stdin);print("so phieu dang muon =",d["meta"]["totalItems"])'
```

| Kiểm tra | Giá trị bắt buộc |
|---|---|
| `copiesAvailable` | **`0`** — không phải `-1` |
| Số phiếu mượn `BORROWED` cho Sách LAST | **`1`** — không phải `2` |
| `current_borrowed_count` của độc giả thất bại | **không tăng** |

### TC-11. Lặp lại nhiều lần để chắc chắn không phải may mắn

```bash
for i in $(seq 1 8); do
  reset_last > /dev/null

  curl -s -o /tmp/r1.txt -w '%{http_code}' -X POST "$API/borrowings" \
    -H "$H_AUTH" -H "$H_JSON" -d '{"memberId":"'$MEMBER_C'","bookId":"'$BOOK_LAST'"}' > /tmp/c1.txt &
  curl -s -o /tmp/r2.txt -w '%{http_code}' -X POST "$API/borrowings" \
    -H "$H_AUTH" -H "$H_JSON" -d '{"memberId":"'$MEMBER_D'","bookId":"'$BOOK_LAST'"}' > /tmp/c2.txt &
  wait

  STOCK=$(curl -s "$API/books/$BOOK_LAST/stock-check" -H "$H_AUTH" \
    | python3 -c 'import sys,json;print(json.load(sys.stdin)["copiesAvailable"])')
  LOANS=$(curl -s "$API/borrowings?bookId=$BOOK_LAST&status=BORROWED" -H "$H_AUTH" \
    | python3 -c 'import sys,json;print(json.load(sys.stdin)["meta"]["totalItems"])')

  echo "Lan $i -> HTTP $(cat /tmp/c1.txt)/$(cat /tmp/c2.txt) | ton kho = $STOCK | so phieu dang muon = $LOANS"
done

reset_last
```

**Kết quả mong đợi:** mọi vòng đều in `ton kho = 0 | so phieu dang muon = 1`, và cặp HTTP luôn là một `201` cùng một `409`.

| Dấu hiệu sai | Kết luận |
|---|---|
| `ton kho = -1` | Trừ kho không nguyên tử ⇒ **không đạt** |
| `so phieu dang muon = 2` | Cả hai độc giả đều mượn được bản cuối ⇒ **không đạt** |
| Cặp HTTP là `201/201` | Không phát hiện tranh chấp ⇒ **không đạt** |
| Cặp HTTP là `409/409` | Chặn cả hai, thư viện mất một lượt cho mượn hợp lệ ⇒ **không đạt** |

### TC-12. Tranh chấp ở bước phê duyệt phiếu ERP

```bash
reset_last > /dev/null

# Hai phiếu ERP cùng xin 1 bản sách cuối cùng
S1=$(curl -s -X POST "$API/borrowing-slips" -H "$H_AUTH" -H "$H_JSON" \
  -d '{"memberId":"'$MEMBER_C'","items":[{"bookId":"'$BOOK_LAST'","quantity":1}]}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
S2=$(curl -s -X POST "$API/borrowing-slips" -H "$H_AUTH" -H "$H_JSON" \
  -d '{"memberId":"'$MEMBER_D'","items":[{"bookId":"'$BOOK_LAST'","quantity":1}]}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')

curl -s -o /dev/null -w 'S1=%{http_code}\n' -X PATCH "$API/borrowing-slips/$S1/approve" -H "$H_AUTH" &
curl -s -o /dev/null -w 'S2=%{http_code}\n' -X PATCH "$API/borrowing-slips/$S2/approve" -H "$H_AUTH" &
wait
```

**Kết quả mong đợi:** một phiếu `200 OK` (`status: BORROWED`), phiếu còn lại `409 Conflict` và **vẫn ở `PENDING_APPROVAL`** (chưa bị chuyển trạng thái nửa vời). Tồn kho = `0`.

### TC-13. Phê duyệt hai lần cùng một phiếu (chống double-click)

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X PATCH "$API/borrowing-slips/$S1/approve" -H "$H_AUTH"
```

**Kết quả mong đợi** — `409 Conflict`:

```
"DOCUMENT_ALREADY_PROCESSED: Phiếu mượn này đang ở trạng thái "BORROWED", không thể phê duyệt"
```

Tồn kho **không bị trừ lần thứ hai**.

---

## PHẦN 6. Tình huống 4 — Trả sách quá hạn & tiền phạt

> Mượn 3 quyển: 2 quyển trả đúng hạn, 1 quyển trả muộn 5 ngày. Phạt 5.000 VNĐ/ngày/quyển.
> **Kết quả mong đợi: tổng phạt = 5 × 5.000 × 1 = 25.000 VNĐ.**

### TC-14. Trả đúng hạn — không phát sinh phạt

```bash
curl -s -X POST "$API/borrowings/$B1/return" -H "$H_AUTH" -H "$H_JSON" \
  -d '{"notes":"Sach nguyen ven"}'
```

**Kết quả mong đợi** — `200 OK`:

| Trường | Giá trị |
|---|---|
| `status` | `RETURNED` |
| `returnDate` | thời điểm trả |
| `fineAmount` | **`0`** |
| `finePaid` | `true` (không nợ gì nên coi như đã thanh lý) |
| `finePaidAt` | không có |

**Database:**

| Bảng.cột | Thay đổi |
|---|---|
| `books.copies_available` | **+1** |
| `members.current_borrowed_count` | **−1** |

Làm tương tự cho quyển thứ hai (`$B2`) — cũng `fineAmount: 0`.

### TC-15. Trả muộn 5 ngày — phạt 25.000 VNĐ

```bash
# Tạo phiếu mượn mới rồi dịch hạn trả về 5 ngày trước
B3=$(curl -s -X POST "$API/borrowings" -H "$H_AUTH" -H "$H_JSON" \
  -d '{"memberId":"'$MEMBER_A'","bookId":"'$BOOK_X'"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
echo "B3=$B3"
```

```sql
-- Chạy trong Supabase SQL Editor
UPDATE borrowings SET due_date = NOW() - INTERVAL '5 days' WHERE id = '<B3>';
```

```bash
curl -s "$API/borrowings/$B3" -H "$H_AUTH"
```

**Kết quả mong đợi trước khi trả** — `200 OK`:

| Trường | Giá trị |
|---|---|
| `status` | **`OVERDUE`** (tự động chuyển khi đọc dữ liệu) |
| `fineAmount` | **`25000`** (phạt dồn tích theo ngày) |
| `finePaid` | `false` |
| `returnDate` | không có |

```bash
curl -s -X POST "$API/borrowings/$B3/return" -H "$H_AUTH" -H "$H_JSON" \
  -d '{"notes":"Tra muon 5 ngay"}'
```

**Kết quả mong đợi khi trả** — `200 OK`:

| Trường | Giá trị |
|---|---|
| `status` | `RETURNED` |
| `returnDate` | thời điểm trả |
| `fineAmount` | **`25000`** = 5 ngày × 5.000 × 1 cuốn |
| `finePaid` | **`false`** ⟵ **đã trả sách nhưng CHƯA nộp phạt** |
| `finePaidAt` | không có |

> **Chấm điểm — điểm phân loại:** yêu cầu *"Phân biệt trạng thái đã trả sách và trạng thái đã thanh toán tiền phạt"*. Bài nào đặt `finePaid = true` ngay khi trả sách thì **không phân biệt được hai trạng thái** ⇒ **sai**.

### TC-16. Khoản phạt được ghi nhận thành nợ và chặn mượn tiếp

```bash
curl -s "$API/borrowings/fines/unpaid?memberId=$MEMBER_A" -H "$H_AUTH"
```

**Kết quả mong đợi** — `200 OK`:

| Trường | Giá trị |
|---|---|
| `totalUnpaidFine` | `25000` |
| `totalRecords` | `1` |
| `items[0].fineAmount` | `25000` |
| `items[0].finePaid` | `false` |

```bash
curl -s "$API/members/$MEMBER_A/debt-summary" -H "$H_AUTH"
```

| Trường | Giá trị |
|---|---|
| `totalUnpaidFine` | `25000` |
| `canBorrow` | **`false`** |
| `blockReason` | `UNPAID_FINE` |
| `reasonIfNotAllowed` | `"Độc giả còn nợ tiền phạt chưa thanh toán (25.000 VNĐ). Cần thanh toán trước khi mượn tiếp"` |

```bash
curl -i -s -X POST "$API/borrowings" -H "$H_AUTH" -H "$H_JSON" \
  -d '{"memberId":"'$MEMBER_A'","bookId":"'$BOOK_X'"}'
```

**Kết quả mong đợi** — `400 Bad Request`, cùng thông điệp về nợ phạt.

> **Chấm điểm:** luật "nợ phạt thì không được mượn" phải chặn ở **luồng ghi**, không chỉ hiện ở endpoint xem thông tin.

### TC-17. Thanh toán phạt

```bash
curl -s -X POST "$API/borrowings/$B3/pay-fine" -H "$H_AUTH"
```

**Kết quả mong đợi** — `200 OK`:

| Trường | Giá trị |
|---|---|
| `fineAmount` | `25000` (giữ nguyên, là số tiền đã thu) |
| `finePaid` | **`true`** |
| `finePaidAt` | thời điểm thanh toán |
| `status` | `RETURNED` (không đổi) |

Sau đó `canBorrow` của độc giả trở lại `true`.

### TC-18. Thanh toán phạt hai lần

```bash
curl -i -s -X POST "$API/borrowings/$B3/pay-fine" -H "$H_AUTH"
```

**Kết quả mong đợi** — `400 Bad Request`:

```
"Tiền phạt của phiếu mượn này đã được thanh toán trước đó"
```

### TC-19. Trả sách lặp lại — không được tính phạt trùng

```bash
curl -i -s -X POST "$API/borrowings/$B3/return" -H "$H_AUTH" -H "$H_JSON" -d '{}'
```

**Kết quả mong đợi** — `400 Bad Request`:

```
"Phiếu mượn này đã được hoàn trả trước đó"
```

**Database — phải không thay đổi:**

| Kiểm tra | Giá trị |
|---|---|
| `fine_amount` | **vẫn `25000`**, không thành `50000` |
| `books.copies_available` | **không +1 lần nữa** |
| `members.current_borrowed_count` | **không −1 lần nữa** |

> **Chấm điểm:** đây là ca bẫy. Bài nào không khóa theo điều kiện `return_date IS NULL` sẽ cộng phạt và hoàn kho hai lần ⇒ **sai**.

### TC-20. Trả sách quá hạn trên phiếu ERP — phạt theo từng cuốn

```bash
SLIP2=$(curl -s -X POST "$API/borrowing-slips" -H "$H_AUTH" -H "$H_JSON" -d '{
  "memberId":"'$MEMBER_B'",
  "items":[{"bookId":"'$BOOK_X'","quantity":3}]
}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')

curl -s -X PATCH "$API/borrowing-slips/$SLIP2/approve" -H "$H_AUTH" > /dev/null

ITEM2=$(curl -s "$API/borrowing-slips/$SLIP2" -H "$H_AUTH" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["items"][0]["id"])')
echo "SLIP2=$SLIP2  ITEM2=$ITEM2"
```

```sql
-- Thay <SLIP2> bằng giá trị vừa in ra
UPDATE borrowing_slips SET due_date = NOW() - INTERVAL '5 days' WHERE id = '<SLIP2>';
```

```bash
# Trả 1 cuốn trong 3 cuốn, trễ 5 ngày
curl -s -X POST "$API/borrowing-slips/$SLIP2/return-items" -H "$H_AUTH" -H "$H_JSON" -d '{
  "items":[{"itemId":"'$ITEM2'","returnCondition":"GOOD","quantity":1}]
}'
```

**Kết quả mong đợi** — `200 OK`:

| Trường | Giá trị |
|---|---|
| `status` | `PARTIAL_RETURNED` |
| `totalFine` | **`25000`** = 5 ngày × 5.000 × **1 cuốn đã trả** |
| `finePaid` | `false` |
| `items[0].lateFee` | `25000` |
| `items[0].compensationFee` | `0` |
| `items[0].fineAmount` | `25000` |
| `items[0].returnedQuantity` | `1` |
| `items[0].status` | `BORROWING` (còn 2 cuốn chưa trả) |

Trả tiếp 2 cuốn còn lại:

```bash
curl -s -X POST "$API/borrowing-slips/$SLIP2/return-items" -H "$H_AUTH" -H "$H_JSON" -d '{
  "items":[{"itemId":"'$ITEM2'","returnCondition":"GOOD","quantity":2}]
}'
```

| Trường | Giá trị |
|---|---|
| `status` | `COMPLETED` |
| `totalFine` | **`75000`** = 25.000 (đợt 1) + 5 × 5.000 × 2 (đợt 2) |
| `items[0].returnedQuantity` | `3` |
| `items[0].status` | `RETURNED` |

> **Chấm điểm:** phạt đợt 2 chỉ tính trên **2 cuốn của đợt đó**, không tính lại cuốn đã trả ở đợt 1. Bài nào tính `daysLate × rate × quantity_toàn_dòng` mỗi đợt sẽ ra `25000 + 75000 = 100000` ⇒ **sai (tính phạt trùng)**.

### TC-21. Trả lại dòng đã hoàn tất

```bash
curl -i -s -X POST "$API/borrowing-slips/$SLIP2/return-items" -H "$H_AUTH" -H "$H_JSON" -d '{
  "items":[{"itemId":"'$ITEM2'","returnCondition":"GOOD","quantity":1}]
}'
```

**Kết quả mong đợi** — `400 Bad Request`: `"Sách "Test Book X" đã được hoàn tất trước đó"`. `totalFine` **vẫn `75000`**, không tăng.

### TC-22. Trả nhiều hơn số lượng đang mượn

```bash
# Phiếu mới chỉ mượn 1 cuốn, nhưng xin trả 5 cuốn
SLIP4=$(curl -s -X POST "$API/borrowing-slips" -H "$H_AUTH" -H "$H_JSON" -d '{
  "memberId":"'$MEMBER_E'","items":[{"bookId":"'$BOOK_X'","quantity":1}]
}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
curl -s -X PATCH "$API/borrowing-slips/$SLIP4/approve" -H "$H_AUTH" > /dev/null
ITEM4=$(curl -s "$API/borrowing-slips/$SLIP4" -H "$H_AUTH" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["items"][0]["id"])')

curl -i -s -X POST "$API/borrowing-slips/$SLIP4/return-items" -H "$H_AUTH" -H "$H_JSON" -d '{
  "items":[{"itemId":"'$ITEM4'","returnCondition":"GOOD","quantity":5}]
}'
```

**Kết quả mong đợi** — `400 Bad Request`: `"Sách "Test Book X" chỉ còn 1 cuốn chưa hoàn tất, không thể xử lý 5 cuốn"`.

> Bài nào âm thầm cắt bớt về số lượng hợp lệ (`Math.min`) mà vẫn trả `200` là **che lỗi dữ liệu**, không đạt.

---

## PHẦN 7. Tình huống 5 — Gia hạn sách

> Còn 2 ngày đến hạn trả. Có độc giả khác đã đặt trước. Mỗi lượt mượn chỉ gia hạn tối đa **1 lần**, mỗi lần **7 ngày**.

### TC-23. Gia hạn thành công (chưa có ai đặt trước)

```bash
R1=$(curl -s -X POST "$API/borrowings" -H "$H_AUTH" -H "$H_JSON" \
  -d '{"memberId":"'$MEMBER_A'","bookId":"'$BOOK_X'","durationDays":2}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')

curl -s "$API/borrowings/$R1" -H "$H_AUTH" \
  | python3 -c 'import sys,json;d=json.load(sys.stdin);print("dueDate truoc =",d["dueDate"],"renewCount =",d["renewCount"])'

curl -s -X POST "$API/borrowings/$R1/renew" -H "$H_AUTH" -H "$H_JSON" \
  -d '{"extraDays":7,"notes":"Can them thoi gian lam do an","renewedBy":"Thu thu Lan"}'
```

**Kết quả mong đợi** — `200 OK`:

| Trường | Giá trị |
|---|---|
| `renewCount` | **`1`** (từ `0`) |
| `dueDate` | **hạn trả cũ + 7 ngày** (cộng vào hạn cũ, không phải vào ngày hôm nay) |
| `status` | `BORROWED` |
| `notes` | có chứa `"Gia hạn thêm 7 ngày: Can them thoi gian lam do an"` |

**Lịch sử gia hạn (audit):**

```bash
curl -s "$API/borrowings/$R1/renewals" -H "$H_AUTH"
```

| Trường | Giá trị |
|---|---|
| số bản ghi | `1` |
| `[0].sequence` | `1` |
| `[0].previousDueDate` | hạn trả cũ |
| `[0].newDueDate` | hạn trả mới |
| `[0].extraDays` | `7` |
| `[0].renewedBy` | `"Thu thu Lan"` |
| `[0].reason` | `"Can them thoi gian lam do an"` |

> **Chấm điểm:** `dueDate` mới = `dueDate cũ + 7`. Bài nào tính `hôm nay + 7` sẽ **cắt ngắn** thời gian mượn của độc giả ⇒ sai nghiệp vụ.

### TC-24. Gia hạn lần thứ hai — đã đạt giới hạn

```bash
curl -i -s -X POST "$API/borrowings/$R1/renew" -H "$H_AUTH" -H "$H_JSON" -d '{"extraDays":7}'
```

**Kết quả mong đợi** — `400 Bad Request`:

```
"Đã đạt số lần gia hạn tối đa (1 lần) cho lượt mượn này"
```

**Database:** `renewCount` **vẫn `1`**, `due_date` **không đổi**, bảng `loan_renewals` **không có bản ghi thứ hai**.

### TC-25. Gia hạn khi có độc giả khác đặt trước ⟵ **ca quan trọng nhất của tình huống 5**

```bash
# Phiếu mượn mới của A, còn 2 ngày đến hạn
R2=$(curl -s -X POST "$API/borrowings" -H "$H_AUTH" -H "$H_JSON" \
  -d '{"memberId":"'$MEMBER_A'","bookId":"'$BOOK_X'","durationDays":2}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')

# Độc giả B đặt trước chính cuốn sách đó
curl -s -X POST "$API/reservations" -H "$H_AUTH" -H "$H_JSON" -d '{
  "memberId":"'$MEMBER_B'","bookId":"'$BOOK_X'","notes":"Can gap cho ky thi"
}'
```

**Kết quả mong đợi khi đặt trước** — `201 Created`:

| Trường | Giá trị |
|---|---|
| `reservationCode` | `RSV-2026-NNNN` |
| `status` | `READY` nếu kho còn bản sách, `PENDING` nếu đã hết |
| `expiresAt` | có giá trị khi `status = READY` (giữ 3 ngày) |
| `memberName`, `bookTitle` | giá trị thật |

```bash
curl -s "$API/reservations/book/$BOOK_X/queue" -H "$H_AUTH"
```

Hàng đợi phải chứa phiếu của `MEMBER_B` với `status` thuộc `PENDING` / `READY`.

```bash
curl -i -s -X POST "$API/borrowings/$R2/renew" -H "$H_AUTH" -H "$H_JSON" -d '{"extraDays":7}'
```

**Kết quả mong đợi** — **`409 Conflict`**:

```
"Cuốn sách "Test Book X" đang có 1 độc giả khác đặt trước.
 Theo chính sách thư viện, phiếu mượn này không được gia hạn và cần hoàn trả đúng hạn"
```

**Database — phải không thay đổi:**

| Kiểm tra | Giá trị |
|---|---|
| `borrowings.renew_count` của `$R2` | **vẫn `0`** |
| `borrowings.due_date` của `$R2` | **không đổi** |
| Số bản ghi `loan_renewals` của `$R2` | **`0`** |

### TC-26. Chính độc giả đang mượn tự đặt trước thì KHÔNG bị chặn gia hạn

```bash
# Hủy phiếu của B, cho chính A đặt trước
RSV_B=$(curl -s "$API/reservations?bookId=$BOOK_X&memberId=$MEMBER_B" -H "$H_AUTH" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"][0]["id"])')
curl -s -X PATCH "$API/reservations/$RSV_B/cancel" -H "$H_AUTH" -H "$H_JSON" \
  -d '{"reason":"Doi y"}' > /dev/null

curl -i -s -X POST "$API/borrowings/$R2/renew" -H "$H_AUTH" -H "$H_JSON" -d '{"extraDays":7}'
```

**Kết quả mong đợi** — `200 OK`, `renewCount: 1`. Hàng đợi đã trống nên không còn lý do chặn.

> **Chấm điểm:** điều kiện chặn phải là *"đặt trước của **độc giả khác**, còn hiệu lực"*. Bài nào chặn cả phiếu đặt trước của chính người đang mượn, hoặc đếm cả phiếu đã `CANCELLED` / `EXPIRED` / `FULFILLED` ⇒ **sai**.

### TC-27. Gia hạn khi sách đã trả

```bash
R3=$(curl -s -X POST "$API/borrowings" -H "$H_AUTH" -H "$H_JSON" \
  -d '{"memberId":"'$MEMBER_B'","bookId":"'$BOOK_X'","durationDays":5}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')

curl -s -X POST "$API/borrowings/$R3/return" -H "$H_AUTH" -H "$H_JSON" -d '{}' > /dev/null
curl -i -s -X POST "$API/borrowings/$R3/renew" -H "$H_AUTH" -H "$H_JSON" -d '{"extraDays":7}'
```

**Kết quả mong đợi** — `400 Bad Request`:

```
"Phiếu mượn đã hoàn tất trả sách, không thể gia hạn thêm"
```

### TC-28. Gia hạn khi đã quá hạn

```bash
R4=$(curl -s -X POST "$API/borrowings" -H "$H_AUTH" -H "$H_JSON" \
  -d '{"memberId":"'$MEMBER_B'","bookId":"'$BOOK_X'","durationDays":5}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
echo "R4=$R4"
```

```sql
UPDATE borrowings SET due_date = NOW() - INTERVAL '3 days' WHERE id = '<R4>';
```

```bash
curl -i -s -X POST "$API/borrowings/$R4/renew" -H "$H_AUTH" -H "$H_JSON" -d '{"extraDays":7}'
```

**Kết quả mong đợi** — `400 Bad Request`:

```
"Phiếu mượn đã quá hạn chót trả sách. Không được phép gia hạn thêm"
```

### TC-29. Gia hạn phiếu mượn ERP

```bash
SLIP3=$(curl -s -X POST "$API/borrowing-slips" -H "$H_AUTH" -H "$H_JSON" -d '{
  "memberId":"'$MEMBER_E'","items":[{"bookId":"'$BOOK_X'","quantity":1}],"expectedReturnDays":2
}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
curl -s -X PATCH "$API/borrowing-slips/$SLIP3/approve" -H "$H_AUTH" > /dev/null

curl -s -X PATCH "$API/borrowing-slips/$SLIP3/renew" -H "$H_AUTH" -H "$H_JSON" \
  -d '{"extraDays":7,"renewedBy":"Thu thu Lan"}'
```

**Kết quả mong đợi** — `200 OK`: `renewCount: 1`, `dueDate` = hạn cũ + 7 ngày.
Gọi lần hai ⇒ `400` `"Đã đạt số lần gia hạn tối đa (1 lần) cho phiếu mượn này"`.

### TC-30. Hàng đợi đặt trước được đánh thức khi sách về kho

```bash
# Độc giả E mượn bản duy nhất -> Sách LAST hết hàng
reset_last > /dev/null
BL=$(curl -s -X POST "$API/borrowings" -H "$H_AUTH" -H "$H_JSON" \
  -d '{"memberId":"'$MEMBER_E'","bookId":"'$BOOK_LAST'"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')

# Độc giả B xếp hàng đợi
curl -s -X POST "$API/reservations" -H "$H_AUTH" -H "$H_JSON" \
  -d '{"memberId":"'$MEMBER_B'","bookId":"'$BOOK_LAST'"}'
```

**Mong đợi:** `201 Created`, `status: PENDING` (sách đang hết, phải chờ), `expiresAt` không có.

```bash
curl -s -X POST "$API/borrowings/$BL/return" -H "$H_AUTH" -H "$H_JSON" -d '{}' > /dev/null
curl -s "$API/reservations/book/$BOOK_LAST/queue" -H "$H_AUTH"
```

**Mong đợi:** phiếu của `MEMBER_B` chuyển sang `status: READY`, có `readyAt` và `expiresAt` = `readyAt + 3 ngày`.

---

## PHẦN 8. Bảng đáp án tổng hợp (dùng để chấm điểm)

### 8.1 Mười ba ca kiểm thử bắt buộc theo đề

| # | Ca kiểm thử | Mã TC | HTTP | Kết quả then chốt |
|---|---|---|---|---|
| 1 | Mượn sách thành công | TC-01…03 | `201` | `status BORROWED`, `dueDate = borrowDate + 14`, tồn kho `−1`, `currentBorrowedCount +1` |
| 2 | Mượn khi vượt giới hạn | TC-05, TC-07 | `400` | Thông điệp nêu rõ số còn được mượn / số yêu cầu; **không tạo dữ liệu, không trừ kho** |
| 3 | Mượn khi độc giả bị khóa | TC-08 | `400` | `"Thẻ độc giả đang ở trạng thái "SUSPENDED""` |
| 4 | Mượn khi còn nợ phạt | TC-16 | `400` | `"còn nợ tiền phạt chưa thanh toán (25.000 VNĐ)"`; chặn ở luồng ghi |
| 5 | Mượn khi sách hết hàng | TC-09 | `400` | `"đã hết bản in sẵn có để mượn"`; `copiesAvailable = 0` |
| 6 | Hai request đồng thời mượn bản cuối | TC-10…12 | `201` + `409` | Đúng **1** phiếu mượn, tồn kho `= 0`, **không âm** |
| 7 | Trả sách đúng hạn | TC-14 | `200` | `fineAmount 0`, `status RETURNED`, tồn kho `+1` |
| 8 | Trả sách quá hạn 5 ngày | TC-15 | `200` | `fineAmount = 25000`, `finePaid = false` |
| 9 | Trả sách lặp lại | TC-19 | `400` | `fine_amount` **vẫn 25000**, tồn kho **không +1 lần hai** |
| 10 | Gia hạn thành công | TC-23 | `200` | `renewCount 1`, `dueDate = hạn cũ + 7`, có bản ghi `loan_renewals` |
| 11 | Gia hạn khi đạt giới hạn | TC-24 | `400` | `"Đã đạt số lần gia hạn tối đa (1 lần)"`; `renewCount` vẫn `1` |
| 12 | Gia hạn khi có người đặt trước | TC-25 | **`409`** | `"đang có 1 độc giả khác đặt trước"`; `renewCount` vẫn `0` |
| 13 | Gia hạn khi sách đã trả | TC-27 | `400` | `"đã hoàn tất trả sách, không thể gia hạn thêm"` |

### 8.2 Quy ước mã lỗi

| Mã | Dùng cho | Ví dụ |
|---|---|---|
| `400` | Vi phạm điều kiện nghiệp vụ đã biết tại thời điểm nhận request | Vượt hạn mức, thẻ bị khóa, nợ phạt, sách hết hàng, hết số lần gia hạn, đã quá hạn, trả sách trùng |
| `404` | Không tìm thấy bản ghi | `memberId` / `bookId` / `borrowingId` không tồn tại |
| `409` | **Xung đột trạng thái / tranh chấp đồng thời** | Thua tranh chấp bản sách cuối cùng, phê duyệt phiếu hai lần, gia hạn khi có người đặt trước, hai request cùng xử lý một bản ghi |
| `422` | *không dùng* | — |
| `500` | Chỉ cho lỗi hệ thống thật. **Không bao giờ được xuất hiện** trong 13 ca trên | — |

Mọi response lỗi có cấu trúc thống nhất, **không chứa stack trace và không chứa tên bảng / câu SQL**:

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "...",
  "timestamp": "2026-11-10T09:00:00.000Z",
  "path": "/api/borrowings",
  "method": "POST"
}
```

### 8.3 Chạy test tự động

```bash
npm run lint      # mong đợi: không có warning/error
npm run build     # mong đợi: biên dịch thành công
npm run test      # mong đợi: 4 test file, 77 test case, tất cả PASS
```

Phân bố test:

| File | Phạm vi |
|---|---|
| `src/modules/loan-policy/loan-policy.service.spec.ts` | Công thức tính ngày quá hạn, tiền phạt, hạn trả, số ngày gia hạn |
| `src/modules/borrowings/borrowings.service.spec.ts` | Toàn bộ 5 tình huống trên luồng phiếu mượn lẻ, gồm cả tranh chấp tồn kho và trả sách trùng |
| `src/modules/borrowing-slips/borrowing-slips.service.spec.ts` | Luồng ERP: hạn mức nhiều cuốn, phê duyệt tranh chấp, trả từng phần, bồi thường mất sách, gia hạn |
| `src/modules/books/books.service.spec.ts` | Nghiệp vụ sách có từ trước |

---

## PHẦN 9. Những lỗi thường gặp cần soi khi chấm

Danh sách này chính là các lỗi **thực tế đã tồn tại trong bản code ban đầu của dự án**, nên rất dễ gặp lại ở bài học viên.

| # | Lỗi | Cách phát hiện nhanh | Hệ quả |
|---|---|---|---|
| 1 | **Đọc tồn kho rồi ghi giá trị tuyệt đối**: `copiesAvailable: book.copiesAvailable - 1` | Tìm trong code: có `- 1` / `+ 1` trên giá trị vừa đọc thay vì `{ decrement: 1 }` kèm điều kiện | Cho mượn 2 lần bản sách cuối, tồn kho âm — **TC-10 fail** |
| 2 | **Kiểm tra tồn kho ngoài transaction** rồi mới mở transaction để ghi | `findUnique` kiểm tra số lượng nằm trước `$transaction` | Check-then-act không nguyên tử — **TC-10 / TC-12 fail** |
| 3 | **Dùng `$transaction([...])` dạng mảng** cho nghiệp vụ cần đọc-rồi-ghi | Không thấy `$transaction(async (tx) => ...)` | Không thể đọc trong transaction, mọi kiểm tra đều ở ngoài |
| 4 | **Sinh mã phiếu bằng `count() + 1`** ngoài transaction | `const n = await prisma.borrowing.count()` | Hai request đồng thời sinh mã trùng, vi phạm unique |
| 5 | **Đếm ngày quá hạn bằng `Math.ceil(ms / 86400000)`** | Có `Math.ceil` trên hiệu thời gian | Trễ 1 phút bị phạt 1 ngày — **TC-15 ra sai số** |
| 6 | **Đặt `finePaid = true` ngay khi trả sách** | `finePaid: dto.finePaid ?? true` | Không phân biệt đã trả sách / đã nộp phạt — **TC-15 fail** |
| 7 | **Trả sách không khóa theo `return_date IS NULL`** | `update({ where: { id } })` không kèm điều kiện trạng thái | Trả trùng cộng phạt và hoàn kho hai lần — **TC-19 fail** |
| 8 | **Chỉ đếm hạn mức trên một bảng** | `member.borrowings.length` mà không cộng phiếu ERP | Cho mượn vượt hạn mức — **TC-02 / TC-05 ra sai số** |
| 9 | **Luật nợ phạt chỉ nằm ở endpoint đọc** | `debt-summary` có kiểm tra nhưng `borrowBook` thì không | Vẫn mượn được khi đang nợ — **TC-16 fail** |
| 10 | **Hardcode 5000 / 14 / 7 / 2 trong service** | Tìm số trực tiếp trong file service | Không đổi được chính sách; hai luồng mượn lệch nhau |
| 11 | **Không có khái niệm đặt trước** | Không có bảng/model nào cho reservation | Tình huống 5 không thể kiểm thử — **TC-25 fail** |
| 12 | **Không lưu lịch sử gia hạn** | Chỉ tăng `renewCount`, nối chuỗi vào `notes` | Không audit được — **TC-23 thiếu dữ liệu** |
| 13 | **Gia hạn tính từ hôm nay** thay vì từ hạn trả cũ | `newDueDate = now + extraDays` | Cắt ngắn thời gian mượn — **TC-23 ra sai ngày** |
| 14 | **Cập nhật quá hạn bằng vòng lặp N+1** và ghi đè cả khoản đã thu | `for (const loan of loans) await prisma.update(...)` | Chậm, và làm mất trạng thái đã thanh toán |
| 15 | **Trả về `500` kèm thông tin database** | Thử gửi `bookId` không tồn tại, xem response | Lộ thông tin nội bộ — vi phạm yêu cầu bảo mật |
| 16 | **Âm thầm cắt bớt số lượng trả** bằng `Math.min` và vẫn trả `200` | `Math.min(reqItem.quantity, remaining)` | Che lỗi dữ liệu — **TC-22 fail** |

### 9.1 Ba câu truy vấn kiểm tra toàn vẹn dữ liệu sau khi test

```sql
-- 1. Tồn kho không được âm và không được vượt tổng số bản
SELECT id, title, copies_available, copies_total
FROM books
WHERE copies_available < 0 OR copies_available > copies_total;
-- Mong đợi: 0 dòng

-- 2. Tồn kho phải khớp với số sách thực tế đang cho mượn
SELECT b.id, b.title, b.copies_available,
       b.copies_total - (COALESCE(l.qty,0) + COALESCE(s.qty,0)) AS ton_kho_dung
FROM books b
LEFT JOIN (
  SELECT book_id, COUNT(*) qty FROM borrowings
  WHERE return_date IS NULL AND status IN ('BORROWED','OVERDUE') GROUP BY book_id
) l ON l.book_id = b.id
LEFT JOIN (
  SELECT i.book_id, SUM(i.quantity - i.returned_quantity - i.lost_quantity) qty
  FROM borrowing_slip_items i JOIN borrowing_slips s2 ON s2.id = i.slip_id
  WHERE s2.status IN ('BORROWED','PARTIAL_RETURNED') AND i.status IN ('PENDING','BORROWING')
  GROUP BY i.book_id
) s ON s.book_id = b.id
WHERE b.copies_available <> b.copies_total - (COALESCE(l.qty,0) + COALESCE(s.qty,0));
-- Mong đợi: 0 dòng

-- 3. Không được có phiếu đã trả mà vẫn thiếu ngày trả, hoặc chưa trả mà đã có ngày trả
SELECT id, status, return_date FROM borrowings
WHERE (status = 'RETURNED' AND return_date IS NULL)
   OR (status <> 'RETURNED' AND return_date IS NOT NULL);
-- Mong đợi: 0 dòng
```

### 9.2 Dọn dữ liệu test

Chạy trong một transaction để nếu có ràng buộc nào chặn thì không xóa dở dang:

```sql
BEGIN;

-- Danh sách độc giả test
CREATE TEMP TABLE tmp_test_members AS
SELECT id FROM members WHERE email IN (
  'test.a@librobe.vn','test.b@librobe.vn','test.c@librobe.vn',
  'test.d@librobe.vn','test.e@librobe.vn'
);

-- Xóa theo đúng thứ tự phụ thuộc khóa ngoại
DELETE FROM loan_renewals
WHERE borrowing_id IN (SELECT id FROM borrowings WHERE member_id IN (SELECT id FROM tmp_test_members))
   OR slip_id      IN (SELECT id FROM borrowing_slips WHERE member_id IN (SELECT id FROM tmp_test_members));

DELETE FROM reservations WHERE member_id IN (SELECT id FROM tmp_test_members);

DELETE FROM borrowing_slip_items WHERE slip_id IN
  (SELECT id FROM borrowing_slips WHERE member_id IN (SELECT id FROM tmp_test_members));

DELETE FROM borrowing_slips WHERE member_id IN (SELECT id FROM tmp_test_members);
DELETE FROM borrowings     WHERE member_id IN (SELECT id FROM tmp_test_members);
DELETE FROM members        WHERE id        IN (SELECT id FROM tmp_test_members);
DELETE FROM books          WHERE isbn IN ('9790000000011','9790000000028');

DROP TABLE tmp_test_members;
COMMIT;
```
