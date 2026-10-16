import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Bắt đầu nạp dữ liệu hạt giống (Seed Data) vào Supabase PostgreSQL...');

  // 1. Thể loại sách
  const categoriesData = [
    {
      id: 'cat-01',
      name: 'Công nghệ thông tin & Lập trình',
      description: 'Tài liệu, giáo trình kỹ thuật phần mềm, kiến trúc hệ thống và thuật toán.',
    },
    {
      id: 'cat-02',
      name: 'Kỹ năng sống & Phát triển bản thân',
      description: 'Sách rèn luyện tư duy, kỹ năng giao tiếp và phát triển bản thân.',
    },
    {
      id: 'cat-03',
      name: 'Văn học & Tiểu thuyết',
      description: 'Các tác phẩm văn học kinh điển trong nước và thế giới.',
    },
    {
      id: 'cat-04',
      name: 'Kinh tế & Quản trị kinh doanh',
      description: 'Sách về tài chính doanh nghiệp, đầu tư và khởi nghiệp.',
    },
    {
      id: 'cat-05',
      name: 'Khoa học & Lịch sử nhân loại',
      description: 'Nghiên cứu về lịch sử tiến hóa và khoa học tự nhiên.',
    },
  ];

  for (const cat of categoriesData) {
    await prisma.category.upsert({
      where: { id: cat.id },
      update: cat,
      create: cat,
    });
  }

  // 2. Tác giả
  const authorsData = [
    {
      id: 'auth-01',
      name: 'Robert C. Martin (Uncle Bob)',
      biography: 'Kỹ sư phần mềm huyền thoại, tác giả Clean Code và Clean Architecture.',
      nationality: 'Mỹ',
      birthYear: 1952,
    },
    {
      id: 'auth-02',
      name: 'Dale Carnegie',
      biography: 'Tác giả Đắc Nhân Tâm bán chạy nhất toàn cầu.',
      nationality: 'Mỹ',
      birthYear: 1888,
    },
    {
      id: 'auth-03',
      name: 'Paulo Coelho',
      biography: 'Tác giả của kiệt tác Nhà Giả Kim.',
      nationality: 'Brazil',
      birthYear: 1947,
    },
    {
      id: 'auth-04',
      name: 'Yuval Noah Harari',
      biography: 'Nhà sử học, tác giả của bộ ba Sapiens.',
      nationality: 'Israel',
      birthYear: 1976,
    },
    {
      id: 'auth-05',
      name: 'Nguyễn Nhật Ánh',
      biography: 'Nhà văn hiện đại nổi tiếng của Việt Nam với các tác phẩm tuổi học trò.',
      nationality: 'Việt Nam',
      birthYear: 1955,
    },
  ];

  for (const auth of authorsData) {
    await prisma.author.upsert({
      where: { id: auth.id },
      update: auth,
      create: auth,
    });
  }

  // 3. Sách
  const booksData = [
    {
      id: 'book-01',
      isbn: '978-0132350884',
      title: 'Clean Code: A Handbook of Agile Software Craftsmanship',
      authorId: 'auth-01',
      categoryId: 'cat-01',
      publisher: 'Prentice Hall',
      publishYear: 2008,
      copiesTotal: 8,
      copiesAvailable: 6,
      shelfLocation: 'Kệ CN-01, Tầng 2',
      status: 'AVAILABLE' as const,
      coverUrl: 'https://images.unsplash.com/photo-1532012164546-f432f2e3777a?w=400',
      description: 'Quy tắc và phương pháp thực hành viết code chuẩn chỉ, dễ đọc, dễ bảo trì.',
    },
    {
      id: 'book-02',
      isbn: '978-0134494166',
      title: 'Clean Architecture: A Craftsman’s Guide to Software Structure',
      authorId: 'auth-01',
      categoryId: 'cat-01',
      publisher: 'Prentice Hall',
      publishYear: 2017,
      copiesTotal: 5,
      copiesAvailable: 4,
      shelfLocation: 'Kệ CN-01, Tầng 2',
      status: 'AVAILABLE' as const,
      coverUrl: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?w=400',
      description: 'Nguyên lý kiến trúc phần mềm hướng đối tượng và SOLID.',
    },
    {
      id: 'book-03',
      isbn: '978-0671027032',
      title: 'Đắc Nhân Tâm (How to Win Friends and Influence People)',
      authorId: 'auth-02',
      categoryId: 'cat-02',
      publisher: 'NXB Tổng Hợp TP.HCM (First News)',
      publishYear: 2020,
      copiesTotal: 10,
      copiesAvailable: 7,
      shelfLocation: 'Kệ KN-03, Tầng 1',
      status: 'AVAILABLE' as const,
      coverUrl: 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=400',
      description: 'Nghệ thuật thu phục lòng người, giao tiếp khéo léo và đối nhân xử thế.',
    },
    {
      id: 'book-04',
      isbn: '978-0062315007',
      title: 'Nhà Giả Kim (The Alchemist)',
      authorId: 'auth-03',
      categoryId: 'cat-03',
      publisher: 'NXB Hội Nhà Văn (Nhã Nam)',
      publishYear: 2018,
      copiesTotal: 6,
      copiesAvailable: 4,
      shelfLocation: 'Kệ VH-02, Tầng 1',
      status: 'AVAILABLE' as const,
      coverUrl: 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=400',
      description: 'Hành trình theo đuổi vận mệnh của chàng chăn cừu Santiago.',
    },
    {
      id: 'book-05',
      isbn: '978-0062316097',
      title: 'Sapiens: Lược Sử Loài Người',
      authorId: 'auth-04',
      categoryId: 'cat-05',
      publisher: 'NXB Tri Thức (Omega Plus)',
      publishYear: 2019,
      copiesTotal: 7,
      copiesAvailable: 6,
      shelfLocation: 'Kệ LS-01, Tầng 3',
      status: 'AVAILABLE' as const,
      coverUrl: 'https://images.unsplash.com/photo-1476275466078-4007374efbbe?w=400',
      description: 'Nhìn lại 70.000 năm tiến hóa và thống trị trái đất của loài người.',
    },
    {
      id: 'book-06',
      isbn: '978-6042186780',
      title: 'Mắt Biếc',
      authorId: 'auth-05',
      categoryId: 'cat-03',
      publisher: 'NXB Trẻ',
      publishYear: 2019,
      copiesTotal: 4,
      copiesAvailable: 3,
      shelfLocation: 'Kệ VH-01, Tầng 1',
      status: 'AVAILABLE' as const,
      coverUrl: 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=400',
      description: 'Câu chuyện tình đơn phương da diết của chàng trai Ngạn.',
    },
  ];

  for (const book of booksData) {
    await prisma.book.upsert({
      where: { id: book.id },
      update: book,
      create: book,
    });
  }

  // 4. Độc giả
  const membersData = [
    {
      id: 'mem-01',
      cardNumber: 'LIB-2026-0001',
      fullName: 'Nguyễn Văn An',
      email: 'an.nguyen@example.com',
      phone: '0901234567',
      address: '123 Đường Nguyễn Huệ, Quận 1, TP. Hồ Chí Minh',
      membershipExpiry: new Date('2027-01-01T00:00:00Z'),
      status: 'ACTIVE' as const,
      maxBorrowLimit: 5,
      currentBorrowedCount: 2,
    },
    {
      id: 'mem-02',
      cardNumber: 'LIB-2026-0002',
      fullName: 'Trần Thị Mai',
      email: 'mai.tran@example.com',
      phone: '0912345678',
      address: '45 Đường Lê Lợi, Quận Hải Châu, Đà Nẵng',
      membershipExpiry: new Date('2027-06-30T00:00:00Z'),
      status: 'ACTIVE' as const,
      maxBorrowLimit: 5,
      currentBorrowedCount: 1,
    },
    {
      id: 'mem-03',
      cardNumber: 'LIB-2026-0003',
      fullName: 'Lê Hoàng Nam',
      email: 'nam.le@example.com',
      phone: '0987654321',
      address: '78 Đường Cầu Giấy, Quận Cầu Giấy, Hà Nội',
      membershipExpiry: new Date('2026-12-31T00:00:00Z'),
      status: 'ACTIVE' as const,
      maxBorrowLimit: 5,
      currentBorrowedCount: 1,
    },
    {
      id: 'mem-04',
      cardNumber: 'LIB-2026-0004',
      fullName: 'Phạm Thu Trang',
      email: 'trang.pham@example.com',
      phone: '0933445566',
      address: '90 Đường CMT8, Quận 3, TP. Hồ Chí Minh',
      membershipExpiry: new Date('2025-12-31T00:00:00Z'),
      status: 'EXPIRED' as const,
      maxBorrowLimit: 5,
      currentBorrowedCount: 0,
    },
  ];

  for (const mem of membersData) {
    await prisma.member.upsert({
      where: { id: mem.id },
      update: mem,
      create: mem,
    });
  }

  // 5. Phiếu mượn
  const borrowingsData = [
    {
      id: 'brw-01',
      transactionCode: 'BRW-2026-0001',
      memberId: 'mem-01',
      bookId: 'book-01',
      borrowDate: new Date('2026-10-01T08:00:00Z'),
      dueDate: new Date('2026-10-15T08:00:00Z'),
      renewCount: 0,
      fineAmount: 0,
      finePaid: false,
      notes: 'Mượn phục vụ nghiên cứu đồ án tốt nghiệp.',
      status: 'BORROWED' as const,
    },
    {
      id: 'brw-02',
      transactionCode: 'BRW-2026-0002',
      memberId: 'mem-01',
      bookId: 'book-03',
      borrowDate: new Date('2026-09-10T09:00:00Z'),
      dueDate: new Date('2026-09-24T09:00:00Z'),
      returnDate: new Date('2026-09-22T14:30:00Z'),
      renewCount: 0,
      fineAmount: 0,
      finePaid: true,
      notes: 'Sách trả nguyên vẹn, đúng hạn.',
      status: 'RETURNED' as const,
    },
    {
      id: 'brw-03',
      transactionCode: 'BRW-2026-0003',
      memberId: 'mem-02',
      bookId: 'book-04',
      borrowDate: new Date('2026-10-05T10:00:00Z'),
      dueDate: new Date('2026-10-19T10:00:00Z'),
      renewCount: 0,
      fineAmount: 0,
      finePaid: false,
      notes: 'Độc giả yêu cầu hỗ trợ bìa bọc nylon.',
      status: 'BORROWED' as const,
    },
    {
      id: 'brw-04',
      transactionCode: 'BRW-2026-0004',
      memberId: 'mem-03',
      bookId: 'book-02',
      borrowDate: new Date('2026-09-15T08:00:00Z'),
      dueDate: new Date('2026-09-29T08:00:00Z'),
      renewCount: 0,
      fineAmount: 85000,
      finePaid: false,
      notes: 'Phiếu mượn quá hạn cần gửi email đôn đốc trả sách.',
      status: 'OVERDUE' as const,
    },
  ];

  for (const brw of borrowingsData) {
    await prisma.borrowing.upsert({
      where: { id: brw.id },
      update: brw,
      create: brw,
    });
  }

  // 6. Tài khoản người dùng (Auth)
  const usersData = [
    {
      id: 'user-01',
      email: 'admin@librobe.com',
      phone: '0909000001',
      password: await bcrypt.hash('Admin@123', 10),
      fullName: 'Quản Trị Viên Hệ Thống',
      role: 'ADMIN' as const,
      isActive: true,
    },
    {
      id: 'user-02',
      email: 'librarian@librobe.com',
      phone: '0909000002',
      password: await bcrypt.hash('Librarian@123', 10),
      fullName: 'Thủ Thư Trưởng',
      role: 'LIBRARIAN' as const,
      isActive: true,
    },
    {
      id: 'user-03',
      email: 'an.nguyen@example.com',
      phone: '0901234567',
      password: await bcrypt.hash('Member@123', 10),
      fullName: 'Nguyễn Văn An',
      role: 'MEMBER' as const,
      isActive: true,
      memberId: 'mem-01',
    },
  ];

  for (const u of usersData) {
    await prisma.user.upsert({
      where: { id: u.id },
      update: u,
      create: u,
    });
  }

  console.log('✅ Hoàn tất nạp dữ liệu hạt giống vào Supabase!');
}

main()
  .catch((e) => {
    console.error('❌ Lỗi khi nạp dữ liệu:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
