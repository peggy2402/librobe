/**
 * Borrowings & Loans Module
 */

const borrowings = {
  init() {
    this.bindEvents();
    this.loadMembersSelect();
  },

  bindEvents() {
    const borrowForm = document.getElementById('new-borrow-form');
    if (borrowForm) {
      borrowForm.addEventListener('submit', (e) => this.handleCreateBorrow(e));
    }
  },

  async loadMembersSelect() {
    try {
      const res = await api.get('/api/members');
      const list = res.data || [];
      const select = document.getElementById('borrow-form-member');
      if (select) {
        let options = `<option value="" disabled selected>Chọn độc giả mượn sách</option>`;
        list.forEach((m) => {
          options += `<option value="${m.id}">${m.fullName} (${m.cardNumber})</option>`;
        });
        select.innerHTML = options;
      }
    } catch (err) {
      console.error('Lỗi tải độc giả:', err);
    }
  },

  async loadBorrowings() {
    const tbody = document.getElementById('borrowings-tbody');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 32px; color: var(--text-muted);">Đang tải danh sách phiếu mượn...</td></tr>`;

    try {
      const res = await api.get('/api/borrowings');
      const list = res.data || [];

      if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 32px; color: var(--text-muted);">Chưa có phiếu mượn nào trong hệ thống</td></tr>`;
        return;
      }

      tbody.innerHTML = list.map((b) => {
        let statusBadge = ui.renderBadge(b.status, 'Đang mượn');
        if (b.status === 'RETURNED') statusBadge = ui.renderBadge(b.status, 'Đã trả');
        if (b.status === 'OVERDUE') statusBadge = ui.renderBadge(b.status, 'Quá hạn');

        const canAction = b.status === 'BORROWED' || b.status === 'OVERDUE';

        return `
          <tr>
            <td style="font-family: monospace; font-weight: 600; color: #60a5fa;">${b.transactionCode}</td>
            <td>
              <div style="font-weight: 600;">${b.bookTitle}</div>
            </td>
            <td>
              <div style="font-weight: 500;">${b.memberName}</div>
              <div style="font-size: 0.75rem; color: var(--text-muted);">${b.memberCardNumber}</div>
            </td>
            <td>
              <div>Mượn: ${ui.formatDate(b.borrowDate)}</div>
              <div style="color: ${b.status === 'OVERDUE' ? '#f87171' : 'var(--text-muted)'}; font-size: 0.75rem;">
                Hạn: ${ui.formatDate(b.dueDate)}
              </div>
            </td>
            <td>${statusBadge}</td>
            <td>
              ${b.fineAmount > 0 
                ? `<span style="color: #f87171; font-weight: 600;">${ui.formatCurrency(b.fineAmount)}</span>`
                : '—'}
            </td>
            <td>
              ${canAction ? `
                <div style="display: flex; gap: 6px;">
                  <button class="btn btn-primary btn-sm" onclick="borrowings.handleReturn('${b.id}')">Trả sách</button>
                  <button class="btn btn-secondary btn-sm" onclick="borrowings.handleRenew('${b.id}')">Gia hạn</button>
                </div>
              ` : `
                <span style="font-size: 0.75rem; color: var(--text-muted);">Hoàn tất (${ui.formatDate(b.returnDate)})</span>
              `}
            </td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--color-danger); padding: 32px;">Lỗi tải phiếu mượn: ${err.message}</td></tr>`;
    }
  },

  async handleCreateBorrow(e) {
    e.preventDefault();
    const memberId = document.getElementById('borrow-form-member')?.value;
    const bookId = document.getElementById('borrow-form-book')?.value;
    const durationDays = parseInt(document.getElementById('borrow-form-days')?.value) || 14;

    if (!memberId || !bookId) {
      ui.toast('Vui lòng chọn độc giả và sách muốn mượn', 'error');
      return;
    }

    try {
      await api.post('/api/borrowings', {
        memberId,
        bookId,
        durationDays,
      });

      ui.toast('Tạo phiếu mượn sách thành công', 'success');
      ui.closeModal('modal-new-borrow');
      document.getElementById('new-borrow-form')?.reset();
      this.loadBorrowings();
      if (window.books) window.books.loadBooks();
      if (window.stats) window.stats.loadOverview();
    } catch (err) {
      ui.toast(err.message || 'Lỗi tạo phiếu mượn', 'error');
    }
  },

  async handleReturn(id) {
    if (!confirm('Xác nhận độc giả đã hoàn trả sách này về kho?')) return;
    try {
      const res = await api.post(`/api/borrowings/${id}/return`, {
        notes: 'Trả sách tại quầy giao dịch',
        finePaid: true,
      });

      if (res.fineAmount > 0) {
        ui.toast(`Trả sách thành công. Thu tiền phạt trễ hạn: ${ui.formatCurrency(res.fineAmount)}`, 'warning');
      } else {
        ui.toast('Trả sách thành công. Đã hoàn trả bản in vào kho!', 'success');
      }

      this.loadBorrowings();
      if (window.books) window.books.loadBooks();
      if (window.stats) window.stats.loadOverview();
    } catch (err) {
      ui.toast(err.message || 'Lỗi trả sách', 'error');
    }
  },

  async handleRenew(id) {
    try {
      await api.post(`/api/borrowings/${id}/renew`, { extraDays: 7 });
      ui.toast('Gia hạn thời gian mượn thêm 7 ngày thành công', 'success');
      this.loadBorrowings();
    } catch (err) {
      ui.toast(err.message || 'Không thể gia hạn (quá số lần cho phép hoặc sách đã quá hạn)', 'error');
    }
  },
};

window.borrowings = borrowings;
