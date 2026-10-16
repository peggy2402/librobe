import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PaginatedResponseDto, PaginationDto } from '../../common/dto/pagination.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { UpdateCategoryDto } from './dto/update-category.dto.js';
import { Category } from './entities/category.entity.js';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(pagination: PaginationDto): Promise<PaginatedResponseDto<Category>> {
    const page = pagination.page || 1;
    const limit = pagination.limit || 10;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (pagination.search) {
      where.OR = [
        { name: { contains: pagination.search, mode: 'insensitive' } },
        { description: { contains: pagination.search, mode: 'insensitive' } },
      ];
    }

    const [totalItems, categories] = await Promise.all([
      this.prisma.category.count({ where }),
      this.prisma.category.findMany({
        where,
        skip,
        take: limit,
        include: {
          _count: { select: { books: true } },
        },
        orderBy: pagination.sortBy
          ? { [pagination.sortBy]: (pagination.sortOrder ?? 'DESC').toLowerCase() }
          : { createdAt: 'desc' },
      }),
    ]);

    const data: Category[] = categories.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description || '',
      bookCount: c._count.books,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));

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

  async findOne(id: string): Promise<Category> {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: {
        _count: { select: { books: true } },
      },
    });

    if (!category) {
      throw new NotFoundException(`Không tìm thấy thể loại với ID "${id}"`);
    }

    return {
      id: category.id,
      name: category.name,
      description: category.description || '',
      bookCount: category._count.books,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
    };
  }

  async create(dto: CreateCategoryDto): Promise<Category> {
    const existing = await this.prisma.category.findUnique({
      where: { name: dto.name.trim() },
    });
    if (existing) {
      throw new ConflictException(`Thể loại với tên "${dto.name}" đã tồn tại trên hệ thống`);
    }

    const created = await this.prisma.category.create({
      data: {
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
      },
    });

    return {
      id: created.id,
      name: created.name,
      description: created.description || '',
      bookCount: 0,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    };
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<Category> {
    await this.findOne(id);

    if (dto.name) {
      const duplicate = await this.prisma.category.findUnique({
        where: { name: dto.name.trim() },
      });
      if (duplicate && duplicate.id !== id) {
        throw new ConflictException(`Thể loại với tên "${dto.name}" đã tồn tại`);
      }
    }

    const updated = await this.prisma.category.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description.trim() } : {}),
      },
      include: {
        _count: { select: { books: true } },
      },
    });

    return {
      id: updated.id,
      name: updated.name,
      description: updated.description || '',
      bookCount: updated._count.books,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  async remove(id: string): Promise<{ message: string; deletedId: string }> {
    await this.findOne(id);

    const bookCount = await this.prisma.book.count({
      where: { categoryId: id },
    });

    if (bookCount > 0) {
      throw new ConflictException(
        `Không thể xóa thể loại này vì vẫn còn ${bookCount} cuốn sách thuộc về nó trên Supabase`,
      );
    }

    await this.prisma.category.delete({ where: { id } });

    return {
      message: `Đã xóa thành công thể loại với ID: ${id}`,
      deletedId: id,
    };
  }
}
