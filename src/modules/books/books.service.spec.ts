import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseModule } from '../database/database.module.js';
import { DatabaseService } from '../database/database.service.js';
import { BooksService } from './books.service.js';

describe('BooksService', () => {
  let service: BooksService;
  let db: DatabaseService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [DatabaseModule],
      providers: [BooksService],
    }).compile();

    service = module.get<BooksService>(BooksService);
    db = module.get<DatabaseService>(DatabaseService);
    db.onModuleInit(); // nạp lại seed data
  });

  it('nên lấy danh sách sách thành công kèm phân trang', () => {
    const res = service.findAll({ page: 1, limit: 5 });
    expect(res.data.length).toBeGreaterThan(0);
    expect(res.meta.page).toBe(1);
    expect(res.meta.limit).toBe(5);
  });

  it('nên tìm kiếm sách theo từ khóa (tiêu đề)', () => {
    const res = service.findAll({ search: 'Clean Code' });
    expect(res.data.length).toBeGreaterThan(0);
    expect(res.data[0].title).toContain('Clean Code');
  });

  it('nên ném lỗi NotFoundException khi tìm ID không tồn tại', () => {
    expect(() => service.findOne('non-existent-id')).toThrow(NotFoundException);
  });

  it('nên tạo sách mới thành công', () => {
    const newBook = service.create({
      isbn: '978-1234567890',
      title: 'Tự học Lập trình Web Hiện Đại',
      authorId: 'auth-01',
      categoryId: 'cat-01',
      publisher: 'NXB Khoa Học',
      publishYear: 2026,
      copiesTotal: 5,
      shelfLocation: 'Kệ A1',
      description: 'Sách nhập môn lập trình web toàn diện.',
    });

    expect(newBook.id).toBeDefined();
    expect(newBook.copiesAvailable).toBe(5);
    expect(newBook.authorName).toBe('Robert C. Martin (Uncle Bob)');
  });

  it('nên ném lỗi ConflictException khi trùng ISBN', () => {
    expect(() =>
      service.create({
        isbn: '978-0132350884', // ISBN của Clean Code đã có
        title: 'Trùng ISBN',
        authorId: 'auth-01',
        categoryId: 'cat-01',
        publisher: 'NXB Test',
        publishYear: 2026,
        copiesTotal: 2,
        shelfLocation: 'Kệ A1',
        description: 'Test',
      }),
    ).toThrow(ConflictException);
  });

  it('nên ném lỗi BadRequestException khi authorId không tồn tại', () => {
    expect(() =>
      service.create({
        isbn: '978-9999999999',
        title: 'Tác giả ảo',
        authorId: 'invalid-auth',
        categoryId: 'cat-01',
        publisher: 'NXB Test',
        publishYear: 2026,
        copiesTotal: 2,
        shelfLocation: 'Kệ A1',
        description: 'Test',
      }),
    ).toThrow(BadRequestException);
  });
});
