/**
 * Main Application Bootstrapper for Librobe
 */

document.addEventListener('DOMContentLoaded', () => {
  // 0. Khởi tạo UI Helpers (ESC key, Modal, Toast)
  ui.init();

  // 1. Khởi tạo Auth
  auth.init();

  // 2. Khởi tạo Modules
  books.init();
  borrowings.init();
  members.init();

  // 3. Xử lý chuyển đổi Tab Navigation
  const navLinks = document.querySelectorAll('.nav-link[data-tab]');
  navLinks.forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const targetTabId = link.getAttribute('data-tab');

      // Update active nav
      navLinks.forEach((l) => l.classList.remove('active'));
      link.classList.add('active');

      // Switch active tab pane
      document.querySelectorAll('.tab-pane').forEach((pane) => {
        pane.classList.remove('active');
      });

      const targetPane = document.getElementById(targetTabId);
      if (targetPane) {
        targetPane.classList.add('active');
      }

      // Trigger lazy load
      if (targetTabId === 'tab-dashboard') stats.loadOverview();
      if (targetTabId === 'tab-books') books.loadBooks();
      if (targetTabId === 'tab-borrowings') borrowings.loadBorrowings();
      if (targetTabId === 'tab-members') members.loadMembers();

      // Close mobile drawer if open
      closeMobileSidebar();
    });
  });

  // 4. Xử lý Mobile Sidebar Drawer
  const mobileToggleBtn = document.getElementById('mobile-menu-toggle');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');

  function openMobileSidebar() {
    if (sidebar) sidebar.classList.add('open');
    if (overlay) overlay.classList.add('active');
  }

  function closeMobileSidebar() {
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('active');
  }

  if (mobileToggleBtn) {
    mobileToggleBtn.addEventListener('click', openMobileSidebar);
  }

  if (overlay) {
    overlay.addEventListener('click', closeMobileSidebar);
  }

  // 5. Global Modal Buttons Trigger
  document.querySelectorAll('[data-open-modal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const modalId = btn.getAttribute('data-open-modal');
      ui.openModal(modalId);
    });
  });

  document.querySelectorAll('[data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const modalId = btn.getAttribute('data-close-modal');
      ui.closeModal(modalId);
    });
  });

  // Đóng modal khi bấm ra ngoài backdrop
  document.querySelectorAll('.modal-backdrop').forEach((backdrop) => {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        backdrop.classList.remove('active');
      }
    });
  });
});
