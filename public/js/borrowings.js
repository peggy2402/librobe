/**
 * Borrowings & Loans Module for Librobe
 * Supports Desktop Table View & Mobile Card List View with ui.confirm
 */

const borrowings = {
  cachedBorrowings: [],

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
    const cardList = document.getElementById('borrowings-card-list');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 32px; color: var(--text-muted);">Đang tải danh sách phiếu mượn...</td></tr>`;
    if (cardList) {
      cardList.innerHTML = `<div style="text-align: center; padding: 24px; color: var(--text-muted);">Đang tải phiếu mượn...</div>`;
    }

    try {
      const res = await api.get('/api/borrowings');
      const list = res.data || [];
      this.cachedBorrowings = list;

      if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 32px; color: var(--text-muted);">Chưa có phiếu mượn nào trong hệ thống</td></tr>`;
        if (cardList) {
          cardList.innerHTML = `<div style="text-align: center; padding: 24px; color: var(--text-muted);">Chưa có phiếu mượn nào trong hệ thống</div>`;
        }
        return;
      }

      // 1. Render Desktop Table View
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
                  <button type="button" class="btn btn-primary btn-sm" onclick="borrowings.handleReturn('${b.id}')">Trả sách</button>
                  <button type="button" class="btn btn-secondary btn-sm" onclick="borrowings.handleRenew('${b.id}')">Gia hạn</button>
                </div>
              ` : `
                <span style="font-size: 0.75rem; color: var(--text-muted);">Hoàn tất (${ui.formatDate(b.returnDate)})</span>
              `}
            </td>
          </tr>
        `;
      }).join('');

      // 2. Render Mobile Card List View
      if (cardList) {
        cardList.innerHTML = list.map((b) => {
          let statusBadge = ui.renderBadge(b.status, 'Đang mượn');
          if (b.status === 'RETURNED') statusBadge = ui.renderBadge(b.status, 'Đã trả');
          if (b.status === 'OVERDUE') statusBadge = ui.renderBadge(b.status, 'Quá hạn');

          const canAction = b.status === 'BORROWED' || b.status === 'OVERDUE';

          return `
            <div class="mobile-data-card">
              <div class="mobile-card-header">
                <div>
                  <div class="mobile-card-title">${b.bookTitle}</div>
                  <div class="mobile-card-subtitle" style="font-family: monospace; color: #60a5fa;">Mã: ${b.transactionCode}</div>
                </div>
                <div>${statusBadge}</div>
              </div>

              <div class="mobile-card-body">
                <div class="mobile-card-field">
                  <span class="mobile-card-field-label">Độc giả</span>
                  <span class="mobile-card-field-val">${b.memberName}</span>
                </div>
                <div class="mobile-card-field">
                  <span class="mobile-card-field-label">Số thẻ</span>
                  <span class="mobile-card-field-val" style="font-family: monospace;">${b.memberCardNumber}</span>
                </div>
                <div class="mobile-card-field">
                  <span class="mobile-card-field-label">Ngày mượn</span>
                  <span class="mobile-card-field-val">${ui.formatDate(b.borrowDate)}</span>
                </div>
                <div class="mobile-card-field">
                  <span class="mobile-card-field-label">Hạn trả</span>
                  <span class="mobile-card-field-val" style="color: ${b.status === 'OVERDUE' ? '#f87171' : 'inherit'}; font-weight: ${b.status === 'OVERDUE' ? '700' : '500'};">
                    ${ui.formatDate(b.dueDate)}
                  </span>
                </div>
                ${b.fineAmount > 0 ? `
                  <div class="mobile-card-field" style="grid-column: span 2;">
                    <span class="mobile-card-field-label">Phạt quá hạn</span>
                    <span class="mobile-card-field-val" style="color: #f87171; font-weight: 700;">
                      ${ui.formatCurrency(b.fineAmount)}
                    </span>
                  </div>
                ` : ''}
              </div>

              <div class="mobile-card-actions">
                ${canAction ? `
                  <button type="button" class="btn btn-primary btn-sm" onclick="borrowings.handleReturn('${b.id}')">Xác Nhận Trả</button>
                  <button type="button" class="btn btn-secondary btn-sm" onclick="borrowings.handleRenew('${b.id}')">Gia Hạn 7 Ngày</button>
                ` : `
                  <span style="font-size: 0.8125rem; color: var(--text-muted);">Đã hoàn tất ngày ${ui.formatDate(b.returnDate)}</span>
                `}
              </div>
            </div>
          `;
        }).join('');
      }
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--color-danger); padding: 32px;">Lỗi tải phiếu mượn: ${err.message}</td></tr>`;
      if (cardList) {
        cardList.innerHTML = `<div style="text-align: center; color: var(--color-danger); padding: 24px;">Lỗi tải phiếu mượn: ${err.message}</div>`;
      }
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
    const item = this.cachedBorrowings.find((b) => b.id === id);
    const bookName = item ? `"${item.bookTitle}"` : 'cuốn sách này';

    // Confirmation Dialog with "Hủy" and "Xác nhận"
    const confirmed = await ui.confirm({
      title: 'Xác nhận trả sách',
      message: `Xác nhận độc giả đã mang ${bookName} hoàn trả về kho thư viện?`,
      confirmText: 'Xác Nhận Đã Nhận',
      cancelText: 'Hủy',
      confirmType: 'primary',
    });

    if (!confirmed) return;

    try {
      const res = await api.post(`/api/borrowings/${id}/return`, {
        notes: 'Trả sách tại quầy giao dịch',
        finePaid: true,
      });

      if (res.fineAmount > 0) {
        ui.toast(`Trả sách thành công. Thu tiền phạt trễ hạn: ${ui.formatCurrency(res.fineAmount)}`, 'warning');
      } else {
        ui.toast('Trả sách thành công. Bản in đã được hoàn lại vào kho!', 'success');
      }

      this.loadBorrowings();
      if (window.books) window.books.loadBooks();
      if (window.stats) window.stats.loadOverview();
    } catch (err) {
      ui.toast(err.message || 'Lỗi trả sách', 'error');
    }
  },

  async handleRenew(id) {
    const item = this.cachedBorrowings.find((b) => b.id === id);
    const bookName = item ? `"${item.bookTitle}"` : 'phiếu mượn này';

    // Confirmation Dialog with "Hủy" and "Xác nhận"
    const confirmed = await ui.confirm({
      title: 'Xác nhận gia hạn',
      message: `Bạn có muốn gia hạn thêm 7 ngày cho ${bookName}?`,
      confirmText: 'Xác Nhận Gia Hạn',
      cancelText: 'Hủy',
      confirmType: 'primary',
    });

    if (!confirmed) return;

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
