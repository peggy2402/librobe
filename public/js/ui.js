/**
 * UI & SVG Icon System for Librobe (Strict No-Emoji Policy)
 */

const icons = {
  book: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M6 6h10"/><path d="M6 10h10"/></svg>`,
  dashboard: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>`,
  borrow: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/></svg>`,
  users: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  tags: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/><path d="M7 7h.01"/></svg>`,
  search: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`,
  plus: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>`,
  refresh: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/></svg>`,
  logout: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>`,
  menu: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>`,
  close: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
  check: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  alert: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>`,
  trash: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`,
  edit: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`,
  dollar: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" x2="12" y1="2" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
  docs: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><line x1="10" x2="8" y1="9" y2="9"/></svg>`,
};

const ui = {
  icons,

  toast(message, type = 'info', duration = 4500) {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', 'alert');
    
    let iconSvg = icons.alert;
    if (type === 'success') iconSvg = icons.check;
    if (type === 'info') iconSvg = icons.alert;

    toast.innerHTML = `
      <div class="toast-icon">${iconSvg}</div>
      <div class="toast-message">${message}</div>
      <button type="button" class="toast-close-btn" title="Đóng thông báo" aria-label="Đóng">
        <svg style="width: 14px; height: 14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
        </svg>
      </button>
    `;

    const closeBtn = toast.querySelector('.toast-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-10px)';
        setTimeout(() => toast.remove(), 150);
      });
    }

    container.appendChild(toast);

    setTimeout(() => {
      if (toast.parentElement) {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-10px)';
        setTimeout(() => toast.remove(), 200);
      }
    }, duration);
  },

  modalStack: [],

  init() {
    // Global ESC key listener to close top-most modal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeTopModal();
      }
    });

    // Close on backdrop click and [data-close-modal]
    document.addEventListener('click', (e) => {
      const closeTarget = e.target.closest('[data-close-modal]');
      if (closeTarget) {
        const modalId = closeTarget.getAttribute('data-close-modal');
        this.closeModal(modalId);
        return;
      }

      if (e.target.classList.contains('modal-backdrop')) {
        this.closeModal(e.target.id);
      }
    });
  },

  openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('active');
      if (!this.modalStack.includes(modalId)) {
        this.modalStack.push(modalId);
      }
      // Focus first input if available
      const firstInput = modal.querySelector('input:not([type="hidden"]), select, textarea');
      if (firstInput) {
        setTimeout(() => firstInput.focus(), 100);
      }
    }
  },

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('active');
      this.modalStack = this.modalStack.filter((id) => id !== modalId);
      if (modal._onCancelResolve) {
        modal._onCancelResolve(false);
        modal._onCancelResolve = null;
      }
    }
  },

  closeTopModal() {
    if (this.modalStack.length > 0) {
      const topId = this.modalStack.pop();
      const modal = document.getElementById(topId);
      if (modal) {
        modal.classList.remove('active');
        if (modal._onCancelResolve) {
          modal._onCancelResolve(false);
          modal._onCancelResolve = null;
        }
      }
    }
  },

  closeAllModals() {
    document.querySelectorAll('.modal-backdrop').forEach((m) => {
      m.classList.remove('active');
      if (m._onCancelResolve) {
        m._onCancelResolve(false);
        m._onCancelResolve = null;
      }
    });
    this.modalStack = [];
  },

  /**
   * Universal Confirmation Dialog with "Hủy" and "Xác nhận" buttons
   * @param {Object} options
   * @param {string} options.title - Tiêu đề xác nhận
   * @param {string} options.message - Nội dung câu hỏi / cảnh báo
   * @param {string} [options.confirmText] - Nhãn nút xác nhận (Mặc định: 'Xác nhận')
   * @param {string} [options.cancelText] - Nhãn nút hủy (Mặc định: 'Hủy')
   * @param {string} [options.confirmType] - 'danger' | 'primary' | 'warning'
   * @returns {Promise<boolean>} Resolves true when confirmed, false when cancelled
   */
  confirm({
    title = 'Xác nhận thay đổi',
    message = 'Bạn có chắc chắn muốn thực hiện hành động này?',
    confirmText = 'Xác nhận',
    cancelText = 'Hủy',
    confirmType = 'danger',
  } = {}) {
    return new Promise((resolve) => {
      const modal = document.getElementById('modal-confirm');
      const titleEl = document.getElementById('confirm-modal-title');
      const msgEl = document.getElementById('confirm-modal-message');
      const okBtn = document.getElementById('confirm-modal-ok-btn');
      const cancelBtn = document.getElementById('confirm-modal-cancel-btn');

      if (!modal || !okBtn || !cancelBtn) {
        // Fallback if modal not present in DOM
        const result = window.confirm(`${title}\n\n${message}`);
        resolve(result);
        return;
      }

      if (titleEl) titleEl.textContent = title;
      if (msgEl) msgEl.textContent = message;
      if (cancelBtn) cancelBtn.textContent = cancelText;

      if (okBtn) {
        okBtn.textContent = confirmText;
        okBtn.className = `btn btn-${confirmType}`;
      }

      modal._onCancelResolve = resolve;

      const handleConfirm = () => {
        cleanup();
        this.closeModal('modal-confirm');
        resolve(true);
      };

      const handleCancel = () => {
        cleanup();
        this.closeModal('modal-confirm');
        resolve(false);
      };

      const cleanup = () => {
        okBtn.removeEventListener('click', handleConfirm);
        cancelBtn.removeEventListener('click', handleCancel);
        modal._onCancelResolve = null;
      };

      okBtn.addEventListener('click', handleConfirm, { once: true });
      cancelBtn.addEventListener('click', handleCancel, { once: true });

      this.openModal('modal-confirm');
    });
  },

  formatCurrency(amount = 0) {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
    }).format(amount);
  },

  formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  },

  renderBadge(status, text) {
    let badgeClass = 'badge-secondary';
    const s = String(status).toUpperCase();
    if (['AVAILABLE', 'ACTIVE', 'RETURNED'].includes(s)) badgeClass = 'badge-success';
    if (['BORROWED', 'WARNING'].includes(s)) badgeClass = 'badge-info';
    if (['OVERDUE', 'EXPIRED', 'OUT_OF_STOCK', 'SUSPENDED'].includes(s)) badgeClass = 'badge-danger';
    return `<span class="badge ${badgeClass}">${text || status}</span>`;
  },
};

window.ui = ui;
