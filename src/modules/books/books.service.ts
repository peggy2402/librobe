import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaginatedResponseDto } from '../../common/dto/pagination.dto.js';
import { BookStatus } from '../../common/enums/book-status.enum.js';
import { BorrowingStatus } from '../../common/enums/borrowing-status.enum.js';
import { isValidIsbn13, normalizeIsbn } from '../../common/utils/isbn.util.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateBookDto } from './dto/create-book.dto.js';
import { FilterBookDto } from './dto/filter-book.dto.js';
import { UpdateBookDto } from './dto/update-book.dto.js';
import { Book } from './entities/book.entity.js';

@Injectable()
export class BooksService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters: FilterBookDto): Promise<PaginatedResponseDto<Book>> {
    const page = filters.page || 1;
    const limit = filters.limit || 10;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (filters.categoryId) {
      where.categoryId = filters.categoryId;
    }

    if (filters.authorId) {
      where.authorId = filters.authorId;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.publishYear) {
      where.publishYear = filters.publishYear;
    }

    if (filters.search) {
      const term = filters.search.trim();
      const normalizedTerm = normalizeIsbn(term);
      where.OR = [
        { title: { contains: term, mode: 'insensitive' } },
        { isbn: { contains: term, mode: 'insensitive' } },
        ...(normalizedTerm && normalizedTerm !== term
          ? [{ isbn: { contains: normalizedTerm, mode: 'insensitive' } }]
          : []),
        { publisher: { contains: term, mode: 'insensitive' } },
        { shelfLocation: { contains: term, mode: 'insensitive' } },
        { author: { name: { contains: term, mode: 'insensitive' } } },
        { category: { name: { contains: term, mode: 'insensitive' } } },
      ];
    }

    const [totalItems, books] = await Promise.all([
      this.prisma.book.count({ where }),
      this.prisma.book.findMany({
        where,
        skip,
        take: limit,
        include: {
          author: true,
          category: true,
        },
        orderBy: filters.sortBy
          ? { [filters.sortBy]: (filters.sortOrder ?? 'DESC').toLowerCase() }
          : { createdAt: 'desc' },
      }),
    ]);

    const data: Book[] = books.map((b) => this.mapPrismaBookToEntity(b));
    const totalPages = Math.ceil(totalItems / limit) || 1;

    return {
      data,
      meta: {
        page,
        limit,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  async findOne(id: string): Promise<Book> {
    const book = await this.prisma.book.findUnique({
      where: { id },
      include: {
        author: true,
        category: true,
      },
    });

    if (!book) {
      throw new NotFoundException(`Không tìm thấy cuốn sách với ID "${id}"`);
    }

    return this.mapPrismaBookToEntity(book);
  }

  async findByIsbn(isbn: string): Promise<Book> {
    const normalizedIsbn = normalizeIsbn(isbn);
    const book = await this.findBookRecordByIsbn(normalizedIsbn, isbn);

    if (!book) {
      throw new NotFoundException(`Không tìm thấy cuốn sách với mã ISBN "${isbn}"`);
    }

    return this.mapPrismaBookToEntity(book);
  }

  async create(dto: CreateBookDto): Promise<Book> {
    const normalizedIsbn = normalizeIsbn(dto.isbn);
    if (!isValidIsbn13(normalizedIsbn)) {
      throw new BadRequestException('ISBN phải gồm đúng 13 chữ số theo chuẩn ISBN-13');
    }

    const existing = await this.findBookRecordByIsbn(normalizedIsbn, dto.isbn);
    if (existing) {
      throw new ConflictException(`Cuốn sách với mã ISBN "${normalizedIsbn}" đã tồn tại trong thư viện`);
    }

    const author = await this.prisma.author.findUnique({
      where: { id: dto.authorId },
    });
    if (!author) {
      throw new BadRequestException(`Không tìm thấy tác giả với ID "${dto.authorId}"`);
    }

    const category = await this.prisma.category.findUnique({
      where: { id: dto.categoryId },
    });
    if (!category) {
      throw new BadRequestException(`Không tìm thấy thể loại với ID "${dto.categoryId}"`);
    }

    const created = await this.prisma.book.create({
      data: {
        isbn: normalizedIsbn,
        title: dto.title.trim(),
        authorId: author.id,
        categoryId: category.id,
        publisher: dto.publisher.trim(),
        publishYear: dto.publishYear,
        copiesTotal: dto.copiesTotal,
        copiesAvailable: dto.copiesTotal,
        shelfLocation: dto.shelfLocation.trim(),
        status: (dto.status as any) ?? BookStatus.AVAILABLE,
        coverUrl: dto.coverUrl?.trim() || null,
        description: dto.description.trim(),
      },
      include: {
        author: true,
        category: true,
      },
    });

    return this.mapPrismaBookToEntity(created);
  }

  async update(id: string, dto: UpdateBookDto): Promise<Book> {
    const book = await this.findOne(id);

    let normalizedIsbn: string | undefined;
    if (dto.isbn !== undefined) {
      normalizedIsbn = normalizeIsbn(dto.isbn);
      if (!isValidIsbn13(normalizedIsbn)) {
        throw new BadRequestException('ISBN phải gồm đúng 13 chữ số theo chuẩn ISBN-13');
      }

      if (normalizedIsbn !== normalizeIsbn(book.isbn)) {
        const duplicate = await this.findBookRecordByIsbn(normalizedIsbn, dto.isbn);
        if (duplicate && duplicate.id !== id) {
          throw new ConflictException(`Mã ISBN "${normalizedIsbn}" đã được sử dụng bởi cuốn sách khác`);
        }
      }
    }

    if (dto.authorId && dto.authorId !== book.authorId) {
      const author = await this.prisma.author.findUnique({
        where: { id: dto.authorId },
      });
      if (!author) {
        throw new BadRequestException(`Không tìm thấy tác giả với ID "${dto.authorId}"`);
      }
    }

    if (dto.categoryId && dto.categoryId !== book.categoryId) {
      const category = await this.prisma.category.findUnique({
        where: { id: dto.categoryId },
      });
      if (!category) {
        throw new BadRequestException(`Không tìm thấy thể loại với ID "${dto.categoryId}"`);
      }
    }

    const newCopiesTotal = dto.copiesTotal ?? book.copiesTotal;
    let newCopiesAvailable = dto.copiesAvailable ?? book.copiesAvailable;
    if (newCopiesAvailable > newCopiesTotal) {
      newCopiesAvailable = newCopiesTotal;
    }

    let status = (dto.status as any) ?? (book.status as any);
    if (newCopiesAvailable === 0 && status === BookStatus.AVAILABLE) {
      status = BookStatus.AVAILABLE === status ? BookStatus.OUT_OF_STOCK : status;
    } else if (newCopiesAvailable > 0 && status === BookStatus.OUT_OF_STOCK) {
      status = BookStatus.AVAILABLE;
    }

    const updated = await this.prisma.book.update({
      where: { id },
      data: {
        ...(normalizedIsbn ? { isbn: normalizedIsbn } : {}),
        ...(dto.title ? { title: dto.title.trim() } : {}),
        ...(dto.authorId ? { authorId: dto.authorId } : {}),
        ...(dto.categoryId ? { categoryId: dto.categoryId } : {}),
        ...(dto.publisher ? { publisher: dto.publisher.trim() } : {}),
        ...(dto.publishYear ? { publishYear: dto.publishYear } : {}),
        copiesTotal: newCopiesTotal,
        copiesAvailable: newCopiesAvailable,
        ...(dto.shelfLocation ? { shelfLocation: dto.shelfLocation.trim() } : {}),
        status,
        ...(dto.coverUrl !== undefined ? { coverUrl: dto.coverUrl ? dto.coverUrl.trim() : null } : {}),
        ...(dto.description ? { description: dto.description.trim() } : {}),
      },
      include: {
        author: true,
        category: true,
      },
    });

    return this.mapPrismaBookToEntity(updated);
  }

  async remove(id: string): Promise<{ message: string; deletedId: string }> {
    await this.findOne(id);

    const activeBorrowings = await this.prisma.borrowing.count({
      where: {
        bookId: id,
        status: { in: [BorrowingStatus.BORROWED, BorrowingStatus.OVERDUE] },
      },
    });

    if (activeBorrowings > 0) {
      throw new ConflictException(
        `Không thể xóa cuốn sách này vì hiện có ${activeBorrowings} phiếu mượn đang chưa hoàn trả`,
      );
    }

    await this.prisma.book.delete({ where: { id } });

    return {
      message: `Đã xóa thành công cuốn sách với ID: ${id}`,
      deletedId: id,
    };
  }

  private async findBookRecordByIsbn(normalizedIsbn: string, rawIsbn?: string): Promise<any> {
    if (!normalizedIsbn) {
      return null;
    }

    // 1. Tra cứu trực tiếp theo mã ISBN-13 chuẩn hóa (dạng 13 chữ số liền nhau)
    const exactMatch = await this.prisma.book.findUnique({
      where: { isbn: normalizedIsbn },
      include: {
        author: true,
        category: true,
      },
    });
    if (exactMatch) {
      return exactMatch;
    }

    // 2. Hỗ trợ tương thích ngược cho dữ liệu cũ trong DB còn lưu dấu gạch ngang (ví dụ: 978-6042186780)
    const orFilters: any[] = [];
    if (rawIsbn && rawIsbn.trim() !== normalizedIsbn) {
      orFilters.push({ isbn: rawIsbn.trim() });
    }
    if (normalizedIsbn.length >= 3) {
      orFilters.push({ isbn: { startsWith: normalizedIsbn.slice(0, 3) } });
    }

    if (orFilters.length === 0) {
      return null;
    }

    const candidates = await this.prisma.book.findMany({
      where: { OR: orFilters },
      include: {
        author: true,
        category: true,
      },
    });

    return candidates.find((b) => normalizeIsbn(b.isbn) === normalizedIsbn) ?? null;
  }

  private mapPrismaBookToEntity(book: any): Book {
    return {
      id: book.id,
      isbn: normalizeIsbn(book.isbn),
      title: book.title,
      authorId: book.authorId,
      authorName: book.author?.name || 'Chưa xác định',
      categoryId: book.categoryId,
      categoryName: book.category?.name || 'Chưa xác định',
      publisher: book.publisher,
      publishYear: book.publishYear,
      copiesTotal: book.copiesTotal,
      copiesAvailable: book.copiesAvailable,
      shelfLocation: book.shelfLocation,
      status: book.status as BookStatus,
      coverUrl: book.coverUrl || undefined,
      description: book.description,
      createdAt: book.createdAt,
      updatedAt: book.updatedAt,
    };
  }
}
