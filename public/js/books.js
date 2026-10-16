/**
 * Books Management Module
 */

const books = {
  currentCategoryFilter: '',
  searchKeyword: '',

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
  },

  async loadCategoriesSelect() {
    try {
      const res = await api.get('/api/categories');
      const list = res.data || res || [];
      const filterSelect = document.getElementById('books-category-filter');
      const formSelect = document.getElementById('book-form-category');

      let options = `<option value="">Tất cả thể loại</option>`;
      list.forEach((c) => {
        options += `<option value="${c.id}">${c.name}</option>`;
      });

      if (filterSelect) filterSelect.innerHTML = options;
      if (formSelect) {
        let formOptions = `<option value="" disabled selected>Chọn thể loại</option>`;
        list.forEach((c) => {
          formOptions += `<option value="${c.id}">${c.name}</option>`;
        });
        formSelect.innerHTML = formOptions;
      }
    } catch (err) {
      console.error('Lỗi tải thể loại:', err);
    }
  },

  async loadAuthorsSelect() {
    try {
      const res = await api.get('/api/authors');
      const list = res.data || res || [];
      const formSelect = document.getElementById('book-form-author');

      if (formSelect) {
        let formOptions = `<option value="" disabled selected>Chọn tác giả</option>`;
        list.forEach((a) => {
          formOptions += `<option value="${a.id}">${a.name}</option>`;
        });
        formSelect.innerHTML = formOptions;
      }
    } catch (err) {
      console.error('Lỗi tải tác giả:', err);
    }
  },

  async loadBooks() {
    const tbody = document.getElementById('books-tbody');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 32px; color: var(--text-muted);">Đang tải dữ liệu từ máy chủ...</td></tr>`;

    try {
      const params = {};
      if (this.searchKeyword) params.search = this.searchKeyword;
      if (this.currentCategoryFilter) params.categoryId = this.currentCategoryFilter;

      const res = await api.get('/api/books', params);
      const list = res.data || [];

      if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 32px; color: var(--text-muted);">Không tìm thấy đầu sách nào phù hợp</td></tr>`;
        return;
      }

      tbody.innerHTML = list.map((b) => `
        <tr>
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
            <div style="display: flex; gap: 6px;">
              <button class="btn btn-secondary btn-sm" onclick="books.openBorrowModal('${b.id}', '${escape(b.title)}')">Mượn</button>
              <button class="btn btn-danger btn-sm" onclick="books.handleDeleteBook('${b.id}')">Xóa</button>
            </div>
          </td>
        </tr>
      `).join('');
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--color-danger); padding: 32px;">Lỗi tải kho sách: ${err.message}</td></tr>`;
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
    if (!confirm('Bạn có chắc chắn muốn xóa đầu sách này khỏi thư viện?')) return;
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
