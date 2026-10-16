import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PaginatedResponseDto, PaginationDto } from '../../common/dto/pagination.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateAuthorDto } from './dto/create-author.dto.js';
import { UpdateAuthorDto } from './dto/update-author.dto.js';
import { Author } from './entities/author.entity.js';

@Injectable()
export class AuthorsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(pagination: PaginationDto): Promise<PaginatedResponseDto<Author>> {
    const page = pagination.page || 1;
    const limit = pagination.limit || 10;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (pagination.search) {
      where.OR = [
        { name: { contains: pagination.search, mode: 'insensitive' } },
        { nationality: { contains: pagination.search, mode: 'insensitive' } },
        { biography: { contains: pagination.search, mode: 'insensitive' } },
      ];
    }

    const [totalItems, authors] = await Promise.all([
      this.prisma.author.count({ where }),
      this.prisma.author.findMany({
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

    const data: Author[] = authors.map((a) => ({
      id: a.id,
      name: a.name,
      biography: a.biography || '',
      nationality: a.nationality,
      birthYear: a.birthYear ?? undefined,
      bookCount: a._count.books,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
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

  async findOne(id: string): Promise<Author> {
    const author = await this.prisma.author.findUnique({
      where: { id },
      include: {
        _count: { select: { books: true } },
      },
    });

    if (!author) {
      throw new NotFoundException(`Không tìm thấy tác giả với ID "${id}"`);
    }

    return {
      id: author.id,
      name: author.name,
      biography: author.biography || '',
      nationality: author.nationality,
      birthYear: author.birthYear ?? undefined,
      bookCount: author._count.books,
      createdAt: author.createdAt,
      updatedAt: author.updatedAt,
    };
  }

  async create(dto: CreateAuthorDto): Promise<Author> {
    const existing = await this.prisma.author.findUnique({
      where: { name: dto.name.trim() },
    });
    if (existing) {
      throw new ConflictException(`Tác giả với tên "${dto.name}" đã tồn tại trên hệ thống`);
    }

    const created = await this.prisma.author.create({
      data: {
        name: dto.name.trim(),
        biography: dto.biography?.trim() || null,
        nationality: dto.nationality.trim(),
        birthYear: dto.birthYear ?? null,
      },
    });

    return {
      id: created.id,
      name: created.name,
      biography: created.biography || '',
      nationality: created.nationality,
      birthYear: created.birthYear ?? undefined,
      bookCount: 0,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    };
  }

  async update(id: string, dto: UpdateAuthorDto): Promise<Author> {
    await this.findOne(id);

    if (dto.name) {
      const duplicate = await this.prisma.author.findUnique({
        where: { name: dto.name.trim() },
      });
      if (duplicate && duplicate.id !== id) {
        throw new ConflictException(`Tác giả với tên "${dto.name}" đã tồn tại`);
      }
    }

    const updated = await this.prisma.author.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.biography !== undefined ? { biography: dto.biography.trim() } : {}),
        ...(dto.nationality ? { nationality: dto.nationality.trim() } : {}),
        ...(dto.birthYear !== undefined ? { birthYear: dto.birthYear } : {}),
      },
      include: {
        _count: { select: { books: true } },
      },
    });

    return {
      id: updated.id,
      name: updated.name,
      biography: updated.biography || '',
      nationality: updated.nationality,
      birthYear: updated.birthYear ?? undefined,
      bookCount: updated._count.books,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  async remove(id: string): Promise<{ message: string; deletedId: string }> {
    await this.findOne(id);

    const bookCount = await this.prisma.book.count({
      where: { authorId: id },
    });

    if (bookCount > 0) {
      throw new ConflictException(
        `Không thể xóa tác giả này vì vẫn còn ${bookCount} cuốn sách của tác giả trong thư viện`,
      );
    }

    await this.prisma.author.delete({ where: { id } });

    return {
      message: `Đã xóa thành công tác giả với ID: ${id}`,
      deletedId: id,
    };
  }
}
