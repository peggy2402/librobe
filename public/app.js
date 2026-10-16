/* ==========================================================================
   LIBROBE DASHBOARD - CLIENT APPLICATION JAVASCRIPT
   Direct Supabase REST API Integration with Reactive State
   ========================================================================== */

const API_BASE = '/api';
let currentTab = 'tab-dashboard';
let token = localStorage.getItem('librobe_token') || '';
let currentUser = JSON.parse(localStorage.getItem('librobe_user') || 'null');

// Khởi chạy khi tài liệu tải xong
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initAuthUI();
  refreshCurrentTab();
});

// ==========================================================================
// API HELPER
// ==========================================================================
async function fetchAPI(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      const errorMsg = data?.message
        ? Array.isArray(data.message)
          ? data.message.join(', ')
          : data.message
        : `Lỗi kết nối máy chủ (${res.status})`;
      throw new Error(errorMsg);
    }

    return data;
  } catch (err) {
    showToast(err.message, 'error');
    throw err;
  }
}

// ==========================================================================
// TAB NAVIGATION
// ==========================================================================
function initTabs() {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach((item) => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const targetTab = item.getAttribute('data-tab');
      if (targetTab) {
        switchTab(targetTab);
      }
    });
  });
}

function switchTab(tabId) {
  currentTab = tabId;

  // Cập nhật nav active
  document.querySelectorAll('.nav-item').forEach((item) => {
    item.classList.toggle('active', item.getAttribute('data-tab') === tabId);
  });

  // Cập nhật tab content
  document.querySelectorAll('.tab-content').forEach((tab) => {
    tab.classList.toggle('active', tab.id === tabId);
  });

  // Đổi title topbar
  const titles = {
    'tab-dashboard': { title: 'Tổng Quan Thư Viện', desc: 'Dữ liệu thời gian thực đồng bộ trực tiếp từ Supabase PostgreSQL' },
    'tab-books': { title: 'Quản Lý Kho Sách', desc: 'Tra cứu, kiểm kê tồn kho và cập nhật danh mục sách' },
    'tab-borrowings': { title: 'Nghiệp Vụ Mượn / Trả Sách', desc: 'Theo dõi phiếu mượn, gia hạn sách và tự động tính tiền phạt trễ hạn' },
    'tab-members': { title: 'Quản Lý Độc Giả', desc: 'Hồ sơ thành viên, mã số thẻ thư viện và trạng thái kích hoạt' },
    'tab-categories': { title: 'Thể Loại & Tác Giả', desc: 'Phân loại chủ đề và hồ sơ các tác giả trong hệ thống' },
  };

  const currentMeta = titles[tabId] || { title: 'Bảng Điều Khiển', desc: '' };
  document.getElementById('topbar-title').innerText = currentMeta.title;
  document.getElementById('topbar-desc').innerText = currentMeta.desc;

  refreshCurrentTab();
}

function refreshCurrentTab() {
  switch (currentTab) {
    case 'tab-dashboard':
      loadDashboardStats();
      break;
    case 'tab-books':
      loadBooks();
      loadCategoriesFilter();
      break;
    case 'tab-borrowings':
      loadBorrowings();
      break;
    case 'tab-members':
      loadMembers();
      break;
    case 'tab-categories':
      loadCategories();
      loadAuthors();
      break;
  }
}

// ==========================================================================
// 1. DASHBOARD ANALYTICS
// ==========================================================================
async function loadDashboardStats() {
  try {
    const stats = await fetchAPI('/stats');
    if (!stats) return;

    document.getElementById('stat-total-books').innerText = stats.totalBooks;
    document.getElementById('stat-total-copies').innerText = `${stats.totalCopies} bản in (${stats.availableCopies} sẵn có)`;
    document.getElementById('stat-active-loans').innerText = stats.activeLoans;
    document.getElementById('stat-borrowed-copies').innerText = `${stats.borrowedCopies} cuốn đang lưu hành`;
    document.getElementById('stat-overdue-loans').innerText = stats.overdueLoans;
    document.getElementById('stat-total-members').innerText = stats.totalMembers;
    document.getElementById('stat-active-members').innerText = `${stats.activeMembers} thẻ đang hoạt động`;
    document.getElementById('stat-fines-collected').innerText = `${(stats.finesCollected || 0).toLocaleString('vi-VN')}đ`;
    document.getElementById('stat-fines-total').innerText = `Tổng phát sinh: ${(stats.totalFines || 0).toLocaleString('vi-VN')}đ`;

    document.getElementById('overdue-badge').innerText = stats.overdueLoans;
    document.getElementById('overdue-badge').style.display = stats.overdueLoans > 0 ? 'inline-block' : 'none';

    // Render Top Sách
    const topTbody = document.getElementById('top-books-body');
    if (stats.topBorrowedBooks && stats.topBorrowedBooks.length > 0) {
      topTbody.innerHTML = stats.topBorrowedBooks
        .map(
          (b) => `
        <tr>
          <td><strong style="color: #fff;">${b.title}</strong></td>
          <td><span style="color: var(--text-muted);">${b.authorName}</span></td>
          <td><span class="badge-status borrowed">${b.borrowCount} lượt mượn</span></td>
        </tr>
      `,
        )
        .join('');
    } else {
      topTbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Chưa có dữ liệu giao dịch mượn</td></tr>';
    }

    // Render Sách Quá Hạn Gấp
    loadDashboardOverdue();
  } catch (err) {
    console.error('Lỗi nạp dashboard stats:', err);
  }
}

async function loadDashboardOverdue() {
  try {
    const overdueLoans = await fetchAPI('/borrowings/overdue');
    const overdueTbody = document.getElementById('dashboard-overdue-body');

    if (overdueLoans && overdueLoans.length > 0) {
      overdueTbody.innerHTML = overdueLoans
        .slice(0, 5)
        .map(
          (l) => `
        <tr>
          <td><code style="color: var(--accent-cyan);">${l.transactionCode}</code></td>
          <td>${l.memberName}</td>
          <td><span style="color: var(--accent-rose);">${new Date(l.dueDate).toLocaleDateString('vi-VN')}</span></td>
          <td><strong style="color: var(--accent-amber);">${(l.fineAmount || 0).toLocaleString('vi-VN')}đ</strong></td>
        </tr>
      `,
        )
        .join('');
    } else {
      overdueTbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color: var(--accent-emerald);">🎉 Hiện không có sách nào bị trễ hạn</td></tr>';
    }
  } catch (err) {
    console.error('Lỗi nạp overdue:', err);
  }
}

// ==========================================================================
// 2. BOOKS MANAGEMENT
// ==========================================================================
let bookSearchTimeout;
function handleBookSearch() {
  clearTimeout(bookSearchTimeout);
  bookSearchTimeout = setTimeout(() => {
    loadBooks();
  }, 300);
}

async function loadBooks() {
  const search = document.getElementById('book-search-input')?.value.trim() || '';
  const categoryId = document.getElementById('book-category-filter')?.value || '';
  const status = document.getElementById('book-status-filter')?.value || '';

  const params = new URLSearchParams({ limit: 50 });
  if (search) params.append('search', search);
  if (categoryId) params.append('categoryId', categoryId);
  if (status) params.append('status', status);

  try {
    const res = await fetchAPI(`/books?${params.toString()}`);
    const tbody = document.getElementById('books-table-body');

    if (!res.data || res.data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">Không tìm thấy cuốn sách nào</td></tr>';
      return;
    }

    tbody.innerHTML = res.data
      .map(
        (b) => `
      <tr>
        <td>
          <div class="book-cell">
            <img class="book-thumb" src="${b.coverUrl || 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=100'}" alt="Bìa" onerror="this.src='https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=100'">
            <div>
              <div class="book-title-meta">${b.title}</div>
              <div class="book-sub-meta">${b.authorName} • NXB ${b.publisher} (${b.publishYear})</div>
            </div>
          </div>
        </td>
        <td><span class="badge-status" style="background: rgba(255,255,255,0.05);">${b.categoryName}</span></td>
        <td><code style="color: var(--text-dim); font-size: 11px;">${b.isbn}</code></td>
        <td><span style="color: var(--accent-cyan); font-size: 12px;">${b.shelfLocation}</span></td>
        <td><strong>${b.copiesAvailable}</strong> / ${b.copiesTotal}</td>
        <td>
          <span class="badge-status ${b.status.toLowerCase()}">
            ${b.status === 'AVAILABLE' ? 'Có Sẵn' : b.status === 'OUT_OF_STOCK' ? 'Hết Kho' : b.status}
          </span>
        </td>
        <td>
          <button class="btn btn-secondary btn-sm" onclick="openEditBookModal('${b.id}')">Sửa</button>
          <button class="btn btn-danger btn-sm" onclick="deleteBook('${b.id}', '${b.title}')">Xóa</button>
        </td>
      </tr>
    `,
      )
      .join('');
  } catch (err) {
    console.error('Lỗi nạp sách:', err);
  }
}

async function loadCategoriesFilter() {
  try {
    const res = await fetchAPI('/categories?limit=100');
    const select = document.getElementById('book-category-filter');
    if (res.data) {
      const currentVal = select.value;
      select.innerHTML = '<option value="">Tất cả thể loại</option>' +
        res.data.map((c) => `<option value="${c.id}">${c.name}</option>`).join('');
      select.value = currentVal;
    }
  } catch (err) {
    console.error(err);
  }
}

async function openCreateBookModal() {
  document.getElementById('modal-book-title').innerText = 'Thêm Cuốn Sách Mới';
  document.getElementById('form-book').reset();
  document.getElementById('book-edit-id').value = '';
  await populateAuthorsAndCategoriesSelect();
  openModal('modal-book');
}

async function openEditBookModal(bookId) {
  try {
    const book = await fetchAPI(`/books/${bookId}`);
    document.getElementById('modal-book-title').innerText = 'Chỉnh Sửa Sách';
    document.getElementById('book-edit-id').value = book.id;
    document.getElementById('book-form-title').value = book.title;
    document.getElementById('book-form-isbn').value = book.isbn;
    document.getElementById('book-form-publisher').value = book.publisher;
    document.getElementById('book-form-year').value = book.publishYear;
    document.getElementById('book-form-copies').value = book.copiesTotal;
    document.getElementById('book-form-shelf').value = book.shelfLocation;
    document.getElementById('book-form-desc').value = book.description || '';

    await populateAuthorsAndCategoriesSelect();
    document.getElementById('book-form-author').value = book.authorId;
    document.getElementById('book-form-category').value = book.categoryId;

    openModal('modal-book');
  } catch (err) {
    console.error(err);
  }
}

async function populateAuthorsAndCategoriesSelect() {
  const [authRes, catRes] = await Promise.all([
    fetchAPI('/authors?limit=100'),
    fetchAPI('/categories?limit=100'),
  ]);

  const authSelect = document.getElementById('book-form-author');
  const catSelect = document.getElementById('book-form-category');

  authSelect.innerHTML = authRes.data.map((a) => `<option value="${a.id}">${a.name}</option>`).join('');
  catSelect.innerHTML = catRes.data.map((c) => `<option value="${c.id}">${c.name}</option>`).join('');
}

async function handleBookSubmit(e) {
  e.preventDefault();
  const editId = document.getElementById('book-edit-id').value;

  const payload = {
    title: document.getElementById('book-form-title').value.trim(),
    isbn: document.getElementById('book-form-isbn').value.trim(),
    authorId: document.getElementById('book-form-author').value,
    categoryId: document.getElementById('book-form-category').value,
    publisher: document.getElementById('book-form-publisher').value.trim(),
    publishYear: parseInt(document.getElementById('book-form-year').value, 10),
    copiesTotal: parseInt(document.getElementById('book-form-copies').value, 10),
    shelfLocation: document.getElementById('book-form-shelf').value.trim(),
    description: document.getElementById('book-form-desc').value.trim(),
  };

  try {
    if (editId) {
      await fetchAPI(`/books/${editId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      showToast('Đã cập nhật thông tin sách thành công!', 'success');
    } else {
      await fetchAPI('/books', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      showToast('Đã thêm sách mới vào kho thư viện!', 'success');
    }
    closeModal('modal-book');
    loadBooks();
  } catch (err) {
    console.error(err);
  }
}

async function deleteBook(id, title) {
  if (!confirm(`Bạn có chắc chắn muốn xóa cuốn sách "${title}" khỏi Supabase không?`)) {
    return;
  }
  try {
    await fetchAPI(`/books/${id}`, { method: 'DELETE' });
    showToast(`Đã xóa cuốn sách "${title}"`, 'success');
    loadBooks();
  } catch (err) {
    console.error(err);
  }
}

// ==========================================================================
// 3. BORROWINGS MANAGEMENT
// ==========================================================================
let borrowSearchTimeout;
function handleBorrowSearch() {
  clearTimeout(borrowSearchTimeout);
  borrowSearchTimeout = setTimeout(() => {
    loadBorrowings();
  }, 300);
}

async function loadBorrowings() {
  const search = document.getElementById('borrow-search-input')?.value.trim() || '';
  const status = document.getElementById('borrow-status-filter')?.value || '';

  const params = new URLSearchParams({ limit: 50 });
  if (search) params.append('search', search);
  if (status) params.append('status', status);

  try {
    const res = await fetchAPI(`/borrowings?${params.toString()}`);
    const tbody = document.getElementById('borrowings-table-body');

    if (!res.data || res.data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align: center;">Chưa có bản ghi mượn trả nào</td></tr>';
      return;
    }

    tbody.innerHTML = res.data
      .map(
        (b) => `
      <tr>
        <td><strong style="color: var(--accent-cyan);">${b.transactionCode}</strong></td>
        <td><strong>${b.memberName}</strong></td>
        <td style="max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${b.bookTitle}</td>
        <td>${new Date(b.borrowDate).toLocaleDateString('vi-VN')}</td>
        <td>
          <span style="${b.status === 'OVERDUE' ? 'color: var(--accent-rose); font-weight: 700;' : ''}">
            ${new Date(b.dueDate).toLocaleDateString('vi-VN')}
          </span>
        </td>
        <td>${b.renewCount}/2 lần</td>
        <td>
          ${b.fineAmount > 0
            ? `<strong style="color: var(--accent-amber);">${b.fineAmount.toLocaleString('vi-VN')}đ</strong> ${b.finePaid ? '✅' : '❌'}`
            : '0đ'}
        </td>
        <td>
          <span class="badge-status ${b.status.toLowerCase()}">
            ${b.status === 'BORROWED' ? 'Đang Mượn' : b.status === 'RETURNED' ? 'Đã Trả' : 'Quá Hạn'}
          </span>
        </td>
        <td>
          ${b.status !== 'RETURNED' ? `
            <button class="btn btn-success btn-sm" onclick="returnBookAction('${b.id}')">Trả Sách</button>
            <button class="btn btn-secondary btn-sm" onclick="renewLoanAction('${b.id}')">Gia Hạn</button>
          ` : '<span style="color: var(--text-dim); font-size: 11px;">Hoàn tất</span>'}
          ${b.fineAmount > 0 && !b.finePaid ? `
            <button class="btn btn-primary btn-sm" onclick="payFineAction('${b.id}')">Nộp Phạt</button>
          ` : ''}
        </td>
      </tr>
    `,
      )
      .join('');
  } catch (err) {
    console.error('Lỗi nạp phiếu mượn:', err);
  }
}

async function openBorrowModal() {
  document.getElementById('form-borrow').reset();

  const [membersRes, booksRes] = await Promise.all([
    fetchAPI('/members?limit=100'),
    fetchAPI('/books?limit=100'),
  ]);

  const memberSelect = document.getElementById('borrow-select-member');
  const bookSelect = document.getElementById('borrow-select-book');

  memberSelect.innerHTML = '<option value="">-- Chọn độc giả mượn --</option>' +
    membersRes.data
      .filter((m) => m.status === 'ACTIVE')
      .map((m) => `<option value="${m.id}">${m.fullName} (${m.cardNumber}) - Đang mượn: ${m.currentBorrowedCount}/${m.maxBorrowLimit}</option>`)
      .join('');

  bookSelect.innerHTML = '<option value="">-- Chọn cuốn sách --</option>' +
    booksRes.data
      .filter((b) => b.copiesAvailable > 0)
      .map((b) => `<option value="${b.id}">${b.title} [Còn ${b.copiesAvailable} cuốn sẵn có] - ${b.shelfLocation}</option>`)
      .join('');

  openModal('modal-borrow');
}

async function handleBorrowSubmit(e) {
  e.preventDefault();
  const payload = {
    memberId: document.getElementById('borrow-select-member').value,
    bookId: document.getElementById('borrow-select-book').value,
    durationDays: parseInt(document.getElementById('borrow-days').value, 10),
    notes: document.getElementById('borrow-notes').value.trim() || undefined,
  };

  try {
    await fetchAPI('/borrowings', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    showToast('Tạo phiếu mượn và xuất kho thành công!', 'success');
    closeModal('modal-borrow');
    loadBorrowings();
    loadDashboardStats();
  } catch (err) {
    console.error(err);
  }
}

async function returnBookAction(borrowingId) {
  if (!confirm('Xác nhận độc giả đã trả sách về kho?')) return;

  try {
    const res = await fetchAPI(`/borrowings/${borrowingId}/return`, {
      method: 'POST',
      body: JSON.stringify({ notes: 'Đã hoàn trả về kho', finePaid: true }),
    });

    if (res.fineAmount > 0) {
      showToast(`Đã trả sách thành công! Đã thu tiền phạt trễ hạn: ${res.fineAmount.toLocaleString('vi-VN')}đ`, 'success');
    } else {
      showToast('Đã hoàn trả sách về kho thư viện đúng hạn!', 'success');
    }

    loadBorrowings();
    loadDashboardStats();
  } catch (err) {
    console.error(err);
  }
}

async function renewLoanAction(borrowingId) {
  const extra = prompt('Nhập số ngày muốn gia hạn thêm (mặc định 7 ngày, tối đa 14):', '7');
  if (!extra) return;

  try {
    await fetchAPI(`/borrowings/${borrowingId}/renew`, {
      method: 'POST',
      body: JSON.stringify({ extraDays: parseInt(extra, 10) }),
    });
    showToast(`Đã gia hạn thêm ${extra} ngày thành công!`, 'success');
    loadBorrowings();
  } catch (err) {
    console.error(err);
  }
}

async function payFineAction(borrowingId) {
  if (!confirm('Xác nhận đã thu đủ tiền phạt quá hạn từ bạn đọc?')) return;
  try {
    await fetchAPI(`/borrowings/${borrowingId}/pay-fine`, { method: 'POST' });
    showToast('Đã ghi nhận thanh toán tiền phạt thành công!', 'success');
    loadBorrowings();
    loadDashboardStats();
  } catch (err) {
    console.error(err);
  }
}

// ==========================================================================
// 4. MEMBERS MANAGEMENT
// ==========================================================================
let memberSearchTimeout;
function handleMemberSearch() {
  clearTimeout(memberSearchTimeout);
  memberSearchTimeout = setTimeout(() => {
    loadMembers();
  }, 300);
}

async function loadMembers() {
  const search = document.getElementById('member-search-input')?.value.trim() || '';
  const params = new URLSearchParams({ limit: 50 });
  if (search) params.append('search', search);

  try {
    const res = await fetchAPI(`/members?${params.toString()}`);
    const tbody = document.getElementById('members-table-body');

    if (!res.data || res.data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">Chưa có độc giả nào</td></tr>';
      return;
    }

    tbody.innerHTML = res.data
      .map(
        (m) => `
      <tr>
        <td><strong style="color: var(--accent-cyan);">${m.cardNumber}</strong></td>
        <td><strong>${m.fullName}</strong></td>
        <td>
          <div>${m.email}</div>
          <small style="color: var(--text-dim);">${m.phone}</small>
        </td>
        <td>${new Date(m.membershipExpiry).toLocaleDateString('vi-VN')}</td>
        <td>
          <span style="font-weight: 700; color: ${m.currentBorrowedCount > 0 ? 'var(--primary)' : 'inherit'};">
            ${m.currentBorrowedCount}
          </span> / ${m.maxBorrowLimit} cuốn
        </td>
        <td>
          <span class="badge-status ${m.status.toLowerCase()}">
            ${m.status === 'ACTIVE' ? 'Đang Hoạt Động' : m.status === 'EXPIRED' ? 'Hết Hạn' : 'Bị Khóa'}
          </span>
        </td>
        <td>
          <button class="btn btn-danger btn-sm" onclick="deleteMember('${m.id}', '${m.fullName}')">Hủy Thẻ</button>
        </td>
      </tr>
    `,
      )
      .join('');
  } catch (err) {
    console.error('Lỗi nạp độc giả:', err);
  }
}

function openCreateMemberModal() {
  document.getElementById('form-member').reset();
  openModal('modal-member');
}

async function handleMemberSubmit(e) {
  e.preventDefault();
  const payload = {
    fullName: document.getElementById('member-form-name').value.trim(),
    email: document.getElementById('member-form-email').value.trim(),
    phone: document.getElementById('member-form-phone').value.trim(),
    address: document.getElementById('member-form-address').value.trim(),
    membershipDurationMonths: parseInt(document.getElementById('member-form-duration').value, 10),
    maxBorrowLimit: parseInt(document.getElementById('member-form-limit').value, 10),
  };

  try {
    await fetchAPI('/members', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    showToast('Đã đăng ký thẻ độc giả mới thành công trên Supabase!', 'success');
    closeModal('modal-member');
    loadMembers();
    loadDashboardStats();
  } catch (err) {
    console.error(err);
  }
}

async function deleteMember(id, name) {
  if (!confirm(`Bạn có chắc chắn muốn hủy hồ sơ độc giả "${name}" không?`)) return;
  try {
    await fetchAPI(`/members/${id}`, { method: 'DELETE' });
    showToast(`Đã xóa hồ sơ độc giả "${name}"`, 'success');
    loadMembers();
    loadDashboardStats();
  } catch (err) {
    console.error(err);
  }
}

// ==========================================================================
// 5. CATEGORIES & AUTHORS
// ==========================================================================
async function loadCategories() {
  try {
    const res = await fetchAPI('/categories?limit=50');
    const tbody = document.getElementById('categories-table-body');
    if (!res.data || res.data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" style="text-align: center;">Chưa có thể loại</td></tr>';
      return;
    }
    tbody.innerHTML = res.data
      .map(
        (c) => `
      <tr>
        <td><strong>${c.name}</strong><br><small style="color:var(--text-dim);">${c.description || ''}</small></td>
        <td><span class="badge-status borrowed">${c.bookCount} đầu sách</span></td>
        <td>
          <button class="btn btn-danger btn-sm" onclick="deleteCategory('${c.id}', '${c.name}')">Xóa</button>
        </td>
      </tr>
    `,
      )
      .join('');
  } catch (err) {
    console.error(err);
  }
}

function openCreateCategoryModal() {
  document.getElementById('form-category').reset();
  openModal('modal-category');
}

async function handleCategorySubmit(e) {
  e.preventDefault();
  const payload = {
    name: document.getElementById('cat-form-name').value.trim(),
    description: document.getElementById('cat-form-desc').value.trim(),
  };
  try {
    await fetchAPI('/categories', { method: 'POST', body: JSON.stringify(payload) });
    showToast('Đã thêm thể loại mới!', 'success');
    closeModal('modal-category');
    loadCategories();
  } catch (err) {
    console.error(err);
  }
}

async function deleteCategory(id, name) {
  if (!confirm(`Xóa thể loại "${name}"?`)) return;
  try {
    await fetchAPI(`/categories/${id}`, { method: 'DELETE' });
    showToast('Đã xóa thể loại', 'success');
    loadCategories();
  } catch (err) {
    console.error(err);
  }
}

async function loadAuthors() {
  try {
    const res = await fetchAPI('/authors?limit=50');
    const tbody = document.getElementById('authors-table-body');
    if (!res.data || res.data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Chưa có tác giả</td></tr>';
      return;
    }
    tbody.innerHTML = res.data
      .map(
        (a) => `
      <tr>
        <td><strong>${a.name}</strong></td>
        <td>${a.nationality} ${a.birthYear ? `(${a.birthYear})` : ''}</td>
        <td><span class="badge-status borrowed">${a.bookCount} tác phẩm</span></td>
        <td>
          <button class="btn btn-danger btn-sm" onclick="deleteAuthor('${a.id}', '${a.name}')">Xóa</button>
        </td>
      </tr>
    `,
      )
      .join('');
  } catch (err) {
    console.error(err);
  }
}

function openCreateAuthorModal() {
  document.getElementById('form-author').reset();
  openModal('modal-author');
}

async function handleAuthorSubmit(e) {
  e.preventDefault();
  const yearVal = document.getElementById('author-form-year').value;
  const payload = {
    name: document.getElementById('author-form-name').value.trim(),
    nationality: document.getElementById('author-form-nat').value.trim(),
    birthYear: yearVal ? parseInt(yearVal, 10) : undefined,
    biography: document.getElementById('author-form-bio').value.trim(),
  };
  try {
    await fetchAPI('/authors', { method: 'POST', body: JSON.stringify(payload) });
    showToast('Đã thêm tác giả mới!', 'success');
    closeModal('modal-author');
    loadAuthors();
  } catch (err) {
    console.error(err);
  }
}

async function deleteAuthor(id, name) {
  if (!confirm(`Xóa tác giả "${name}"?`)) return;
  try {
    await fetchAPI(`/authors/${id}`, { method: 'DELETE' });
    showToast('Đã xóa tác giả', 'success');
    loadAuthors();
  } catch (err) {
    console.error(err);
  }
}

// ==========================================================================
// 6. AUTHENTICATION & MODAL CONTROLS
// ==========================================================================
function initAuthUI() {
  const nameEl = document.getElementById('user-display-name');
  const roleEl = document.getElementById('user-display-role');
  const btnAuth = document.getElementById('btn-auth-action');
  const avatarEl = document.getElementById('user-avatar');

  if (currentUser && token) {
    nameEl.innerText = currentUser.fullName;
    roleEl.innerText = currentUser.role || 'MEMBER';
    btnAuth.innerText = 'Đăng xuất';
    btnAuth.onclick = logoutAction;
    avatarEl.innerText = currentUser.fullName.substring(0, 2).toUpperCase();
  } else {
    nameEl.innerText = 'Chưa đăng nhập';
    roleEl.innerText = 'Khách';
    btnAuth.innerText = 'Đăng nhập';
    btnAuth.onclick = openLoginModal;
    avatarEl.innerText = 'AD';
  }
}

function openLoginModal() {
  document.getElementById('form-login').reset();
  openModal('modal-login');
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  const payload = {
    identifier: document.getElementById('login-identifier').value.trim(),
    password: document.getElementById('login-password').value,
  };

  try {
    const res = await fetchAPI('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    token = res.accessToken;
    currentUser = res.user;

    localStorage.setItem('librobe_token', token);
    localStorage.setItem('librobe_user', JSON.stringify(currentUser));

    initAuthUI();
    closeModal('modal-login');
    showToast(`Chào mừng ${currentUser.fullName} đăng nhập thành công!`, 'success');
  } catch (err) {
    console.error(err);
  }
}

function logoutAction() {
  if (confirm('Bạn có muốn đăng xuất khỏi hệ thống không?')) {
    token = '';
    currentUser = null;
    localStorage.removeItem('librobe_token');
    localStorage.removeItem('librobe_user');
    initAuthUI();
    showToast('Đã đăng xuất', 'success');
  }
}

// ==========================================================================
// UI UTILITIES & TOAST
// ==========================================================================
function openModal(id) {
  document.getElementById(id).classList.add('active');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span>${type === 'success' ? '✅' : '⚠️'}</span>
    <span>${message}</span>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}
