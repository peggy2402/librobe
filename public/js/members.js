/**
 * Members Management Module for Librobe
 * Supports Desktop Table View & Mobile Card List View with ui.confirm
 */

const members = {
  cachedMembers: [],

  init() {
    this.bindEvents();
  },

  bindEvents() {
    const memberForm = document.getElementById('new-member-form');
    if (memberForm) {
      memberForm.addEventListener('submit', (e) => this.handleCreateMember(e));
    }
  },

  async loadMembers() {
    const tbody = document.getElementById('members-tbody');
    const cardList = document.getElementById('members-card-list');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 32px; color: var(--text-muted);">Đang tải danh sách độc giả...</td></tr>`;
    if (cardList) {
      cardList.innerHTML = `<div style="text-align: center; padding: 24px; color: var(--text-muted);">Đang tải độc giả...</div>`;
    }

    try {
      const res = await api.get('/api/members');
      const list = res.data || [];
      this.cachedMembers = list;

      if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 32px; color: var(--text-muted);">Chưa có độc giả nào đăng ký</td></tr>`;
        if (cardList) {
          cardList.innerHTML = `<div style="text-align: center; padding: 24px; color: var(--text-muted);">Chưa có độc giả nào đăng ký</div>`;
        }
        return;
      }

      // 1. Render Desktop Table View
      tbody.innerHTML = list.map((m) => `
        <tr>
          <td style="font-family: monospace; font-weight: 600; color: #10b981;">${m.cardNumber}</td>
          <td>
            <div style="font-weight: 600; color: var(--text-primary);">${m.fullName}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">${m.address || '—'}</div>
          </td>
          <td>
            <div>${m.email || '—'}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">${m.phone || '—'}</div>
          </td>
          <td>
            <span class="badge badge-info">${m.currentBorrowedCount || 0} / ${m.maxBorrowLimit || 5} cuốn</span>
          </td>
          <td>
            ${ui.renderBadge(m.status, m.status === 'ACTIVE' ? 'Hoạt động' : 'Hết hạn')}
            <div style="font-size: 0.6875rem; color: var(--text-muted); margin-top: 2px;">
              Hạn thẻ: ${ui.formatDate(m.membershipExpiry)}
            </div>
          </td>
          <td>
            <button type="button" class="btn btn-secondary btn-sm" onclick="members.handleDelete('${m.id}')">Xóa</button>
          </td>
        </tr>
      `).join('');

      // 2. Render Mobile Card List View
      if (cardList) {
        cardList.innerHTML = list.map((m) => `
          <div class="mobile-data-card">
            <div class="mobile-card-header">
              <div>
                <div class="mobile-card-title">${m.fullName}</div>
                <div class="mobile-card-subtitle" style="font-family: monospace; color: #10b981;">Thẻ: ${m.cardNumber}</div>
              </div>
              <div>${ui.renderBadge(m.status, m.status === 'ACTIVE' ? 'Hoạt động' : 'Hết hạn')}</div>
            </div>

            <div class="mobile-card-body">
              <div class="mobile-card-field">
                <span class="mobile-card-field-label">Email</span>
                <span class="mobile-card-field-val">${m.email || '—'}</span>
              </div>
              <div class="mobile-card-field">
                <span class="mobile-card-field-label">Số điện thoại</span>
                <span class="mobile-card-field-val">${m.phone || '—'}</span>
              </div>
              <div class="mobile-card-field">
                <span class="mobile-card-field-label">Đang mượn</span>
                <span class="mobile-card-field-val" style="color: #22d3ee; font-weight: 600;">${m.currentBorrowedCount || 0} / ${m.maxBorrowLimit || 5} cuốn</span>
              </div>
              <div class="mobile-card-field">
                <span class="mobile-card-field-label">Hạn thẻ</span>
                <span class="mobile-card-field-val">${ui.formatDate(m.membershipExpiry)}</span>
              </div>
              ${m.address ? `
                <div class="mobile-card-field" style="grid-column: span 2;">
                  <span class="mobile-card-field-label">Địa chỉ</span>
                  <span class="mobile-card-field-val">${m.address}</span>
                </div>
              ` : ''}
            </div>

            <div class="mobile-card-actions">
              <button type="button" class="btn btn-danger btn-sm" onclick="members.handleDelete('${m.id}')">Xóa Hồ Sơ</button>
            </div>
          </div>
        `).join('');
      }
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--color-danger); padding: 32px;">Lỗi tải độc giả: ${err.message}</td></tr>`;
      if (cardList) {
        cardList.innerHTML = `<div style="text-align: center; color: var(--color-danger); padding: 24px;">Lỗi tải độc giả: ${err.message}</div>`;
      }
    }
  },

  async handleCreateMember(e) {
    e.preventDefault();
    const fullName = document.getElementById('member-form-name')?.value.trim();
    const email = document.getElementById('member-form-email')?.value.trim();
    const phone = document.getElementById('member-form-phone')?.value.trim();
    const address = document.getElementById('member-form-address')?.value.trim();
    const maxBorrowLimit = parseInt(document.getElementById('member-form-limit')?.value) || 5;

    if (!fullName || !email || !phone) {
      ui.toast('Vui lòng nhập họ tên, email và số điện thoại', 'error');
      return;
    }

    try {
      await api.post('/api/members', {
        fullName,
        email,
        phone,
        address,
        maxBorrowLimit,
      });

      ui.toast('Cấp thẻ độc giả mới thành công', 'success');
      ui.closeModal('modal-new-member');
      document.getElementById('new-member-form')?.reset();
      this.loadMembers();
      if (window.borrowings) window.borrowings.loadMembersSelect();
      if (window.stats) window.stats.loadOverview();
    } catch (err) {
      ui.toast(err.message || 'Lỗi cấp thẻ độc giả', 'error');
    }
  },

  async handleDelete(id) {
    const member = this.cachedMembers.find((m) => m.id === id);
    const memberName = member ? `"${member.fullName}"` : 'độc giả này';

    // Confirmation Dialog with "Hủy" and "Xác nhận"
    const confirmed = await ui.confirm({
      title: 'Xác nhận xóa độc giả',
      message: `Bạn có chắc chắn muốn xóa hồ sơ độc giả ${memberName}? Lưu ý: Độc giả đang mượn sách sẽ không thể xóa.`,
      confirmText: 'Xác Nhận Xóa',
      cancelText: 'Hủy',
      confirmType: 'danger',
    });

    if (!confirmed) return;

    try {
      await api.delete(`/api/members/${id}`);
      ui.toast('Đã xóa độc giả thành công', 'success');
      this.loadMembers();
      if (window.stats) window.stats.loadOverview();
    } catch (err) {
      ui.toast(err.message || 'Không thể xóa độc giả đang mượn sách', 'error');
    }
  },
};

window.members = members;
