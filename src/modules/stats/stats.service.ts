import { Injectable } from '@nestjs/common';
import { BorrowingStatus } from '../../common/enums/borrowing-status.enum.js';
import { MemberStatus } from '../../common/enums/member-status.enum.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { LibraryStatsDto, TopBorrowedBookDto } from './dto/library-stats.dto.js';

@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboardStats(): Promise<LibraryStatsDto> {
    const [
      totalBooks,
      bookAgg,
      totalCategories,
      totalAuthors,
      totalMembers,
      activeMembers,
      totalLoans,
      activeLoans,
      overdueLoans,
      totalFinesAgg,
      collectedFinesAgg,
      groupedBorrowings,
    ] = await Promise.all([
      this.prisma.book.count(),
      this.prisma.book.aggregate({
        _sum: {
          copiesTotal: true,
          copiesAvailable: true,
        },
      }),
      this.prisma.category.count(),
      this.prisma.author.count(),
      this.prisma.member.count(),
      this.prisma.member.count({ where: { status: MemberStatus.ACTIVE } }),
      this.prisma.borrowing.count(),
      this.prisma.borrowing.count({
        where: { status: { in: [BorrowingStatus.BORROWED, BorrowingStatus.OVERDUE] } },
      }),
      this.prisma.borrowing.count({ where: { status: BorrowingStatus.OVERDUE } }),
      this.prisma.borrowing.aggregate({
        _sum: { fineAmount: true },
      }),
      this.prisma.borrowing.aggregate({
        where: { finePaid: true },
        _sum: { fineAmount: true },
      }),
      this.prisma.borrowing.groupBy({
        by: ['bookId'],
        _count: { bookId: true },
        orderBy: { _count: { bookId: 'desc' } },
        take: 5,
      }),
    ]);

    const totalCopies = bookAgg._sum.copiesTotal || 0;
    const availableCopies = bookAgg._sum.copiesAvailable || 0;
    const borrowedCopies = totalCopies - availableCopies;
    const totalFines = totalFinesAgg._sum.fineAmount || 0;
    const finesCollected = collectedFinesAgg._sum.fineAmount || 0;

    const topBorrowedBooks: TopBorrowedBookDto[] = await Promise.all(
      groupedBorrowings.map(async (item) => {
        const book = await this.prisma.book.findUnique({
          where: { id: item.bookId },
          include: { author: true },
        });
        return {
          bookId: item.bookId,
          title: book?.title || 'Chưa xác định',
          authorName: book?.author?.name || 'Không rõ tác giả',
          borrowCount: item._count.bookId,
        };
      }),
    );

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
