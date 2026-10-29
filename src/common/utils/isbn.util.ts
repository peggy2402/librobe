/**
 * Chuẩn hóa chuỗi mã ISBN về dạng chữ số liền nhau (loại bỏ dấu gạch ngang và khoảng trắng).
 * Ví dụ: "978-604-218678-0" -> "9786042186780"
 */
export function normalizeIsbn(isbn: string): string {
  if (typeof isbn !== 'string') {
    return '';
  }
  return isbn.replace(/[\s\-–—]+/g, '').trim();
}

/**
 * Kiểm tra chuỗi ISBN sau khi chuẩn hóa có đúng định dạng ISBN-13 (13 chữ số) hay không.
 */
export function isValidIsbn13(normalizedIsbn: string): boolean {
  return /^\d{13}$/.test(normalizedIsbn);
}

