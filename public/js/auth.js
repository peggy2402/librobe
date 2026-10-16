/**
 * Authentication Module
 */

const auth = {
  init() {
    this.bindEvents();
    this.checkSession();
  },

  bindEvents() {
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
      loginForm.addEventListener('submit', (e) => this.handleLogin(e));
    }

    const logoutButtons = document.querySelectorAll('.btn-logout');
    logoutButtons.forEach((btn) => {
      btn.addEventListener('click', () => this.handleLogout());
    });

    // Quick Fill Button for master admin (.env: ADMIN_USERNAME / ADMIN_PASSWORD)
    const quickFillBtn = document.getElementById('quick-fill-admin');
    if (quickFillBtn) {
      quickFillBtn.addEventListener('click', () => {
        const idInput = document.getElementById('login-identifier');
        const passInput = document.getElementById('login-password');
        if (idInput && passInput) {
          idInput.value = 'chien';
          passInput.value = 'Chienhpt102$$';
          ui.toast('Đã điền thông tin Quản trị viên (.env)', 'info');
        }
      });
    }

    const quickFillDemoBtn = document.getElementById('quick-fill-demo');
    if (quickFillDemoBtn) {
      quickFillDemoBtn.addEventListener('click', () => {
        const idInput = document.getElementById('login-identifier');
        const passInput = document.getElementById('login-password');
        if (idInput && passInput) {
          idInput.value = 'admin@librobe.com';
          passInput.value = 'Admin@123';
          ui.toast('Đã điền tài khoản mẫu Database', 'info');
        }
      });
    }
  },

  async checkSession() {
    const token = api.getToken();
    const authWrapper = document.getElementById('auth-wrapper');
    const appLayout = document.getElementById('app-layout');

    if (!token) {
      if (authWrapper) authWrapper.style.display = 'flex';
      if (appLayout) appLayout.style.display = 'none';
      return;
    }

    try {
      const res = await api.get('/api/auth/me');
      api.setCurrentUser(res.user);
      this.updateUserUI(res.user);

      if (authWrapper) authWrapper.style.display = 'none';
      if (appLayout) appLayout.style.display = 'flex';

      // Load initial dashboard data
      if (window.stats) window.stats.loadOverview();
      if (window.books) window.books.loadBooks();
    } catch {
      api.setToken(null);
      api.setCurrentUser(null);
      if (authWrapper) authWrapper.style.display = 'flex';
      if (appLayout) appLayout.style.display = 'none';
    }
  },

  async handleLogin(e) {
    e.preventDefault();
    const idInput = document.getElementById('login-identifier');
    const passInput = document.getElementById('login-password');
    const submitBtn = document.getElementById('login-submit-btn');

    const identifier = idInput?.value.trim();
    const password = passInput?.value;

    if (!identifier || !password) {
      ui.toast('Vui lòng nhập tài khoản và mật khẩu', 'error');
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerText = 'Đang xác thực...';
    }

    try {
      const res = await api.post('/api/auth/login', {
        identifier,
        password,
      });

      api.setToken(res.accessToken);
      api.setCurrentUser(res.user);
      this.updateUserUI(res.user);

      ui.toast(`Xin chào, ${res.user.fullName || 'Quản trị viên'}!`, 'success');

      const authWrapper = document.getElementById('auth-wrapper');
      const appLayout = document.getElementById('app-layout');
      if (authWrapper) authWrapper.style.display = 'none';
      if (appLayout) appLayout.style.display = 'flex';

      // Trigger data loads
      if (window.stats) window.stats.loadOverview();
      if (window.books) window.books.loadBooks();
    } catch (err) {
      ui.toast(err.message || 'Đăng nhập không thành công', 'error');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerText = 'Đăng Nhập Quản Trị';
      }
    }
  },

  handleLogout() {
    api.setToken(null);
    api.setCurrentUser(null);
    ui.toast('Đã đăng xuất thành công', 'info');
    setTimeout(() => {
      window.location.reload();
    }, 400);
  },

  updateUserUI(user) {
    if (!user) return;
    const nameEls = document.querySelectorAll('.current-user-name');
    nameEls.forEach((el) => {
      el.textContent = user.fullName || user.email;
    });

    const roleEls = document.querySelectorAll('.current-user-role');
    roleEls.forEach((el) => {
      el.textContent = user.role === 'ADMIN' ? 'Quản Trị Viên Cấp Cao' : 'Thủ Thư';
    });

    const avatarEls = document.querySelectorAll('.current-user-avatar');
    avatarEls.forEach((el) => {
      const letter = (user.fullName || user.email || 'A')[0].toUpperCase();
      el.textContent = letter;
    });
  },
};

window.auth = auth;
