-- =============================================================================
-- MIGRATION: Nghiệp vụ mượn/trả/gia hạn/đặt trước sách
-- Ngày: 2026-11-10
-- =============================================================================
--
-- ĐẶC TÍNH AN TOÀN:
--   * Chỉ THÊM (CREATE / ADD COLUMN / CREATE INDEX). Không DROP, không RENAME,
--     không ALTER TYPE của cột đang có dữ liệu.
--   * Toàn bộ câu lệnh đều idempotent (IF NOT EXISTS), chạy lại nhiều lần an toàn.
--   * Mọi cột mới đều NULLABLE hoặc có DEFAULT, nên dữ liệu cũ không bị ảnh hưởng.
--   * Ràng buộc CHECK được thêm ở chế độ NOT VALID: áp dụng cho mọi lệnh ghi
--     từ nay về sau nhưng KHÔNG kiểm tra lại dữ liệu cũ, nên migration không thể
--     thất bại vì tồn kho đã bị sai lệch từ trước.
--
-- CÁCH CHẠY (chọn 1 trong 2):
--   A. Supabase SQL Editor / psql:  dán toàn bộ file này và chạy.
--   B. Prisma:  `npm run prisma:push`  (tạo bảng + cột theo schema.prisma),
--      SAU ĐÓ chạy riêng PHẦN 6 bên dưới để thêm các ràng buộc CHECK mà
--      Prisma schema không biểu diễn được.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- PHẦN 1. Enum trạng thái phiếu đặt trước
-- Mục đích: hệ thống chưa từng có khái niệm "đặt trước", nên yêu cầu nghiệp vụ
-- "không cho gia hạn khi sách đang có người chờ" trước đây không thể thực hiện.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ReservationStatus') THEN
    CREATE TYPE "ReservationStatus" AS ENUM (
      'PENDING',    -- đang chờ sách được trả về kho
      'READY',      -- sách đã có và đang được giữ riêng cho độc giả
      'FULFILLED',  -- đã chuyển thành phiếu mượn
      'CANCELLED',  -- độc giả / thủ thư hủy
      'EXPIRED'     -- hết thời gian giữ sách
    );
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- PHẦN 2. Bảng phiếu đặt trước (giữ chỗ) sách
-- -----------------------------------------------------------------------------
-- LƯU Ý QUAN TRỌNG VỀ KIỂU DỮ LIỆU:
-- Các khóa chính trong CSDL này là TEXT (Prisma map `String @id @default(uuid())`
-- thành TEXT), và dữ liệu hiện có chứa cả giá trị dạng "book-01" lẫn UUID.
-- Vì vậy khóa ngoại ở đây PHẢI là TEXT, không được dùng kiểu UUID,
-- nếu không lệnh ADD CONSTRAINT sẽ thất bại do lệch kiểu.
CREATE TABLE IF NOT EXISTS "reservations" (
  "id"               TEXT                NOT NULL DEFAULT gen_random_uuid()::text,
  "reservation_code" TEXT                NOT NULL,
  "member_id"        TEXT                NOT NULL,
  "book_id"          TEXT                NOT NULL,
  "status"           "ReservationStatus" NOT NULL DEFAULT 'PENDING',
  "reserved_at"      TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at"       TIMESTAMP(3),
  "ready_at"         TIMESTAMP(3),
  "fulfilled_at"     TIMESTAMP(3),
  "cancelled_at"     TIMESTAMP(3),
  "cancel_reason"    TEXT,
  "notes"            TEXT,
  "created_at"       TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "reservations_reservation_code_key"
  ON "reservations" ("reservation_code");
CREATE INDEX IF NOT EXISTS "reservations_book_id_status_idx"
  ON "reservations" ("book_id", "status");
CREATE INDEX IF NOT EXISTS "reservations_member_id_status_idx"
  ON "reservations" ("member_id", "status");

-- Khóa ngoại: xóa độc giả thì xóa phiếu giữ chỗ của họ; không cho xóa sách
-- khi vẫn còn phiếu giữ chỗ trỏ tới (Restrict), đồng bộ với schema.prisma.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reservations_member_id_fkey'
  ) THEN
    ALTER TABLE "reservations"
      ADD CONSTRAINT "reservations_member_id_fkey"
      FOREIGN KEY ("member_id") REFERENCES "members" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reservations_book_id_fkey'
  ) THEN
    ALTER TABLE "reservations"
      ADD CONSTRAINT "reservations_book_id_fkey"
      FOREIGN KEY ("book_id") REFERENCES "books" ("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- PHẦN 3. Bảng lịch sử gia hạn (audit trail)
-- Mục đích: trước đây mỗi lần gia hạn chỉ cộng `renew_count` và nối thêm chuỗi
-- vào `notes`, không thể truy vết ai gia hạn, lúc nào, từ hạn nào sang hạn nào.
-- Một bảng dùng chung cho cả phiếu mượn lẻ (borrowing_id) và phiếu mượn ERP (slip_id).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "loan_renewals" (
  "id"                TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
  "borrowing_id"      TEXT,
  "slip_id"           TEXT,
  "sequence"          INTEGER      NOT NULL,
  "previous_due_date" TIMESTAMP(3) NOT NULL,
  "new_due_date"      TIMESTAMP(3) NOT NULL,
  "extra_days"        INTEGER      NOT NULL,
  "renewed_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "renewed_by"        TEXT,
  "reason"            TEXT,
  CONSTRAINT "loan_renewals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "loan_renewals_borrowing_id_idx"
  ON "loan_renewals" ("borrowing_id");
CREATE INDEX IF NOT EXISTS "loan_renewals_slip_id_idx"
  ON "loan_renewals" ("slip_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'loan_renewals_borrowing_id_fkey'
  ) THEN
    ALTER TABLE "loan_renewals"
      ADD CONSTRAINT "loan_renewals_borrowing_id_fkey"
      FOREIGN KEY ("borrowing_id") REFERENCES "borrowings" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'loan_renewals_slip_id_fkey'
  ) THEN
    ALTER TABLE "loan_renewals"
      ADD CONSTRAINT "loan_renewals_slip_id_fkey"
      FOREIGN KEY ("slip_id") REFERENCES "borrowing_slips" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- PHẦN 4. Cột mới trên các bảng đang có
-- -----------------------------------------------------------------------------

-- 4.1 borrowings.fine_paid_at
-- Mục đích: tách bạch "đã trả sách" (return_date) với "đã nộp phạt".
-- Trước đây chỉ có cờ boolean `fine_paid` và luồng trả sách mặc định đặt nó
-- thành true, nên không phân biệt được hai trạng thái này.
ALTER TABLE "borrowings"
  ADD COLUMN IF NOT EXISTS "fine_paid_at" TIMESTAMP(3);

-- 4.2 borrowing_slips.fine_paid_at + renew_count
-- `renew_count`: luồng phiếu mượn ERP trước đây không hỗ trợ gia hạn.
ALTER TABLE "borrowing_slips"
  ADD COLUMN IF NOT EXISTS "fine_paid_at" TIMESTAMP(3);
ALTER TABLE "borrowing_slips"
  ADD COLUMN IF NOT EXISTS "renew_count" INTEGER NOT NULL DEFAULT 0;

-- 4.3 borrowing_slip_items.late_fee + compensation_fee
-- Mục đích: `fine_amount` cũ gộp chung phạt trễ hạn và tiền bồi thường mất sách,
-- không thể kiểm tra lại số tiền đã tính hay đối chiếu chống tính phạt trùng.
-- `fine_amount` được giữ nguyên làm tổng để không phá vỡ API hiện tại.
ALTER TABLE "borrowing_slip_items"
  ADD COLUMN IF NOT EXISTS "late_fee" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "borrowing_slip_items"
  ADD COLUMN IF NOT EXISTS "compensation_fee" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- 4.4 Suy ra giá trị cho dữ liệu cũ: các dòng đã trả trước đây có `fine_amount`
-- nhưng chưa có phân tách. Gán toàn bộ vào late_fee nếu sách không bị mất,
-- vào compensation_fee nếu dòng ở trạng thái LOST. Chỉ chạy một lần, chỉ tác
-- động lên các dòng còn đang để 0 ở cả hai cột mới (tức chưa được suy ra).
UPDATE "borrowing_slip_items"
SET "compensation_fee" = "fine_amount"
WHERE "fine_amount" > 0
  AND "late_fee" = 0
  AND "compensation_fee" = 0
  AND "status" = 'LOST';

UPDATE "borrowing_slip_items"
SET "late_fee" = "fine_amount"
WHERE "fine_amount" > 0
  AND "late_fee" = 0
  AND "compensation_fee" = 0
  AND "status" <> 'LOST';

-- 4.5 Suy ra fine_paid_at cho các khoản phạt cũ đã được đánh dấu đã thu,
-- để báo cáo theo thời gian không bị trống dữ liệu lịch sử.
UPDATE "borrowings"
SET "fine_paid_at" = COALESCE("return_date", "updated_at")
WHERE "fine_paid" = true AND "fine_amount" > 0 AND "fine_paid_at" IS NULL;

UPDATE "borrowing_slips"
SET "fine_paid_at" = "updated_at"
WHERE "fine_paid" = true AND "total_fine" > 0 AND "fine_paid_at" IS NULL;

-- -----------------------------------------------------------------------------
-- PHẦN 5. Index phục vụ truy vấn nghiệp vụ
-- Mục đích: các truy vấn "sách đang mượn của độc giả" và "phiếu quá hạn" chạy
-- trên mọi lần gọi danh sách, trước đây phải full scan.
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "borrowings_member_id_status_idx"
  ON "borrowings" ("member_id", "status");
CREATE INDEX IF NOT EXISTS "borrowings_status_due_date_idx"
  ON "borrowings" ("status", "due_date");
CREATE INDEX IF NOT EXISTS "borrowing_slips_member_id_status_idx"
  ON "borrowing_slips" ("member_id", "status");
CREATE INDEX IF NOT EXISTS "borrowing_slips_status_due_date_idx"
  ON "borrowing_slips" ("status", "due_date");
CREATE INDEX IF NOT EXISTS "borrowing_slip_items_slip_id_status_idx"
  ON "borrowing_slip_items" ("slip_id", "status");

-- -----------------------------------------------------------------------------
-- PHẦN 6. Ràng buộc toàn vẹn tồn kho (Prisma schema không biểu diễn được)
--
-- Đây là lớp phòng thủ cuối cùng cho tình huống hai độc giả cùng mượn bản sách
-- cuối cùng: ngay cả khi tầng ứng dụng có lỗi, database vẫn từ chối ghi
-- copies_available âm hoặc lớn hơn tổng số bản sách.
--
-- Dùng NOT VALID: ràng buộc có hiệu lực với MỌI lệnh INSERT/UPDATE từ nay,
-- nhưng không kiểm tra lại các dòng đã tồn tại -> migration không bao giờ fail
-- vì dữ liệu tồn kho bị sai lệch do bug cũ.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'books_copies_available_non_negative'
  ) THEN
    ALTER TABLE "books"
      ADD CONSTRAINT "books_copies_available_non_negative"
      CHECK ("copies_available" >= 0) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'books_copies_available_within_total'
  ) THEN
    ALTER TABLE "books"
      ADD CONSTRAINT "books_copies_available_within_total"
      CHECK ("copies_available" <= "copies_total") NOT VALID;
  END IF;
END $$;

COMMIT;

-- =============================================================================
-- PHẦN 7 (TÙY CHỌN - CHẠY RIÊNG SAU KHI ĐÃ XEM XÉT)
--
-- Nếu dữ liệu tồn kho hiện tại đã bị sai lệch do lỗi ghi đè giá trị tuyệt đối
-- của bản code cũ, chạy truy vấn KIỂM TRA dưới đây trước. Chỉ khi đã đối chiếu
-- và chấp nhận, mới chạy phần SỬA và VALIDATE.
-- =============================================================================

-- 7.1 KIỂM TRA: liệt kê các cuốn sách có tồn kho không hợp lệ
-- SELECT id, title, copies_available, copies_total
-- FROM books
-- WHERE copies_available < 0 OR copies_available > copies_total;

-- 7.2 KIỂM TRA: đối chiếu tồn kho với số sách thực tế đang cho mượn
-- SELECT b.id, b.title, b.copies_total, b.copies_available,
--        COALESCE(loans.qty, 0) + COALESCE(slips.qty, 0) AS dang_cho_muon,
--        b.copies_total - (COALESCE(loans.qty, 0) + COALESCE(slips.qty, 0)) AS ton_kho_dung
-- FROM books b
-- LEFT JOIN (
--   SELECT book_id, COUNT(*) AS qty FROM borrowings
--   WHERE return_date IS NULL AND status IN ('BORROWED', 'OVERDUE')
--   GROUP BY book_id
-- ) loans ON loans.book_id = b.id
-- LEFT JOIN (
--   SELECT i.book_id,
--          SUM(i.quantity - i.returned_quantity - i.lost_quantity) AS qty
--   FROM borrowing_slip_items i
--   JOIN borrowing_slips s ON s.id = i.slip_id
--   WHERE s.status IN ('BORROWED', 'PARTIAL_RETURNED')
--     AND i.status IN ('PENDING', 'BORROWING')
--   GROUP BY i.book_id
-- ) slips ON slips.book_id = b.id
-- WHERE b.copies_available
--       <> b.copies_total - (COALESCE(loans.qty, 0) + COALESCE(slips.qty, 0));

-- 7.3 SỬA: kẹp tồn kho vào khoảng hợp lệ [0, copies_total]
-- UPDATE books SET copies_available = 0 WHERE copies_available < 0;
-- UPDATE books SET copies_available = copies_total WHERE copies_available > copies_total;

-- 7.4 VALIDATE: kích hoạt kiểm tra ràng buộc trên toàn bộ dữ liệu cũ
-- ALTER TABLE books VALIDATE CONSTRAINT books_copies_available_non_negative;
-- ALTER TABLE books VALIDATE CONSTRAINT books_copies_available_within_total;
