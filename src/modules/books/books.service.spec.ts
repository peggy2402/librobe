import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BookStatus } from '../../common/enums/book-status.enum.js';
import { isValidIsbn13, normalizeIsbn } from '../../common/utils/isbn.util.js';
import { BooksService } from './books.service.js';

describe('BooksService - ISBN-13 Normalization & Lookup', () => {
  let service: BooksService;
  let prismaMock: any;

  const sampleDbBookNormalized = {
    id: 'book-06',
    isbn: '9786042186780',
    title: 'Mắt Biếc',
    authorId: 'auth-05',
    categoryId: 'cat-03',
    publisher: 'NXB Trẻ',
    publishYear: 2019,
    copiesTotal: 4,
    copiesAvailable: 3,
    shelfLocation: 'Kệ VH-01, Tầng 1',
    status: BookStatus.AVAILABLE,
    coverUrl: null,
    description: 'Câu chuyện tình đơn phương da diết của chàng trai Ngạn.',
    createdAt: new Date(),
    updatedAt: new Date(),
    author: { id: 'auth-05', name: 'Nguyễn Nhật Ánh' },
    category: { id: 'cat-03', name: 'Văn học' },
  };

  const sampleDbBookLegacyHyphenated = {
    ...sampleDbBookNormalized,
    isbn: '978-6042186780',
  };

  beforeEach(() => {
    prismaMock = {
      book: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        count: vi.fn(),
      },
      author: {
        findUnique: vi.fn(),
      },
      category: {
        findUnique: vi.fn(),
      },
    };
    service = new BooksService(prismaMock);
  });

  describe('isbn.util', () => {
    it('nên loại bỏ toàn bộ dấu gạch ngang và khoảng trắng khi chuẩn hóa ISBN', () => {
      expect(normalizeIsbn('978-6042186780')).toBe('9786042186780');
      expect(normalizeIsbn(' 978 - 604 - 218678 - 0 ')).toBe('9786042186780');
      expect(normalizeIsbn('9786042186780')).toBe('9786042186780');
    });

    it('nên kiểm tra chính xác định dạng ISBN-13 gồm 13 chữ số', () => {
      expect(isValidIsbn13('9786042186780')).toBe(true);
      expect(isValidIsbn13('978-6042186780')).toBe(false);
      expect(isValidIsbn13('0132350882')).toBe(false);
    });
  });

  describe('findByIsbn', () => {
    it('nên tìm thấy sách khi truyền mã EAN-13 liền nhau hoặc có dấu gạch ngang', async () => {
      prismaMock.book.findUnique.mockResolvedValueOnce(sampleDbBookNormalized);

      const result = await service.findByIsbn('978-6042186780');

      expect(prismaMock.book.findUnique).toHaveBeenCalledWith({
        where: { isbn: '9786042186780' },
        include: { author: true, category: true },
      });
      expect(result.isbn).toBe('9786042186780');
    });

    it('nên tìm thấy sách dữ liệu cũ có dấu gạch ngang (978-6042186780) khi camera quét ra 9786042186780', async () => {
      prismaMock.book.findUnique.mockResolvedValueOnce(null);
      prismaMock.book.findMany.mockResolvedValueOnce([sampleDbBookLegacyHyphenated]);

      const result = await service.findByIsbn('9786042186780');

      expect(result.id).toBe('book-06');
      expect(result.isbn).toBe('9786042186780');
    });

    it('nên ném lỗi NotFoundException khi không tìm thấy sách', async () => {
      prismaMock.book.findUnique.mockResolvedValueOnce(null);
      prismaMock.book.findMany.mockResolvedValueOnce([]);

      await expect(service.findByIsbn('9780000000000')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('nên chuẩn hóa ISBN có dấu gạch về 13 chữ số trước khi lưu DB', async () => {
      prismaMock.book.findUnique.mockResolvedValueOnce(null);
      prismaMock.book.findMany.mockResolvedValueOnce([]);
      prismaMock.author.findUnique.mockResolvedValueOnce({ id: 'auth-05' });
      prismaMock.category.findUnique.mockResolvedValueOnce({ id: 'cat-03' });
      prismaMock.book.create.mockResolvedValueOnce(sampleDbBookNormalized);

      const created = await service.create({
        isbn: '978-604-218678-0',
        title: 'Mắt Biếc',
        authorId: 'auth-05',
        categoryId: 'cat-03',
        publisher: 'NXB Trẻ',
        publishYear: 2019,
        copiesTotal: 4,
        shelfLocation: 'Kệ VH-01, Tầng 1',
        description: 'Mô tả sách',
      });

      expect(prismaMock.book.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isbn: '9786042186780',
          }),
        }),
      );
      expect(created.isbn).toBe('9786042186780');
    });

    it('nên ném BadRequestException nếu ISBN sau chuẩn hóa không đủ 13 chữ số', async () => {
      await expect(
        service.create({
          isbn: '123456',
          title: 'Sách lỗi ISBN',
          authorId: 'auth-05',
          categoryId: 'cat-03',
          publisher: 'NXB Trẻ',
          publishYear: 2019,
          copiesTotal: 1,
          shelfLocation: 'Kệ A1',
          description: 'Mô tả',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('nên chặn trùng lặp nếu DB đã có bản ghi cũ lưu dạng có dấu gạch ngang', async () => {
      prismaMock.book.findUnique.mockResolvedValueOnce(null);
      prismaMock.book.findMany.mockResolvedValueOnce([sampleDbBookLegacyHyphenated]);

      await expect(
        service.create({
          isbn: '9786042186780',
          title: 'Mắt Biếc Bản Trùng',
          authorId: 'auth-05',
          categoryId: 'cat-03',
          publisher: 'NXB Trẻ',
          publishYear: 2019,
          copiesTotal: 1,
          shelfLocation: 'Kệ A1',
          description: 'Mô tả',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });
});

