/**
 * Borrowing Slips Management — Back Office
 *
 * Tab "Nhật Ký Mượn / Trả Sách" đọc từ `/api/borrowing-slips` (phiếu mượn
 * nhiều cuốn, có quy trình phê duyệt). Trước đây tab này đọc `/api/borrowings`
 * là luồng phiếu lẻ cũ — bảng đó hiện rỗng nên danh sách luôn trắng.
 *
 * Mọi hành động đều: hiện Loading, chặn nhấn liên tục, và cập nhật giao diện
 * theo đúng Response của Backend (không tự suy đoán hay tự tính tiền phạt).
 */

const SLIP_STATUS_LABEL = {
  DRAFT: 'Nháp',
  PENDING_APPROVAL: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  BORROWED: 'Đang mượn',
  PARTIAL_RETURNED: 'Trả một phần',
  COMPLETED: 'Hoàn tất',
  REJECTED: 'Đã từ chối',
  CANCELLED: 'Đã hủy',
};

const SLIP_STATUS_CLASS = {
  PENDING_APPROVAL: 'badge-warning',
  BORROWED: 'badge-info',
  PARTIAL_RETURNED: 'badge-info',
  COMPLETED: 'badge-success',
  REJECTED: 'badge-danger',
  CANCELLED: 'badge-secondary',
  DRAFT: 'badge-secondary',
  APPROVED: 'badge-info',
};

const ITEM_STATUS_LABEL = {
  PENDING: 'Chờ xuất kho',
  BORROWING: 'Đang mượn',
  RETURNED: 'Đã trả',
  LOST: 'Báo mất',
  CANCELLED: 'Đã hủy',
};

const borrowings = {
  cachedSlips: [],
  /** Các hành động đang gửi lên server, chặn gửi trùng khi bấm liên tục. */
  inFlight: new Set(),

  init() {
    // Xem ghi chú ở `books.init()`: không gọi API tại thời điểm này vì
    // `init()` chạy lúc DOMContentLoaded, trước khi biết đã đăng nhập chưa.
    this.bindEvents();
  },

  bindEvents() {
    document.getElementById('new-borrow-form')?.addEventListener('submit', (e) =>
      this.handleCreateSlip(e),
    );
    document.getElementById('return-items-form')?.addEventListener('submit', (e) =>
      this.handleSubmitReturn(e),
    );
  },

  /** Nạp danh sách độc giả vào select của modal lập phiếu mượn. */
  async loadMembersSelect() {
    const select = document.getElementById('borrow-form-member');
    if (!select) return;

    try {
      const res = await api.get('/api/members', { limit: 100 });
      const list = res.data || [];
      select.innerHTML =
        '<option value="">— Chọn độc giả —</option>' +
        list
          .map(
            (m) =>
              `<option value="${m.id}">${this.esc(m.fullName)} (${this.esc(m.cardNumber)}) — đang mượn ${m.currentBorrowedCount}/${m.maxBorrowLimit}</option>`,
          )
          .join('');
    } catch (err) {
      select.innerHTML = '<option value="">Không tải được danh sách độc giả</option>';
      console.error('[borrowings] loadMembersSelect:', err);
    }
  },

  esc(v) {
    return String(v ?? '').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
  },

  statusBadge(status) {
    const cls = SLIP_STATUS_CLASS[status] || 'badge-secondary';
    return `<span class="badge ${cls}">${SLIP_STATUS_LABEL[status] || status}</span>`;
  },

  /** Số cuốn chưa hoàn tất của một dòng chi tiết. */
  remainingOf(item) {
    return Math.max(0, item.quantity - item.returnedQuantity - item.lostQuantity);
  },

  // ==========================================================================
  // Tải danh sách
  // ==========================================================================

  async loadBorrowings() {
    const tbody = document.getElementById('borrowings-tbody');
    const cardList = document.getElementById('borrowings-card-list');
    if (!tbody) return;

    const loading = 'Đang tải phiếu mượn...';
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-muted);">${loading}</td></tr>`;
    if (cardList) {
      cardList.innerHTML = `<div style="text-align:center;padding:24px;color:var(--text-muted);">${loading}</div>`;
    }

    try {
      const res = await api.get('/api/borrowing-slips', { limit: 50 });
      const list = res.data || [];
      this.cachedSlips = list;

      if (list.length === 0) {
        const empty = 'Chưa có phiếu mượn nào trong hệ thống';
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-muted);">${empty}</td></tr>`;
        if (cardList) {
          cardList.innerHTML = `<div style="text-align:center;padding:24px;color:var(--text-muted);">${empty}</div>`;
        }
        return;
      }

      tbody.innerHTML = list.map((s) => this.renderRow(s)).join('');
      if (cardList) cardList.innerHTML = list.map((s) => this.renderCard(s)).join('');

      if (window.auth?.applyRoleVisibility) {
        auth.applyRoleVisibility(api.getCurrentUser()?.role);
      }
    } catch (err) {
      const msg = this.esc(err.message || 'Không tải được danh sách phiếu mượn');
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:32px;color:#ef4444;">${msg}</td></tr>`;
      if (cardList) cardList.innerHTML = '';
    }
  },

  renderRow(s) {
    const books = (s.items || [])
      .map(
        (i) =>
          `<div style="font-size:0.8125rem;">
             ${this.esc(i.bookTitle)}
             <span style="color:var(--text-muted);">×${i.quantity}</span>
             <span style="font-size:0.6875rem;color:var(--text-muted);">(${ITEM_STATUS_LABEL[i.status] || i.status})</span>
           </div>`,
      )
      .join('');

    const overdue = s.status !== 'COMPLETED' && new Date(s.dueDate) < new Date();

    return `
      <tr>
        <td style="font-family:monospace;font-weight:600;color:#10b981;">
          ${this.esc(s.slipNumber)}
          ${s.renewCount > 0 ? `<div style="font-size:0.6875rem;color:var(--text-muted);">Đã gia hạn ${s.renewCount} lần</div>` : ''}
        </td>
        <td>${books || '—'}</td>
        <td>
          <div style="font-weight:600;">${this.esc(s.memberName)}</div>
          <div style="font-size:0.75rem;color:var(--text-muted);">${this.esc(s.memberCardNumber)}</div>
        </td>
        <td>
          <div style="font-size:0.8125rem;">Hạn: ${ui.formatDate(s.dueDate)}</div>
          ${overdue ? '<div style="font-size:0.6875rem;color:#f87171;font-weight:600;">QUÁ HẠN</div>' : ''}
        </td>
        <td>${this.statusBadge(s.status)}</td>
        <td>${this.renderFine(s)}</td>
        <td><div style="display:flex;gap:6px;flex-wrap:wrap;">${this.renderActions(s)}</div></td>
      </tr>`;
  },

  /**
   * Tiền phạt hiển thị nguyên giá trị Backend trả về, và phân biệt rõ
   * "đã thu" với "còn nợ" — đây là hai trạng thái độc lập với việc trả sách.
   */
  renderFine(s) {
    if (!s.totalFine || s.totalFine <= 0) {
      return '<span style="color:var(--text-muted);">—</span>';
    }
    return `
      <div style="font-weight:600;color:${s.finePaid ? '#10b981' : '#f87171'};">
        ${ui.formatCurrency(s.totalFine)}
      </div>
      <div style="font-size:0.6875rem;color:var(--text-muted);">
        ${s.finePaid ? 'Đã thu' : 'Chưa thanh toán'}
      </div>`;
  },

  /** Nút hiển thị theo đúng trạng thái Backend trả về, không tự suy đoán. */
  renderActions(s) {
    const btns = [];
    const staff = 'data-require-role="ADMIN,LIBRARIAN"';

    if (s.status === 'PENDING_APPROVAL') {
      btns.push(
        `<button type="button" class="btn btn-primary btn-sm" ${staff}
           data-action-id="approve-${s.id}" onclick="borrowings.handleApprove('${s.id}')">Duyệt</button>`,
        `<button type="button" class="btn btn-secondary btn-sm" ${staff}
           data-action-id="reject-${s.id}" onclick="borrowings.handleReject('${s.id}')">Từ chối</button>`,
      );
    }

    if (s.status === 'BORROWED' || s.status === 'PARTIAL_RETURNED') {
      btns.push(
        `<button type="button" class="btn btn-primary btn-sm" ${staff}
           onclick="borrowings.openReturnModal('${s.id}')">Trả sách</button>`,
      );

      // Hết lượt gia hạn thì vô hiệu hóa nút, nêu rõ lý do thay vì để bấm rồi lỗi
      const canRenew = (s.renewCount || 0) < 1;
      btns.push(
        `<button type="button" class="btn btn-secondary btn-sm" ${staff}
           ${canRenew ? '' : 'disabled title="Phiếu đã dùng hết số lần gia hạn cho phép"'}
           data-action-id="renew-${s.id}" onclick="borrowings.handleRenew('${s.id}')">Gia hạn</button>`,
        `<button type="button" class="btn btn-secondary btn-sm" ${staff}
           data-action-id="cancel-${s.id}" onclick="borrowings.handleCancel('${s.id}')">Hủy</button>`,
      );
    }

    if (s.totalFine > 0 && !s.finePaid) {
      btns.push(
        `<button type="button" class="btn btn-primary btn-sm" ${staff}
           data-action-id="payfine-${s.id}" onclick="borrowings.handlePayFine('${s.id}')">Thu phạt</button>`,
      );
    }

    return btns.join('') || '<span style="font-size:0.75rem;color:var(--text-muted);">—</span>';
  },

  renderCard(s) {
    const books = (s.items || [])
      .map(
        (i) =>
          `<div class="mobile-card-row">
             <span class="mobile-card-label">${this.esc(i.bookTitle)} ×${i.quantity}</span>
             <span style="font-size:0.75rem;">${ITEM_STATUS_LABEL[i.status] || i.status}</span>
           </div>`,
      )
      .join('');

    return `
      <div class="mobile-card">
        <div class="mobile-card-header">
          <div>
            <div class="mobile-card-title">${this.esc(s.slipNumber)}</div>
            <div class="mobile-card-subtitle">${this.esc(s.memberName)} · ${this.esc(s.memberCardNumber)}</div>
          </div>
          ${this.statusBadge(s.status)}
        </div>
        <div class="mobile-card-body">
          ${books}
          <div class="mobile-card-row">
            <span class="mobile-card-label">Hạn trả</span>
            <span>${ui.formatDate(s.dueDate)}</span>
          </div>
          <div class="mobile-card-row">
            <span class="mobile-card-label">Tiền phạt</span>
            <span>${s.totalFine > 0 ? `${ui.formatCurrency(s.totalFine)} (${s.finePaid ? 'đã thu' : 'chưa thu'})` : '—'}</span>
          </div>
        </div>
        <div class="mobile-card-actions">${this.renderActions(s)}</div>
      </div>`;
  },

  // ==========================================================================
  // Chống gửi trùng + Loading
  // ==========================================================================

  /**
   * Bọc một hành động: khóa theo key để nhấn liên tục không gửi nhiều Request,
   * đồng thời vô hiệu hóa nút và hiện chữ "Đang xử lý...".
   */
  async runAction(key, button, fn) {
    if (this.inFlight.has(key)) return;
    this.inFlight.add(key);

    const el = button || document.querySelector(`[data-action-id="${key}"]`);
    const original = el ? el.innerHTML : null;
    if (el) {
      el.disabled = true;
      el.innerHTML = 'Đang xử lý...';
    }

    try {
      return await fn();
    } finally {
      this.inFlight.delete(key);
      if (el && original !== null) {
        el.disabled = false;
        el.innerHTML = original;
      }
    }
  },

  /** Đồng bộ lại mọi dữ liệu liên quan theo Backend sau khi thao tác xong. */
  refreshAll() {
    this.loadBorrowings();
    if (window.books) window.books.loadBooks();
    if (window.stats) window.stats.loadOverview();
  },

  // ==========================================================================
  // Lập phiếu mượn
  // ==========================================================================

  async handleCreateSlip(e) {
    e.preventDefault();

    const memberId = document.getElementById('borrow-form-member')?.value;
    const bookId = document.getElementById('borrow-form-book')?.value;
    const days = parseInt(document.getElementById('borrow-form-days')?.value, 10) || 14;
    const submitBtn = e.target.querySelector('button[type="submit"]');

    if (!memberId || !bookId) {
      ui.toast('Vui lòng chọn độc giả và sách muốn mượn', 'error');
      return;
    }

    await this.runAction('create-slip', submitBtn, async () => {
      try {
        const slip = await api.post('/api/borrowing-slips', {
          memberId,
          items: [{ bookId, quantity: 1 }],
          expectedReturnDays: days,
        });

        ui.toast(
          `Đã lập phiếu ${slip.slipNumber}, đang chờ duyệt để xuất kho`,
          'success',
        );
        ui.closeModal('modal-new-borrow');
        document.getElementById('new-borrow-form')?.reset();
        this.refreshAll();
      } catch (err) {
        // Thông báo lấy nguyên văn từ Backend, không tự diễn giải lại
        ui.toast(err.message || 'Không lập được phiếu mượn', 'error');
      }
    });
  },

  // ==========================================================================
  // Phê duyệt / Từ chối / Hủy
  // ==========================================================================

  async handleApprove(id) {
    const s = this.cachedSlips.find((x) => x.id === id);
    const confirmed = await ui.confirm({
      title: 'Phê duyệt xuất kho',
      message: `Duyệt phiếu ${s?.slipNumber || ''} và xuất sách khỏi kho?\n\nTồn kho sẽ bị trừ tương ứng.`,
      confirmText: 'Duyệt & Xuất Kho',
      cancelText: 'Hủy',
      confirmType: 'primary',
    });
    if (!confirmed) return;

    await this.runAction(`approve-${id}`, null, async () => {
      try {
        const res = await api.patch(`/api/borrowing-slips/${id}/approve`);
        ui.toast(`Đã duyệt phiếu ${res.slipNumber}. Hạn trả: ${ui.formatDate(res.dueDate)}`, 'success');
        this.refreshAll();
      } catch (err) {
        ui.toast(err.message || 'Không duyệt được phiếu', 'error');
        // Thất bại do tranh chấp tồn kho thì phải tải lại để thấy số liệu mới nhất
        this.refreshAll();
      }
    });
  },

  async handleReject(id) {
    const reason = window.prompt('Lý do từ chối phiếu mượn:');
    if (reason === null) return;
    if (!reason.trim()) {
      ui.toast('Vui lòng nhập lý do từ chối', 'error');
      return;
    }

    await this.runAction(`reject-${id}`, null, async () => {
      try {
        await api.patch(`/api/borrowing-slips/${id}/reject`, { reason: reason.trim() });
        ui.toast('Đã từ chối phiếu mượn', 'info');
        this.refreshAll();
      } catch (err) {
        ui.toast(err.message || 'Không từ chối được phiếu', 'error');
      }
    });
  },

  async handleCancel(id) {
    const s = this.cachedSlips.find((x) => x.id === id);
    const confirmed = await ui.confirm({
      title: 'Hủy phiếu mượn',
      message: `Hủy phiếu ${s?.slipNumber || ''}?\n\nSố sách chưa trả sẽ được hoàn lại vào kho.`,
      confirmText: 'Hủy Phiếu',
      cancelText: 'Không',
      confirmType: 'danger',
    });
    if (!confirmed) return;

    await this.runAction(`cancel-${id}`, null, async () => {
      try {
        await api.patch(`/api/borrowing-slips/${id}/cancel`, {
          reason: 'Hủy tại quầy giao dịch',
        });
        ui.toast('Đã hủy phiếu mượn và hoàn lại tồn kho', 'info');
        this.refreshAll();
      } catch (err) {
        ui.toast(err.message || 'Không hủy được phiếu', 'error');
      }
    });
  },

  // ==========================================================================
  // Gia hạn
  // ==========================================================================

  async handleRenew(id) {
    const s = this.cachedSlips.find((x) => x.id === id);
    const confirmed = await ui.confirm({
      title: 'Gia hạn phiếu mượn',
      message: `Gia hạn thêm 7 ngày cho phiếu ${s?.slipNumber || ''}?\n\nKhông áp dụng nếu sách đang có độc giả khác đặt trước.`,
      confirmText: 'Xác Nhận Gia Hạn',
      cancelText: 'Hủy',
      confirmType: 'primary',
    });
    if (!confirmed) return;

    await this.runAction(`renew-${id}`, null, async () => {
      try {
        const res = await api.patch(`/api/borrowing-slips/${id}/renew`, { extraDays: 7 });
        // Hạn trả mới lấy từ Response, không tự cộng ở client
        ui.toast(`Đã gia hạn. Hạn trả mới: ${ui.formatDate(res.dueDate)}`, 'success');
        this.loadBorrowings();
      } catch (err) {
        ui.toast(err.message || 'Không gia hạn được phiếu', 'error');
      }
    });
  },

  // ==========================================================================
  // Trả sách từng phần
  // ==========================================================================

  openReturnModal(id) {
    const s = this.cachedSlips.find((x) => x.id === id);
    if (!s) return;

    const body = document.getElementById('return-items-body');
    const slipLabel = document.getElementById('return-slip-number');
    const hidden = document.getElementById('return-slip-id');
    if (!body || !hidden) return;

    hidden.value = id;
    if (slipLabel) slipLabel.textContent = `${s.slipNumber} · ${s.memberName}`;

    const pending = (s.items || []).filter((i) => this.remainingOf(i) > 0);

    if (pending.length === 0) {
      body.innerHTML =
        '<div style="padding:16px;color:var(--text-muted);">Phiếu này đã hoàn tất, không còn sách cần trả.</div>';
    } else {
      body.innerHTML = pending
        .map((i) => {
          const remain = this.remainingOf(i);
          return `
          <div style="border:1px solid var(--border-color);border-radius:8px;padding:12px;margin-bottom:10px;">
            <label style="display:flex;align-items:center;gap:8px;font-weight:600;">
              <input type="checkbox" class="return-item-check" data-item-id="${i.id}" checked>
              <span>${this.esc(i.bookTitle)}</span>
            </label>
            <div style="display:flex;gap:10px;margin-top:10px;flex-wrap:wrap;">
              <div>
                <label class="form-label" style="font-size:0.75rem;">Số lượng (còn ${remain})</label>
                <input type="number" class="form-control return-item-qty"
                       value="${remain}" min="1" max="${remain}" style="width:110px;">
              </div>
              <div>
                <label class="form-label" style="font-size:0.75rem;">Tình trạng</label>
                <select class="form-control return-item-condition" style="width:170px;">
                  <option value="GOOD">Nguyên vẹn</option>
                  <option value="DAMAGED">Hư hỏng</option>
                  <option value="LOST">Báo mất (bồi thường)</option>
                </select>
              </div>
            </div>
          </div>`;
        })
        .join('');
    }

    ui.openModal('modal-return-items');
  },

  async handleSubmitReturn(e) {
    e.preventDefault();

    const slipId = document.getElementById('return-slip-id')?.value;
    const isPaidNow = document.getElementById('return-fine-paid')?.checked || false;
    const submitBtn = e.target.querySelector('button[type="submit"]');
    if (!slipId) return;

    const items = [];
    document.querySelectorAll('#return-items-body .return-item-check').forEach((chk) => {
      if (!chk.checked) return;
      const box = chk.closest('div');
      items.push({
        itemId: chk.getAttribute('data-item-id'),
        quantity: parseInt(box.querySelector('.return-item-qty')?.value, 10) || 1,
        returnCondition: box.querySelector('.return-item-condition')?.value || 'GOOD',
      });
    });

    if (items.length === 0) {
      ui.toast('Vui lòng chọn ít nhất một cuốn sách để trả', 'error');
      return;
    }

    await this.runAction(`return-${slipId}`, submitBtn, async () => {
      try {
        const res = await api.post(`/api/borrowing-slips/${slipId}/return-items`, {
          items,
          isPaidNow,
        });

        // Tiền phạt hiển thị nguyên giá trị Backend tính, client không tự tính
        if (res.totalFine > 0) {
          ui.toast(
            `Đã ghi nhận trả sách. Tổng tiền phạt: ${ui.formatCurrency(res.totalFine)}` +
              (res.finePaid ? ' (đã thu)' : ' — CHƯA thanh toán'),
            res.finePaid ? 'success' : 'warning',
            7000,
          );
        } else {
          ui.toast('Đã ghi nhận trả sách, không phát sinh tiền phạt', 'success');
        }

        ui.closeModal('modal-return-items');
        this.refreshAll();
      } catch (err) {
        ui.toast(err.message || 'Không ghi nhận được việc trả sách', 'error');
      }
    });
  },

  // ==========================================================================
  // Thu tiền phạt
  // ==========================================================================

  async handlePayFine(id) {
    const s = this.cachedSlips.find((x) => x.id === id);
    const confirmed = await ui.confirm({
      title: 'Thu tiền phạt',
      message: `Xác nhận đã thu ${ui.formatCurrency(s?.totalFine || 0)} tiền phạt của phiếu ${s?.slipNumber || ''}?`,
      confirmText: 'Đã Thu Tiền',
      cancelText: 'Hủy',
      confirmType: 'primary',
    });
    if (!confirmed) return;

    await this.runAction(`payfine-${id}`, null, async () => {
      try {
        await api.post(`/api/borrowing-slips/${id}/pay-fine`);
        ui.toast('Đã ghi nhận thanh toán tiền phạt', 'success');
        this.refreshAll();
      } catch (err) {
        ui.toast(err.message || 'Không ghi nhận được thanh toán', 'error');
      }
    });
  },
};

window.borrowings = borrowings;
