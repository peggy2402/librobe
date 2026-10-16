/**
 * Books Management Module for Librobe
 * Supports Desktop Table View & Mobile Card List View
 * Click row/card to view Details with ESC key dismiss & confirmation dialogs
 */

const books = {
  currentCategoryFilter: '',
  searchKeyword: '',
  cachedBooks: [],
  currentSelectedBookId: null,

  init() {
    this.bindEvents();
    this.loadCategoriesSelect();
    this.loadAuthorsSelect();
  },

  bindEvents() {
    const searchInput = document.getElementById('books-search-input');
    if (searchInput) {
      let timer;
      searchInput.addEventListener('input', (e) => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          this.searchKeyword = e.target.value.trim();
          this.loadBooks();
        }, 300);
      });
    }

    const categorySelect = document.getElementById('books-category-filter');
    if (categorySelect) {
      categorySelect.addEventListener('change', (e) => {
        this.currentCategoryFilter = e.target.value;
        this.loadBooks();
      });
    }

    const newBookForm = document.getElementById('new-book-form');
    if (newBookForm) {
      newBookForm.addEventListener('submit', (e) => this.handleCreateBook(e));
    }

    const editBookForm = document.getElementById('edit-book-form');
    if (editBookForm) {
      editBookForm.addEventListener('submit', (e) => this.handleUpdateBook(e));
    }

    const detailEditBtn = document.getElementById('book-detail-edit-btn');
    if (detailEditBtn) {
      detailEditBtn.addEventListener('click', () => {
        if (this.currentSelectedBookId) {
          this.openEditModal(this.currentSelectedBookId);
        }
      });
    }

    const detailBorrowBtn = document.getElementById('book-detail-borrow-btn');
    if (detailBorrowBtn) {
      detailBorrowBtn.addEventListener('click', () => {
        if (this.currentSelectedBookId) {
          const book = this.cachedBooks.find((b) => b.id === this.currentSelectedBookId);
          ui.closeModal('modal-book-details');
          this.openBorrowModal(this.currentSelectedBookId, escape(book ? book.title : ''));
        }
      });
    }
  },

  async loadCategoriesSelect() {
    try {
      const res = await api.get('/api/categories');
      const list = res.data || res || [];
      const filterSelect = document.getElementById('books-category-filter');
      const formSelect = document.getElementById('book-form-category');
      const editSelect = document.getElementById('edit-book-category');

      let options = `<option value="">Tất cả thể loại</option>`;
      list.forEach((c) => {
        options += `<option value="${c.id}">${c.name}</option>`;
      });

      if (filterSelect) filterSelect.innerHTML = options;

      let formOptions = `<option value="" disabled selected>Chọn thể loại</option>`;
      list.forEach((c) => {
        formOptions += `<option value="${c.id}">${c.name}</option>`;
      });

      if (formSelect) formSelect.innerHTML = formOptions;
      if (editSelect) editSelect.innerHTML = formOptions;
    } catch (err) {
      console.error('Lỗi tải thể loại:', err);
    }
  },

  async loadAuthorsSelect() {
    try {
      const res = await api.get('/api/authors');
      const list = res.data || res || [];
      const formSelect = document.getElementById('book-form-author');
      const editSelect = document.getElementById('edit-book-author');

      let formOptions = `<option value="" disabled selected>Chọn tác giả</option>`;
      list.forEach((a) => {
        formOptions += `<option value="${a.id}">${a.name}</option>`;
      });

      if (formSelect) formSelect.innerHTML = formOptions;
      if (editSelect) editSelect.innerHTML = formOptions;
    } catch (err) {
      console.error('Lỗi tải tác giả:', err);
    }
  },

  async loadBooks() {
    const tbody = document.getElementById('books-tbody');
    const cardList = document.getElementById('books-card-list');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 32px; color: var(--text-muted);">Đang tải dữ liệu từ máy chủ...</td></tr>`;
    if (cardList) {
      cardList.innerHTML = `<div style="text-align: center; padding: 24px; color: var(--text-muted);">Đang tải kho sách...</div>`;
    }

    try {
      const params = {};
      if (this.searchKeyword) params.search = this.searchKeyword;
      if (this.currentCategoryFilter) params.categoryId = this.currentCategoryFilter;

      const res = await api.get('/api/books', params);
      const list = res.data || [];
      this.cachedBooks = list;

      if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 32px; color: var(--text-muted);">Không tìm thấy đầu sách nào phù hợp</td></tr>`;
        if (cardList) {
          cardList.innerHTML = `<div style="text-align: center; padding: 24px; color: var(--text-muted);">Không tìm thấy đầu sách nào phù hợp</div>`;
        }
        return;
      }

      // 1. Render Desktop Table View
      tbody.innerHTML = list.map((b) => `
        <tr class="clickable-table-row" onclick="books.handleRowClick(event, '${b.id}')" title="Nhấn để xem chi tiết cuốn sách">
          <td style="font-family: monospace; font-size: 0.8125rem; color: #94a3b8;">${b.isbn}</td>
          <td>
            <div style="font-weight: 600; color: var(--text-primary);">${b.title}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">${b.publisher || 'NXB'} (${b.publishYear || '—'})</div>
          </td>
          <td>${b.authorName || '—'}</td>
          <td><span class="badge badge-secondary">${b.categoryName || '—'}</span></td>
          <td>
            <div style="font-weight: 600;">${b.copiesAvailable} / ${b.copiesTotal}</div>
            <div style="font-size: 0.6875rem; color: var(--text-muted);">Vị trí: ${b.shelfLocation || 'Kho'}</div>
          </td>
          <td>${ui.renderBadge(b.status, b.status === 'AVAILABLE' ? 'Sẵn sàng' : 'Hết sách')}</td>
          <td>
            <div style="display: flex; gap: 6px;" onclick="event.stopPropagation()">
              <button type="button" class="btn btn-secondary btn-sm" onclick="books.openBorrowModal('${b.id}', '${escape(b.title)}')">Mượn</button>
              <button type="button" class="btn btn-danger btn-sm" onclick="books.handleDeleteBook('${b.id}')">Xóa</button>
            </div>
          </td>
        </tr>
      `).join('');

      // 2. Render Mobile Card List View
      if (cardList) {
        cardList.innerHTML = list.map((b) => `
          <div class="mobile-data-card" onclick="books.openDetails('${b.id}')">
            <div class="mobile-card-header">
              <div>
                <div class="mobile-card-title">${b.title}</div>
                <div class="mobile-card-subtitle">${b.authorName || '—'} · ${b.publishYear || '—'}</div>
              </div>
              <div>${ui.renderBadge(b.status, b.status === 'AVAILABLE' ? 'Sẵn sàng' : 'Hết sách')}</div>
            </div>

            <div class="mobile-card-body">
              <div class="mobile-card-field">
                <span class="mobile-card-field-label">Mã ISBN</span>
                <span class="mobile-card-field-val" style="font-family: monospace;">${b.isbn}</span>
              </div>
              <div class="mobile-card-field">
                <span class="mobile-card-field-label">Thể loại</span>
                <span class="mobile-card-field-val">${b.categoryName || '—'}</span>
              </div>
              <div class="mobile-card-field">
                <span class="mobile-card-field-label">Tồn kho</span>
                <span class="mobile-card-field-val" style="font-weight: 700; color: #10b981;">${b.copiesAvailable} / ${b.copiesTotal} cuốn</span>
              </div>
              <div class="mobile-card-field">
                <span class="mobile-card-field-label">Vị trí kệ</span>
                <span class="mobile-card-field-val">${b.shelfLocation || 'Kho'}</span>
              </div>
            </div>

            <div class="mobile-card-actions" onclick="event.stopPropagation()">
              <button type="button" class="btn btn-secondary btn-sm" onclick="books.openDetails('${b.id}')">Chi Tiết</button>
              <button type="button" class="btn btn-primary btn-sm" onclick="books.openBorrowModal('${b.id}', '${escape(b.title)}')">Mượn Sách</button>
              <button type="button" class="btn btn-danger btn-sm" onclick="books.handleDeleteBook('${b.id}')">Xóa</button>
            </div>
          </div>
        `).join('');
      }
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--color-danger); padding: 32px;">Lỗi tải kho sách: ${err.message}</td></tr>`;
      if (cardList) {
        cardList.innerHTML = `<div style="text-align: center; color: var(--color-danger); padding: 24px;">Lỗi tải kho sách: ${err.message}</div>`;
      }
    }
  },

  handleRowClick(e, bookId) {
    if (e.target.closest('button') || e.target.closest('a') || e.target.closest('input')) {
      return;
    }
    this.openDetails(bookId);
  },

  async openDetails(bookId) {
    this.currentSelectedBookId = bookId;
    let book = this.cachedBooks.find((b) => b.id === bookId);

    try {
      if (!book || !book.description) {
        book = await api.get(`/api/books/${bookId}`);
      }
    } catch (err) {
      console.warn('Lấy chi tiết sách từ API lỗi, dùng dữ liệu cache:', err);
    }

    if (!book) return;

    // Populate Detail Modal fields
    const titleEl = document.getElementById('book-detail-title');
    const isbnEl = document.getElementById('book-detail-isbn');
    const authorEl = document.getElementById('book-detail-author');
    const publisherEl = document.getElementById('book-detail-publisher');
    const yearEl = document.getElementById('book-detail-year');
    const copiesEl = document.getElementById('book-detail-copies');
    const shelfEl = document.getElementById('book-detail-shelf');
    const createdEl = document.getElementById('book-detail-created');
    const updatedEl = document.getElementById('book-detail-updated');
    const descEl = document.getElementById('book-detail-desc');
    const statusBadge = document.getElementById('book-detail-status-badge');
    const categoryBadge = document.getElementById('book-detail-category-badge');

    if (titleEl) titleEl.textContent = book.title;
    if (isbnEl) isbnEl.textContent = book.isbn;
    if (authorEl) authorEl.textContent = book.authorName || (book.author ? book.author.name : '—');
    if (publisherEl) publisherEl.textContent = book.publisher || '—';
    if (yearEl) yearEl.textContent = book.publishYear || '—';
    if (copiesEl) copiesEl.textContent = `${book.copiesAvailable} khả dụng / ${book.copiesTotal} tổng`;
    if (shelfEl) shelfEl.textContent = book.shelfLocation || 'Chưa thiết lập';
    if (createdEl) createdEl.textContent = ui.formatDate(book.createdAt);
    if (updatedEl) updatedEl.textContent = ui.formatDate(book.updatedAt);
    if (descEl) descEl.textContent = book.description || 'Chưa có thông tin mô tả chi tiết cho đầu sách này.';

    if (statusBadge) {
      statusBadge.innerHTML = ui.renderBadge(book.status, book.status === 'AVAILABLE' ? 'Sẵn sàng' : 'Hết sách');
    }
    if (categoryBadge) {
      categoryBadge.textContent = book.categoryName || (book.category ? book.category.name : 'Chung');
    }

    ui.openModal('modal-book-details');
  },

  openEditModal(bookId) {
    ui.closeModal('modal-book-details');
    const book = this.cachedBooks.find((b) => b.id === bookId);
    if (!book) return;

    const idInput = document.getElementById('edit-book-id');
    const titleInput = document.getElementById('edit-book-title');
    const authorSelect = document.getElementById('edit-book-author');
    const categorySelect = document.getElementById('edit-book-category');
    const publisherInput = document.getElementById('edit-book-publisher');
    const yearInput = document.getElementById('edit-book-year');
    const copiesInput = document.getElementById('edit-book-copies');
    const shelfInput = document.getElementById('edit-book-shelf');
    const descInput = document.getElementById('edit-book-desc');

    if (idInput) idInput.value = book.id;
    if (titleInput) titleInput.value = book.title || '';
    if (authorSelect && book.authorId) authorSelect.value = book.authorId;
    if (categorySelect && book.categoryId) categorySelect.value = book.categoryId;
    if (publisherInput) publisherInput.value = book.publisher || '';
    if (yearInput) yearInput.value = book.publishYear || '';
    if (copiesInput) copiesInput.value = book.copiesTotal || 1;
    if (shelfInput) shelfInput.value = book.shelfLocation || '';
    if (descInput) descInput.value = book.description || '';

    ui.openModal('modal-edit-book');
  },

  async handleUpdateBook(e) {
    e.preventDefault();
    const id = document.getElementById('edit-book-id')?.value;
    const title = document.getElementById('edit-book-title')?.value.trim();
    const authorId = document.getElementById('edit-book-author')?.value;
    const categoryId = document.getElementById('edit-book-category')?.value;
    const publisher = document.getElementById('edit-book-publisher')?.value.trim();
    const publishYear = parseInt(document.getElementById('edit-book-year')?.value) || undefined;
    const copiesTotal = parseInt(document.getElementById('edit-book-copies')?.value) || undefined;
    const shelfLocation = document.getElementById('edit-book-shelf')?.value.trim();
    const description = document.getElementById('edit-book-desc')?.value.trim();

    if (!id || !title) {
      ui.toast('Vui lòng nhập tựa đề sách', 'error');
      return;
    }

    // Confirmation Dialog with "Hủy" and "Xác nhận"
    const confirmed = await ui.confirm({
      title: 'Xác nhận thay đổi',
      message: `Bạn có chắc chắn muốn cập nhật thông tin cho cuốn sách "${title}"?`,
      confirmText: 'Lưu Thay Đổi',
      cancelText: 'Hủy',
      confirmType: 'primary',
    });

    if (!confirmed) return;

    try {
      await api.patch(`/api/books/${id}`, {
        title,
        authorId,
        categoryId,
        publisher,
        publishYear,
        copiesTotal,
        shelfLocation,
        description,
      });

      ui.toast('Cập nhật thông tin sách thành công', 'success');
      ui.closeModal('modal-edit-book');
      this.loadBooks();
      if (window.stats) window.stats.loadOverview();
    } catch (err) {
      ui.toast(err.message || 'Lỗi cập nhật sách', 'error');
    }
  },

  async handleCreateBook(e) {
    e.preventDefault();
    const isbn = document.getElementById('book-form-isbn')?.value.trim();
    const title = document.getElementById('book-form-title')?.value.trim();
    const authorId = document.getElementById('book-form-author')?.value;
    const categoryId = document.getElementById('book-form-category')?.value;
    const publisher = document.getElementById('book-form-publisher')?.value.trim();
    const publishYear = parseInt(document.getElementById('book-form-year')?.value) || 2026;
    const copiesTotal = parseInt(document.getElementById('book-form-copies')?.value) || 1;
    const shelfLocation = document.getElementById('book-form-shelf')?.value.trim();
    const description = document.getElementById('book-form-desc')?.value.trim();

    if (!isbn || !title || !authorId || !categoryId) {
      ui.toast('Vui lòng nhập đầy đủ các trường bắt buộc', 'error');
      return;
    }

    try {
      await api.post('/api/books', {
        isbn,
        title,
        authorId,
        categoryId,
        publisher,
        publishYear,
        copiesTotal,
        shelfLocation,
        description,
      });

      ui.toast('Thêm sách mới vào kho thành công', 'success');
      ui.closeModal('modal-new-book');
      document.getElementById('new-book-form')?.reset();
      this.loadBooks();
      if (window.stats) window.stats.loadOverview();
    } catch (err) {
      ui.toast(err.message || 'Lỗi thêm sách', 'error');
    }
  },

  async handleDeleteBook(id) {
    const book = this.cachedBooks.find((b) => b.id === id);
    const bookTitle = book ? `"${book.title}"` : 'đầu sách này';

    // Confirmation Dialog with "Hủy" and "Xác nhận"
    const confirmed = await ui.confirm({
      title: 'Xác nhận xóa đầu sách',
      message: `Bạn có chắc chắn muốn xóa ${bookTitle} khỏi thư viện? Hành động này không thể hoàn tác.`,
      confirmText: 'Xác Nhận Xóa',
      cancelText: 'Hủy',
      confirmType: 'danger',
    });

    if (!confirmed) return;

    try {
      await api.delete(`/api/books/${id}`);
      ui.toast('Đã xóa sách thành công', 'success');
      this.loadBooks();
      if (window.stats) window.stats.loadOverview();
    } catch (err) {
      ui.toast(err.message || 'Không thể xóa sách đang có phiếu mượn', 'error');
    }
  },

  openBorrowModal(bookId, escapedTitle) {
    const bookTitle = unescape(escapedTitle);
    const bookSelect = document.getElementById('borrow-form-book');
    if (bookSelect) {
      bookSelect.innerHTML = `<option value="${bookId}" selected>${bookTitle}</option>`;
    }
    ui.openModal('modal-new-borrow');
  },
};

window.books = books;
