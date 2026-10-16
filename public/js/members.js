/**
 * Members Management Module
 */

const members = {
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
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 32px; color: var(--text-muted);">Đang tải danh sách độc giả...</td></tr>`;

    try {
      const res = await api.get('/api/members');
      const list = res.data || [];

      if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 32px; color: var(--text-muted);">Chưa có độc giả nào đăng ký</td></tr>`;
        return;
      }

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
            <button class="btn btn-secondary btn-sm" onclick="members.handleDelete('${m.id}')">Xóa</button>
          </td>
        </tr>
      `).join('');
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--color-danger); padding: 32px;">Lỗi tải độc giả: ${err.message}</td></tr>`;
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
    if (!confirm('Bạn có chắc chắn muốn xóa hồ sơ độc giả này?')) return;
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
