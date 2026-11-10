import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BookStatus } from '../../common/enums/book-status.enum.js';

/**
 * Client Prisma dùng được cả bên trong `$transaction(async (tx) => ...)`
 * và bên ngoài (PrismaService). Nhờ vậy mọi thao tác tồn kho đều có thể
 * tham gia vào transaction của luồng nghiệp vụ gọi nó.
 */
export type PrismaTx = Prisma.TransactionClient;

/**
 * Nơi duy nhất được phép thay đổi `books.copies_available` trong luồng mượn/trả.
 *
 * Vấn đề của code cũ: `borrowBook` đọc `book.copiesAvailable` rồi ghi đè giá trị
 * tuyệt đối (`copiesAvailable: book.copiesAvailable - 1`). Hai request đồng thời
 * cùng đọc `1` và cùng ghi `0` -> thư viện cho mượn 2 lần cuốn sách cuối cùng.
 *
 * Cách làm ở đây là atomic conditional update (compare-and-swap):
 *   UPDATE books SET copies_available = copies_available - $qty
 *   WHERE id = $id AND copies_available >= $qty
 * PostgreSQL khóa dòng khi UPDATE và đánh giá lại điều kiện WHERE sau khi giành
 * được khóa, nên request thua sẽ nhận `count = 0` và bị rollback -> chỉ một
 * giao dịch thành công, tồn kho không bao giờ âm.
 */
@Injectable()
export class BookStockService {
  /**
   * Trừ kho theo cách atomic. Trả về true nếu trừ được, ném 409 nếu hết hàng.
   */
  async decrementAvailable(
    tx: PrismaTx,
    bookId: string,
    quantity: number,
    bookTitle?: string,
  ): Promise<void> {
    const qty = Math.max(1, Math.trunc(quantity));

    const result = await tx.book.updateMany({
      where: {
        id: bookId,
        copiesAvailable: { gte: qty },
        status: { not: BookStatus.DISCONTINUED },
      },
      data: { copiesAvailable: { decrement: qty } },
    });

    if (result.count === 0) {
      throw new ConflictException(
        `Sách ${bookTitle ? `"${bookTitle}" ` : ''}vừa được độc giả khác mượn hết. ` +
          `Số lượng khả dụng không còn đủ ${qty} cuốn, giao dịch đã được hủy bỏ`,
      );
    }

    await this.syncStatus(tx, bookId);
  }

  /**
   * Hoàn sách về kho theo cách atomic, có chặn vượt quá `copiesTotal`
   * để một lỗi trả sách trùng không làm phình tồn kho.
   */
  async incrementAvailable(tx: PrismaTx, bookId: string, quantity: number): Promise<void> {
    const qty = Math.max(1, Math.trunc(quantity));

    // Lưu ý: `books.id` là cột TEXT (dữ liệu hiện có gồm cả dạng "book-01"
    // lẫn UUID do Prisma sinh), nên KHÔNG được cast sang ::uuid ở đây.
    const affected = await tx.$executeRaw`
      UPDATE books
      SET copies_available = copies_available + ${qty}, updated_at = NOW()
      WHERE id = ${bookId}
        AND copies_available + ${qty} <= copies_total
    `;

    if (affected === 0) {
      throw new ConflictException(
        'Không thể hoàn sách về kho: số lượng khả dụng sẽ vượt quá tổng số bản sách của thư viện. ' +
          'Dữ liệu tồn kho có thể đang sai lệch, vui lòng kiểm tra lại phiếu mượn',
      );
    }

    await this.syncStatus(tx, bookId);
  }

  /**
   * Đồng bộ `status` theo tồn kho thực tế. Giữ nguyên DISCONTINUED vì đó là
   * quyết định hành chính của thư viện, không phụ thuộc số lượng.
   */
  async syncStatus(tx: PrismaTx, bookId: string): Promise<void> {
    const book = await tx.book.findUnique({
      where: { id: bookId },
      select: { copiesAvailable: true, status: true },
    });

    if (!book || book.status === BookStatus.DISCONTINUED) {
      return;
    }

    const nextStatus =
      book.copiesAvailable <= 0 ? BookStatus.OUT_OF_STOCK : BookStatus.AVAILABLE;

    if (nextStatus !== book.status) {
      await tx.book.update({
        where: { id: bookId },
        data: { status: nextStatus },
      });
    }
  }
}
