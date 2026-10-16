import { Injectable } from '@nestjs/common';
import { BorrowingStatus } from '../../common/enums/borrowing-status.enum.js';
import { MemberStatus } from '../../common/enums/member-status.enum.js';
import { DatabaseService } from '../database/database.service.js';
import { LibraryStatsDto, TopBorrowedBookDto } from './dto/library-stats.dto.js';

@Injectable()
export class StatsService {
  constructor(private readonly db: DatabaseService) {}

  getDashboardStats(): LibraryStatsDto {
    const books = this.db.getBooks();
    const categories = this.db.getCategories();
    const authors = this.db.getAuthors();
    const members = this.db.getMembers();
    const borrowings = this.db.getBorrowings();

    const totalBooks = books.length;
    const totalCopies = books.reduce((sum, b) => sum + b.copiesTotal, 0);
    const availableCopies = books.reduce((sum, b) => sum + b.copiesAvailable, 0);
    const borrowedCopies = totalCopies - availableCopies;

    const totalCategories = categories.length;
    const totalAuthors = authors.length;
    const totalMembers = members.length;
    const activeMembers = members.filter((m) => m.status === MemberStatus.ACTIVE).length;

    const totalLoans = borrowings.length;
    const activeLoans = borrowings.filter(
      (b) => b.status === BorrowingStatus.BORROWED || b.status === BorrowingStatus.OVERDUE,
    ).length;
    const overdueLoans = borrowings.filter((b) => b.status === BorrowingStatus.OVERDUE).length;

    const totalFines = borrowings.reduce((sum, b) => sum + (b.fineAmount || 0), 0);
    const finesCollected = borrowings.reduce(
      (sum, b) => (b.finePaid ? sum + (b.fineAmount || 0) : sum),
      0,
    );

    // Tính top sách được mượn nhiều nhất
    const bookBorrowCountMap = new Map<string, number>();
    borrowings.forEach((b) => {
      bookBorrowCountMap.set(b.bookId, (bookBorrowCountMap.get(b.bookId) || 0) + 1);
    });

    const topBorrowedBooks: TopBorrowedBookDto[] = Array.from(bookBorrowCountMap.entries())
      .map(([bookId, count]) => {
        const book = this.db.getBookById(bookId);
        return {
          bookId,
          title: book?.title ?? 'Sách không xác định',
          authorName: book?.authorName ?? 'Không rõ tác giả',
          borrowCount: count,
        };
      })
      .sort((a, b) => b.borrowCount - a.borrowCount)
      .slice(0, 5);

    return {
      totalBooks,
      totalCopies,
      availableCopies,
      borrowedCopies,
      totalCategories,
      totalAuthors,
      totalMembers,
      activeMembers,
      totalLoans,
      activeLoans,
      overdueLoans,
      totalFines,
      finesCollected,
      topBorrowedBooks,
    };
  }
}
