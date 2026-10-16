import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PaginatedResponseDto, PaginationDto } from '../../common/dto/pagination.dto.js';
import { DatabaseService } from '../database/database.service.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { UpdateCategoryDto } from './dto/update-category.dto.js';
import { Category } from './entities/category.entity.js';

@Injectable()
export class CategoriesService {
  constructor(private readonly db: DatabaseService) {}

  findAll(pagination: PaginationDto): PaginatedResponseDto<Category> {
    let categories = this.db.getCategories();

    // Cập nhật số lượng sách theo thời gian thực
    const books = this.db.getBooks();
    categories = categories.map((cat) => ({
      ...cat,
      bookCount: books.filter((b) => b.categoryId === cat.id).length,
    }));

    if (pagination.search) {
      const term = pagination.search.toLowerCase();
      categories = categories.filter(
        (c) =>
          c.name.toLowerCase().includes(term) ||
          c.description.toLowerCase().includes(term),
      );
    }

    if (pagination.sortBy) {
      const key = pagination.sortBy as keyof Category;
      categories.sort((a, b) => {
        const valA = a[key] ?? '';
        const valB = b[key] ?? '';
        if (pagination.sortOrder === 'ASC') {
          return valA > valB ? 1 : -1;
        }
        return valA < valB ? 1 : -1;
      });
    } else {
      categories.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }

    const totalItems = categories.length;
    const page = pagination.page || 1;
    const limit = pagination.limit || 10;
    const totalPages = Math.ceil(totalItems / limit) || 1;
    const startIndex = (page - 1) * limit;
    const data = categories.slice(startIndex, startIndex + limit);

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

  findOne(id: string): Category {
    const category = this.db.getCategoryById(id);
    if (!category) {
      throw new NotFoundException(`Không tìm thấy thể loại với ID "${id}"`);
    }
    const bookCount = this.db.getBooks().filter((b) => b.categoryId === id).length;
    return { ...category, bookCount };
  }

  create(dto: CreateCategoryDto): Category {
    const existing = this.db
      .getCategories()
      .find((c) => c.name.toLowerCase() === dto.name.trim().toLowerCase());
    if (existing) {
      throw new ConflictException(`Thể loại với tên "${dto.name}" đã tồn tại`);
    }

    const now = new Date();
    const newCategory: Category = {
      id: `cat-${randomUUID().substring(0, 8)}`,
      name: dto.name.trim(),
      description: dto.description?.trim() ?? '',
      bookCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    this.db.setCategory(newCategory);
    return newCategory;
  }

  update(id: string, dto: UpdateCategoryDto): Category {
    const existing = this.findOne(id);

    if (dto.name && dto.name.trim().toLowerCase() !== existing.name.toLowerCase()) {
      const duplicate = this.db
        .getCategories()
        .find((c) => c.id !== id && c.name.toLowerCase() === dto.name!.trim().toLowerCase());
      if (duplicate) {
        throw new ConflictException(`Thể loại với tên "${dto.name}" đã tồn tại`);
      }
    }

    const updatedCategory: Category = {
      ...existing,
      name: dto.name ? dto.name.trim() : existing.name,
      description: dto.description !== undefined ? dto.description.trim() : existing.description,
      updatedAt: new Date(),
    };

    this.db.setCategory(updatedCategory);
    return updatedCategory;
  }

  remove(id: string): { message: string; deletedId: string } {
    this.findOne(id);
    const booksWithCategory = this.db.getBooks().filter((b) => b.categoryId === id);
    if (booksWithCategory.length > 0) {
      throw new ConflictException(
        `Không thể xóa thể loại này vì vẫn còn ${booksWithCategory.length} đầu sách đang thuộc về nó`,
      );
    }
    this.db.deleteCategory(id);
    return {
      message: `Đã xóa thành công thể loại với ID: ${id}`,
      deletedId: id,
    };
  }
}
