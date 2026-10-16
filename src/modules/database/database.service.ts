import { Injectable, OnModuleInit } from '@nestjs/common';
import { Author } from '../authors/entities/author.entity.js';
import { Book } from '../books/entities/book.entity.js';
import { Borrowing } from '../borrowings/entities/borrowing.entity.js';
import { Category } from '../categories/entities/category.entity.js';
import { Member } from '../members/entities/member.entity.js';
import { User } from '../users/entities/user.entity.js';
import {
  SEED_AUTHORS,
  SEED_BOOKS,
  SEED_BORROWINGS,
  SEED_CATEGORIES,
  SEED_MEMBERS,
  SEED_USERS,
} from './seed-data.js';

@Injectable()
export class DatabaseService implements OnModuleInit {
  private categories: Map<string, Category> = new Map();
  private authors: Map<string, Author> = new Map();
  private books: Map<string, Book> = new Map();
  private members: Map<string, Member> = new Map();
  private borrowings: Map<string, Borrowing> = new Map();
  private users: Map<string, User> = new Map();

  onModuleInit() {
    this.seedInitialData();
  }

  private seedInitialData(): void {
    SEED_CATEGORIES.forEach((cat) => this.categories.set(cat.id, { ...cat }));
    SEED_AUTHORS.forEach((auth) => this.authors.set(auth.id, { ...auth }));
    SEED_BOOKS.forEach((book) => this.books.set(book.id, { ...book }));
    SEED_MEMBERS.forEach((mem) => this.members.set(mem.id, { ...mem }));
    SEED_BORROWINGS.forEach((brw) => this.borrowings.set(brw.id, { ...brw }));
    SEED_USERS.forEach((user) => this.users.set(user.id, { ...user }));
  }

  // Categories Accessors
  getCategories(): Category[] {
    return Array.from(this.categories.values());
  }

  getCategoryById(id: string): Category | undefined {
    return this.categories.get(id);
  }

  setCategory(category: Category): void {
    this.categories.set(category.id, category);
  }

  deleteCategory(id: string): boolean {
    return this.categories.delete(id);
  }

  // Authors Accessors
  getAuthors(): Author[] {
    return Array.from(this.authors.values());
  }

  getAuthorById(id: string): Author | undefined {
    return this.authors.get(id);
  }

  setAuthor(author: Author): void {
    this.authors.set(author.id, author);
  }

  deleteAuthor(id: string): boolean {
    return this.authors.delete(id);
  }

  // Books Accessors
  getBooks(): Book[] {
    return Array.from(this.books.values());
  }

  getBookById(id: string): Book | undefined {
    return this.books.get(id);
  }

  getBookByIsbn(isbn: string): Book | undefined {
    return Array.from(this.books.values()).find((b) => b.isbn === isbn);
  }

  setBook(book: Book): void {
    this.books.set(book.id, book);
  }

  deleteBook(id: string): boolean {
    return this.books.delete(id);
  }

  // Members Accessors
  getMembers(): Member[] {
    return Array.from(this.members.values());
  }

  getMemberById(id: string): Member | undefined {
    return this.members.get(id);
  }

  getMemberByCardNumber(cardNumber: string): Member | undefined {
    return Array.from(this.members.values()).find((m) => m.cardNumber === cardNumber);
  }

  getMemberByEmail(email: string): Member | undefined {
    return Array.from(this.members.values()).find((m) => m.email.toLowerCase() === email.toLowerCase());
  }

  setMember(member: Member): void {
    this.members.set(member.id, member);
  }

  deleteMember(id: string): boolean {
    return this.members.delete(id);
  }

  // Borrowings Accessors
  getBorrowings(): Borrowing[] {
    return Array.from(this.borrowings.values());
  }

  getBorrowingById(id: string): Borrowing | undefined {
    return this.borrowings.get(id);
  }

  getBorrowingsByMemberId(memberId: string): Borrowing[] {
    return Array.from(this.borrowings.values()).filter((b) => b.memberId === memberId);
  }

  getBorrowingsByBookId(bookId: string): Borrowing[] {
    return Array.from(this.borrowings.values()).filter((b) => b.bookId === bookId);
  }

  setBorrowing(borrowing: Borrowing): void {
    this.borrowings.set(borrowing.id, borrowing);
  }

  deleteBorrowing(id: string): boolean {
    return this.borrowings.delete(id);
  }

  // Users Accessors
  getUsers(): User[] {
    return Array.from(this.users.values());
  }

  getUserById(id: string): User | undefined {
    return this.users.get(id);
  }

  getUserByEmail(email: string): User | undefined {
    return Array.from(this.users.values()).find(
      (u) => u.email.toLowerCase() === email.trim().toLowerCase(),
    );
  }

  getUserByPhone(phone: string): User | undefined {
    return Array.from(this.users.values()).find(
      (u) => u.phone.trim() === phone.trim(),
    );
  }

  setUser(user: User): void {
    this.users.set(user.id, user);
  }

  deleteUser(id: string): boolean {
    return this.users.delete(id);
  }
}

