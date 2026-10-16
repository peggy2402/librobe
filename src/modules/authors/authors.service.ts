import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PaginatedResponseDto, PaginationDto } from '../../common/dto/pagination.dto.js';
import { DatabaseService } from '../database/database.service.js';
import { CreateAuthorDto } from './dto/create-author.dto.js';
import { UpdateAuthorDto } from './dto/update-author.dto.js';
import { Author } from './entities/author.entity.js';

@Injectable()
export class AuthorsService {
  constructor(private readonly db: DatabaseService) {}

  findAll(pagination: PaginationDto): PaginatedResponseDto<Author> {
    let authors = this.db.getAuthors();
    const books = this.db.getBooks();

    authors = authors.map((auth) => ({
      ...auth,
      bookCount: books.filter((b) => b.authorId === auth.id).length,
    }));

    if (pagination.search) {
      const term = pagination.search.toLowerCase();
      authors = authors.filter(
        (a) =>
          a.name.toLowerCase().includes(term) ||
          a.nationality.toLowerCase().includes(term) ||
          a.biography.toLowerCase().includes(term),
      );
    }

    if (pagination.sortBy) {
      const key = pagination.sortBy as keyof Author;
      authors.sort((a, b) => {
        const valA = a[key] ?? '';
        const valB = b[key] ?? '';
        if (pagination.sortOrder === 'ASC') {
          return valA > valB ? 1 : -1;
        }
        return valA < valB ? 1 : -1;
      });
    } else {
      authors.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }

    const totalItems = authors.length;
    const page = pagination.page || 1;
    const limit = pagination.limit || 10;
    const totalPages = Math.ceil(totalItems / limit) || 1;
    const startIndex = (page - 1) * limit;
    const data = authors.slice(startIndex, startIndex + limit);

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

  findOne(id: string): Author {
    const author = this.db.getAuthorById(id);
    if (!author) {
      throw new NotFoundException(`Không tìm thấy tác giả với ID "${id}"`);
    }
    const bookCount = this.db.getBooks().filter((b) => b.authorId === id).length;
    return { ...author, bookCount };
  }

  create(dto: CreateAuthorDto): Author {
    const existing = this.db
      .getAuthors()
      .find((a) => a.name.toLowerCase() === dto.name.trim().toLowerCase());
    if (existing) {
      throw new ConflictException(`Tác giả với tên "${dto.name}" đã tồn tại trong hệ thống`);
    }

    const now = new Date();
    const newAuthor: Author = {
      id: `auth-${randomUUID().substring(0, 8)}`,
      name: dto.name.trim(),
      biography: dto.biography?.trim() ?? '',
      nationality: dto.nationality.trim(),
      birthYear: dto.birthYear,
      bookCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    this.db.setAuthor(newAuthor);
    return newAuthor;
  }

  update(id: string, dto: UpdateAuthorDto): Author {
    const existing = this.findOne(id);

    if (dto.name && dto.name.trim().toLowerCase() !== existing.name.toLowerCase()) {
      const duplicate = this.db
        .getAuthors()
        .find((a) => a.id !== id && a.name.toLowerCase() === dto.name!.trim().toLowerCase());
      if (duplicate) {
        throw new ConflictException(`Tác giả với tên "${dto.name}" đã tồn tại trong hệ thống`);
      }
    }

    const updatedAuthor: Author = {
      ...existing,
      name: dto.name ? dto.name.trim() : existing.name,
      biography: dto.biography !== undefined ? dto.biography.trim() : existing.biography,
      nationality: dto.nationality ? dto.nationality.trim() : existing.nationality,
      birthYear: dto.birthYear !== undefined ? dto.birthYear : existing.birthYear,
      updatedAt: new Date(),
    };

    this.db.setAuthor(updatedAuthor);
    return updatedAuthor;
  }

  remove(id: string): { message: string; deletedId: string } {
    this.findOne(id);
    const booksWithAuthor = this.db.getBooks().filter((b) => b.authorId === id);
    if (booksWithAuthor.length > 0) {
      throw new ConflictException(
        `Không thể xóa tác giả này vì vẫn còn ${booksWithAuthor.length} cuốn sách của tác giả trong thư viện`,
      );
    }
    this.db.deleteAuthor(id);
    return {
      message: `Đã xóa thành công tác giả với ID: ${id}`,
      deletedId: id,
    };
  }
}
