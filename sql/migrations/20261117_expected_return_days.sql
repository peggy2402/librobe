-- ============================================================================
-- Thêm cột lưu số ngày độc giả xin mượn, phục vụ việc tính lại hạn trả
-- tại thời điểm thủ thư DUYỆT phiếu (thay vì lúc lập phiếu).
--
-- Vì sao cần cột này: lúc duyệt, backend phải biết độc giả đã xin bao nhiêu
-- ngày để cộng từ mốc duyệt. Mỗi phiếu một số khác nhau (dữ liệu thật:
-- SLIP-2026-0001 xin 1 ngày, SLIP-2026-0002 xin 16 ngày) nên không thể
-- áp cứng LOAN_DEFAULT_DAYS.
--
-- An toàn: thuần THÊM, nullable, không index, không rewrite bảng.
-- Code đang chạy trên production không đọc cột này nên không bị ảnh hưởng.
-- Phiếu cũ (NULL) được backend suy ra số ngày từ (due_date - created_at).
-- ============================================================================

ALTER TABLE "borrowing_slips"
  ADD COLUMN IF NOT EXISTS "expected_return_days" INTEGER;

COMMENT ON COLUMN "borrowing_slips"."expected_return_days" IS
  'So ngay doc gia xin muon, luu tu luc lap phieu. Han tra duoc tinh lai tai thoi diem duyet.';
