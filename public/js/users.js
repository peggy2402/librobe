/**
 * Users & Role Management Module for Librobe
 *
 * Quản lý tài khoản đăng nhập (bảng `users`) — phân biệt với module `members`
 * quản lý thẻ độc giả (bảng `members`). Vai trò (`role`) nằm ở bảng `users`.
 *
 * Toàn bộ endpoint /api/users chỉ ADMIN gọi được. Nav item dẫn tới tab này đã
 * được ẩn với vai trò khác, nhưng backend vẫn là chốt chặn thật sự.
 */

const ROLE_LABELS = {
  ADMIN: 'Quản Trị Viên',
  LIBRARIAN: 'Thủ Thư',
  MEMBER: 'Độc Giả',
};

const users = {
  cachedUsers: [],
  currentFilter: '',

  init() {
    this.bindEvents();
  },

  bindEvents() {
    const filter = document.getElementById('users-filter-role');
    if (filter) {
      filter.addEventListener('change', () => {
        this.currentFilter = filter.value;
        this.loadUsers();
      });
    }

    const search = document.getElementById('users-search');
    if (search) {
      let timer;
      search.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => this.loadUsers(), 400);
      });
    }
  },

  roleBadge(role) {
    const cls =
      role === 'ADMIN' ? 'badge-danger' : role === 'LIBRARIAN' ? 'badge-info' : 'badge-secondary';
    return `<span class="badge ${cls}">${ROLE_LABELS[role] || role}</span>`;
  },

  async loadUsers() {
    const tbody = document.getElementById('users-tbody');
    const cardList = document.getElementById('users-card-list');
    if (!tbody) return;

    const loading = 'Đang tải danh sách tài khoản...';
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 32px; color: var(--text-muted);">${loading}</td></tr>`;
    if (cardList) {
      cardList.innerHTML = `<div style="text-align: center; padding: 24px; color: var(--text-muted);">${loading}</div>`;
    }

    try {
      const params = new URLSearchParams({ limit: '100' });
      if (this.currentFilter) params.set('role', this.currentFilter);
      const term = document.getElementById('users-search')?.value?.trim();
      if (term) params.set('search', term);

      const res = await api.get(`/api/users?${params.toString()}`);
      const list = res.data || [];
      this.cachedUsers = list;

      if (list.length === 0) {
        const empty = 'Không có tài khoản nào khớp điều kiện';
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 32px; color: var(--text-muted);">${empty}</td></tr>`;
        if (cardList) {
          cardList.innerHTML = `<div style="text-align: center; padding: 24px; color: var(--text-muted);">${empty}</div>`;
        }
        return;
      }

      const me = api.getCurrentUser();
      const myId = me?.id;

      tbody.innerHTML = list
        .map((u) => {
          const isSelf = u.id === myId;
          return `
        <tr>
          <td>
            <div style="font-weight: 600; color: var(--text-primary);">${this.escape(u.fullName)}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">${this.escape(u.email)}</div>
          </td>
          <td>
            <div>${this.escape(u.phone || '—')}</div>
            <div style="font-size: 0.6875rem; color: var(--text-muted);">
              ${u.memberId ? 'Có thẻ độc giả' : 'Không có thẻ độc giả'}
            </div>
          </td>
          <td>
            ${this.roleBadge(u.role)}
            ${isSelf ? '<div style="font-size: 0.6875rem; color: var(--text-muted); margin-top: 2px;">Tài khoản của bạn</div>' : ''}
          </td>
          <td>
            ${ui.renderBadge(u.isActive ? 'ACTIVE' : 'SUSPENDED', u.isActive ? 'Hoạt động' : 'Đã khóa')}
          </td>
          <td>
            <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
              <select
                class="form-input"
                style="width: auto; min-width: 130px; padding: 6px 8px; font-size: 0.8125rem;"
                ${isSelf ? 'disabled title="Không thể tự đổi vai trò của chính mình"' : ''}
                onchange="users.handleRoleChange('${u.id}', this.value, this)">
                ${['ADMIN', 'LIBRARIAN', 'MEMBER']
                  .map(
                    (r) =>
                      `<option value="${r}" ${r === u.role ? 'selected' : ''}>${ROLE_LABELS[r]}</option>`,
                  )
                  .join('')}
              </select>
              <button
                type="button"
                class="btn ${u.isActive ? 'btn-secondary' : 'btn-primary'} btn-sm"
                ${isSelf ? 'disabled title="Không thể tự khóa tài khoản của chính mình"' : ''}
                onclick="users.handleToggleStatus('${u.id}', ${u.isActive ? 'false' : 'true'})">
                ${u.isActive ? 'Khóa' : 'Mở lại'}
              </button>
            </div>
          </td>
        </tr>`;
        })
        .join('');

      if (cardList) {
        cardList.innerHTML = list
          .map((u) => {
            const isSelf = u.id === myId;
            return `
          <div class="mobile-card">
            <div class="mobile-card-header">
              <div>
                <div class="mobile-card-title">${this.escape(u.fullName)}</div>
                <div class="mobile-card-subtitle">${this.escape(u.email)}</div>
              </div>
              ${this.roleBadge(u.role)}
            </div>
            <div class="mobile-card-body">
              <div class="mobile-card-row">
                <span class="mobile-card-label">Điện thoại</span>
                <span>${this.escape(u.phone || '—')}</span>
              </div>
              <div class="mobile-card-row">
                <span class="mobile-card-label">Thẻ độc giả</span>
                <span>${u.memberId ? 'Có' : 'Không'}</span>
              </div>
              <div class="mobile-card-row">
                <span class="mobile-card-label">Trạng thái</span>
                <span>${ui.renderBadge(u.isActive ? 'ACTIVE' : 'SUSPENDED', u.isActive ? 'Hoạt động' : 'Đã khóa')}</span>
              </div>
            </div>
            <div class="mobile-card-actions">
              ${
                isSelf
                  ? '<span style="font-size: 0.8125rem; color: var(--text-muted);">Tài khoản của bạn</span>'
                  : `
                <select class="form-input" style="padding: 8px; font-size: 0.8125rem;"
                  onchange="users.handleRoleChange('${u.id}', this.value, this)">
                  ${['ADMIN', 'LIBRARIAN', 'MEMBER']
                    .map((r) => `<option value="${r}" ${r === u.role ? 'selected' : ''}>${ROLE_LABELS[r]}</option>`)
                    .join('')}
                </select>
                <button type="button" class="btn ${u.isActive ? 'btn-secondary' : 'btn-primary'} btn-sm"
                  onclick="users.handleToggleStatus('${u.id}', ${u.isActive ? 'false' : 'true'})">
                  ${u.isActive ? 'Khóa tài khoản' : 'Mở lại'}
                </button>`
              }
            </div>
          </div>`;
          })
          .join('');
      }
    } catch (err) {
      const msg = err.message || 'Không tải được danh sách tài khoản';
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 32px; color: #ef4444;">${this.escape(msg)}</td></tr>`;
      if (cardList) cardList.innerHTML = '';
    }
  },

  async handleRoleChange(userId, newRole, selectEl) {
    const user = this.cachedUsers.find((u) => u.id === userId);
    const previousRole = user?.role;

    if (!user || newRole === previousRole) return;

    const confirmed = await ui.confirm({
      title: 'Xác nhận đổi vai trò',
      message:
        `Đổi vai trò của "${user.fullName}" từ ${ROLE_LABELS[previousRole]} thành ${ROLE_LABELS[newRole]}?\n\n` +
        (newRole === 'MEMBER'
          ? 'Tài khoản sẽ mất quyền phê duyệt phiếu mượn và quản lý kho sách.'
          : 'Tài khoản sẽ được phép phê duyệt phiếu mượn và quản lý kho sách.'),
      confirmText: 'Xác Nhận Đổi',
      cancelText: 'Hủy',
      confirmType: 'primary',
    });

    if (!confirmed) {
      // Trả select về giá trị cũ khi người dùng hủy
      if (selectEl) selectEl.value = previousRole;
      return;
    }

    try {
      await api.patch(`/api/users/${userId}/role`, { role: newRole });
      ui.toast(
        `Đã đổi vai trò của ${user.fullName} thành ${ROLE_LABELS[newRole]}. ` +
          'Người đó cần đăng xuất và đăng nhập lại để quyền mới có hiệu lực.',
        'success',
        7000,
      );
      this.loadUsers();
    } catch (err) {
      if (selectEl) selectEl.value = previousRole;
      ui.toast(err.message || 'Không đổi được vai trò', 'error');
    }
  },

  async handleToggleStatus(userId, nextActive) {
    const user = this.cachedUsers.find((u) => u.id === userId);
    if (!user) return;

    const locking = nextActive === false || nextActive === 'false';

    const confirmed = await ui.confirm({
      title: locking ? 'Xác nhận khóa tài khoản' : 'Xác nhận mở lại tài khoản',
      message: locking
        ? `Khóa tài khoản "${user.fullName}"?\n\nNgười đó sẽ không đăng nhập được, và mọi liên kết đặt lại mật khẩu đang chờ sẽ bị vô hiệu.`
        : `Mở lại tài khoản "${user.fullName}"? Người đó sẽ đăng nhập lại được bình thường.`,
      confirmText: locking ? 'Khóa Tài Khoản' : 'Mở Lại',
      cancelText: 'Hủy',
      confirmType: locking ? 'danger' : 'primary',
    });

    if (!confirmed) return;

    try {
      await api.patch(`/api/users/${userId}/status`, { isActive: !locking });
      ui.toast(
        locking ? `Đã khóa tài khoản ${user.fullName}` : `Đã mở lại tài khoản ${user.fullName}`,
        'success',
      );
      this.loadUsers();
    } catch (err) {
      ui.toast(err.message || 'Không cập nhật được trạng thái tài khoản', 'error');
    }
  },

  escape(value) {
    return String(value ?? '').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
  },
};

window.users = users;
