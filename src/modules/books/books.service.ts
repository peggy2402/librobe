import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PaginatedResponseDto } from '../../common/dto/pagination.dto.js';
import { BookStatus } from '../../common/enums/book-status.enum.js';
import { BorrowingStatus } from '../../common/enums/borrowing-status.enum.js';
import { DatabaseService } from '../database/database.service.js';
import { CreateBookDto } from './dto/create-book.dto.js';
import { FilterBookDto } from './dto/filter-book.dto.js';
import { UpdateBookDto } from './dto/update-book.dto.js';
import { Book } from './entities/book.entity.js';

@Injectable()
export class BooksService {
  constructor(private readonly db: DatabaseService) {}

  findAll(filters: FilterBookDto): PaginatedResponseDto<Book> {
    let books = this.db.getBooks();

    // Lọc theo thể loại
    if (filters.categoryId) {
      books = books.filter((b) => b.categoryId === filters.categoryId);
    }

    // Lọc theo tác giả
    if (filters.authorId) {
      books = books.filter((b) => b.authorId === filters.authorId);
    }

    // Lọc theo trạng thái
    if (filters.status) {
      books = books.filter((b) => b.status === filters.status);
    }

    // Lọc theo năm xuất bản
    if (filters.publishYear) {
      books = books.filter((b) => b.publishYear === filters.publishYear);
    }

    // Tìm kiếm đa năng theo từ khóa (Tựa đề, ISBN, Nhà XB, Tác giả, Thể loại)
    if (filters.search) {
      const term = filters.search.toLowerCase();
      books = books.filter(
        (b) =>
          b.title.toLowerCase().includes(term) ||
          b.isbn.toLowerCase().includes(term) ||
          b.publisher.toLowerCase().includes(term) ||
          b.authorName.toLowerCase().includes(term) ||
          b.categoryName.toLowerCase().includes(term) ||
          b.shelfLocation.toLowerCase().includes(term),
      );
    }

    // Sắp xếp
    if (filters.sortBy) {
      const key = filters.sortBy as keyof Book;
      books.sort((a, b) => {
        const valA = a[key] ?? '';
        const valB = b[key] ?? '';
        if (filters.sortOrder === 'ASC') {
          return valA > valB ? 1 : -1;
        }
        return valA < valB ? 1 : -1;
      });
    } else {
      books.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }

    const totalItems = books.length;
    const page = filters.page || 1;
    const limit = filters.limit || 10;
    const totalPages = Math.ceil(totalItems / limit) || 1;
    const startIndex = (page - 1) * limit;
    const data = books.slice(startIndex, startIndex + limit);

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

  findOne(id: string): Book {
    const book = this.db.getBookById(id);
    if (!book) {
      throw new NotFoundException(`Không tìm thấy cuốn sách với ID "${id}"`);
    }
    return book;
  }

  findByIsbn(isbn: string): Book {
    const book = this.db.getBookByIsbn(isbn);
    if (!book) {
      throw new NotFoundException(`Không tìm thấy cuốn sách với mã ISBN "${isbn}"`);
    }
    return book;
  }

  create(dto: CreateBookDto): Book {
    // Kiểm tra trùng ISBN
    const existingIsbn = this.db.getBookByIsbn(dto.isbn.trim());
    if (existingIsbn) {
      throw new ConflictException(`Cuốn sách với mã ISBN "${dto.isbn}" đã tồn tại trong thư viện`);
    }

    // Xác thực Tác giả
    const author = this.db.getAuthorById(dto.authorId);
    if (!author) {
      throw new BadRequestException(`Không tìm thấy tác giả với ID "${dto.authorId}"`);
    }

    // Xác thực Thể loại
    const category = this.db.getCategoryById(dto.categoryId);
    if (!category) {
      throw new BadRequestException(`Không tìm thấy thể loại với ID "${dto.categoryId}"`);
    }

    const now = new Date();
    const newBook: Book = {
      id: `book-${randomUUID().substring(0, 8)}`,
      isbn: dto.isbn.trim(),
      title: dto.title.trim(),
      authorId: author.id,
      authorName: author.name,
      categoryId: category.id,
      categoryName: category.name,
      publisher: dto.publisher.trim(),
      publishYear: dto.publishYear,
      copiesTotal: dto.copiesTotal,
      copiesAvailable: dto.copiesTotal,
      shelfLocation: dto.shelfLocation.trim(),
      status: dto.status ?? BookStatus.AVAILABLE,
      coverUrl: dto.coverUrl?.trim(),
      description: dto.description.trim(),
      createdAt: now,
      updatedAt: now,
    };

    this.db.setBook(newBook);
    return newBook;
  }

  update(id: string, dto: UpdateBookDto): Book {
    const book = this.findOne(id);

    // Kiểm tra trùng ISBN nếu có thay đổi
    if (dto.isbn && dto.isbn.trim() !== book.isbn) {
      const duplicate = this.db.getBookByIsbn(dto.isbn.trim());
      if (duplicate && duplicate.id !== id) {
        throw new ConflictException(`Mã ISBN "${dto.isbn}" đã được sử dụng bởi cuốn sách khác`);
      }
    }

    // Xác thực tác giả mới nếu có
    let authorName = book.authorName;
    if (dto.authorId && dto.authorId !== book.authorId) {
      const author = this.db.getAuthorById(dto.authorId);
      if (!author) {
        throw new BadRequestException(`Không tìm thấy tác giả với ID "${dto.authorId}"`);
      }
      authorName = author.name;
    }

    // Xác thực thể loại mới nếu có
    let categoryName = book.categoryName;
    if (dto.categoryId && dto.categoryId !== book.categoryId) {
      const category = this.db.getCategoryById(dto.categoryId);
      if (!category) {
        throw new BadRequestException(`Không tìm thấy thể loại với ID "${dto.categoryId}"`);
      }
      categoryName = category.name;
    }

    const newCopiesTotal = dto.copiesTotal ?? book.copiesTotal;
    let newCopiesAvailable = dto.copiesAvailable ?? book.copiesAvailable;

    // Đảm bảo copiesAvailable không lớn hơn copiesTotal
    if (newCopiesAvailable > newCopiesTotal) {
      newCopiesAvailable = newCopiesTotal;
    }

    // Cập nhật trạng thái tự động dựa trên số lượng còn lại
    let status = dto.status ?? book.status;
    if (newCopiesAvailable === 0 && status === BookStatus.AVAILABLE) {
      status = BookStatus.OUT_OF_STOCK;
    } else if (newCopiesAvailable > 0 && status === BookStatus.OUT_OF_STOCK) {
      status = BookStatus.AVAILABLE;
    }

    const updatedBook: Book = {
      ...book,
      isbn: dto.isbn ? dto.isbn.trim() : book.isbn,
      title: dto.title ? dto.title.trim() : book.title,
      authorId: dto.authorId ?? book.authorId,
      authorName,
      categoryId: dto.categoryId ?? book.categoryId,
      categoryName,
      publisher: dto.publisher ? dto.publisher.trim() : book.publisher,
      publishYear: dto.publishYear ?? book.publishYear,
      copiesTotal: newCopiesTotal,
      copiesAvailable: newCopiesAvailable,
      shelfLocation: dto.shelfLocation ? dto.shelfLocation.trim() : book.shelfLocation,
      status,
      coverUrl: dto.coverUrl !== undefined ? dto.coverUrl.trim() : book.coverUrl,
      description: dto.description ? dto.description.trim() : book.description,
      updatedAt: new Date(),
    };

    this.db.setBook(updatedBook);
    return updatedBook;
  }

  remove(id: string): { message: string; deletedId: string } {
    this.findOne(id);

    // Kiểm tra xem có độc giả nào đang mượn sách này không
    const activeBorrowings = this.db
      .getBorrowings()
      .filter(
        (b) =>
          b.bookId === id &&
          (b.status === BorrowingStatus.BORROWED || b.status === BorrowingStatus.OVERDUE),
      );

    if (activeBorrowings.length > 0) {
      throw new ConflictException(
        `Không thể xóa cuốn sách này vì hiện có ${activeBorrowings.length} phiếu mượn đang chưa hoàn trả`,
      );
    }

    this.db.deleteBook(id);
    return {
      message: `Đã xóa thành công cuốn sách với ID: ${id}`,
      deletedId: id,
    };
  }
}
