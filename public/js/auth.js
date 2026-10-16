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

    // Clear error alert on input
    const idInput = document.getElementById('login-identifier');
    const passInput = document.getElementById('login-password');
    const errorAlert = document.getElementById('login-error-alert');

    const clearError = () => {
      if (errorAlert) errorAlert.style.display = 'none';
      idInput?.classList.remove('is-invalid');
      passInput?.classList.remove('is-invalid');
    };

    idInput?.addEventListener('input', clearError);
    passInput?.addEventListener('input', clearError);

    // Quick Fill Button for master admin (.env: ADMIN_USERNAME / ADMIN_PASSWORD)
    const quickFillBtn = document.getElementById('quick-fill-admin');
    if (quickFillBtn) {
      quickFillBtn.addEventListener('click', () => {
        clearError();
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
        clearError();
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
    const errorAlert = document.getElementById('login-error-alert');
    const errorText = document.getElementById('login-error-text');
    const authCard = document.querySelector('.auth-card');

    // Reset previous error state
    if (errorAlert) errorAlert.style.display = 'none';
    idInput?.classList.remove('is-invalid');
    passInput?.classList.remove('is-invalid');

    const identifier = idInput?.value.trim();
    const password = passInput?.value;

    if (!identifier || !password) {
      const msg = 'Vui lòng nhập đầy đủ tài khoản và mật khẩu';
      ui.toast(msg, 'error');
      if (errorAlert && errorText) {
        errorText.textContent = msg;
        errorAlert.style.display = 'flex';
      }
      if (!identifier) idInput?.classList.add('is-invalid');
      if (!password) passInput?.classList.add('is-invalid');
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
      const errorMsg = err.message || 'Tài khoản hoặc mật khẩu không chính xác';
      
      // Trigger Toast notification at top-right
      ui.toast(errorMsg, 'error');

      // Show inline error alert in auth card
      if (errorAlert && errorText) {
        errorText.textContent = errorMsg;
        errorAlert.style.display = 'flex';
      }

      // Highlight input and focus
      idInput?.classList.add('is-invalid');
      passInput?.classList.add('is-invalid');
      passInput?.focus();

      // Trigger haptic/visual shake animation
      if (authCard) {
        authCard.classList.remove('shake');
        void authCard.offsetWidth; // Force DOM reflow to re-trigger CSS animation
        authCard.classList.add('shake');
      }
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
