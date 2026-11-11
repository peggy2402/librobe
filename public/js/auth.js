/**
 * Authentication Module
 */

const auth = {
  init() {
    this.bindEvents();
    this.resetToken = new URLSearchParams(window.location.search).get('resetToken');
    this.checkSession();
  },

  bindEvents() {
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
      loginForm.addEventListener('submit', (e) => this.handleLogin(e));
    }

    document.getElementById('show-forgot-password')?.addEventListener('click', () => this.showAuthForm('forgot'));
    document.getElementById('back-to-login-from-forgot')?.addEventListener('click', () => this.showAuthForm('login'));
    document.getElementById('back-to-login-from-reset')?.addEventListener('click', () => this.cancelResetFlow());
    document.getElementById('forgot-password-form')?.addEventListener('submit', (e) => this.handleForgotPassword(e));
    document.getElementById('reset-password-form')?.addEventListener('submit', (e) => this.handleResetPassword(e));

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

    if (this.resetToken) {
      if (authWrapper) authWrapper.style.display = 'flex';
      if (appLayout) appLayout.style.display = 'none';
      this.showAuthForm('reset');
      return;
    }

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

  showAuthForm(formName) {
    const forms = {
      login: document.getElementById('login-form'),
      forgot: document.getElementById('forgot-password-form'),
      reset: document.getElementById('reset-password-form'),
    };
    Object.entries(forms).forEach(([name, form]) => {
      if (form) form.style.display = name === formName ? 'flex' : 'none';
    });
    document.getElementById('login-error-alert')?.style.setProperty('display', 'none');
    if (formName === 'forgot') document.getElementById('forgot-email')?.focus();
    if (formName === 'reset') document.getElementById('reset-password')?.focus();
  },

  cancelResetFlow() {
    this.resetToken = null;
    window.history.replaceState({}, document.title, window.location.pathname);
    this.showAuthForm('login');
  },

  async handleForgotPassword(e) {
    e.preventDefault();
    const emailInput = document.getElementById('forgot-email');
    const submitBtn = document.getElementById('forgot-submit-btn');
    const email = emailInput?.value.trim().toLowerCase();
    if (!email) {
      emailInput?.classList.add('is-invalid');
      ui.toast('Vui lòng nhập email tài khoản', 'error');
      return;
    }
    emailInput?.classList.remove('is-invalid');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerText = 'Đang gửi...';
    }
    try {
      await api.post('/api/auth/forgot-password', { email });
      ui.toast('Nếu email tồn tại, hướng dẫn đặt lại mật khẩu đã được gửi.', 'success');
      document.getElementById('forgot-password-form')?.reset();
    } catch {
      // Keep the same user-facing response for account enumeration protection.
      ui.toast('Nếu email tồn tại, hướng dẫn đặt lại mật khẩu đã được gửi.', 'success');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerText = 'Gửi liên kết đặt lại';
      }
    }
  },

  async handleResetPassword(e) {
    e.preventDefault();
    const passwordInput = document.getElementById('reset-password');
    const confirmInput = document.getElementById('reset-password-confirm');
    const errorEl = document.getElementById('reset-password-error');
    const submitBtn = document.getElementById('reset-submit-btn');
    const password = passwordInput?.value || '';
    const confirmation = confirmInput?.value || '';
    const showError = (message) => {
      if (errorEl) {
        errorEl.textContent = message;
        errorEl.style.display = 'block';
      }
      ui.toast(message, 'error');
    };
    if (errorEl) errorEl.style.display = 'none';
    passwordInput?.classList.remove('is-invalid');
    confirmInput?.classList.remove('is-invalid');
    if (password.length < 6 || password.length > 50) {
      passwordInput?.classList.add('is-invalid');
      showError('Mật khẩu phải có từ 6 đến 50 ký tự');
      return;
    }
    if (password !== confirmation) {
      confirmInput?.classList.add('is-invalid');
      showError('Mật khẩu xác nhận không khớp');
      return;
    }
    if (!this.resetToken) {
      showError('Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn');
      return;
    }
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerText = 'Đang cập nhật...';
    }
    try {
      await api.post('/api/auth/reset-password', { token: this.resetToken, newPassword: password });
      api.setToken(null);
      api.setCurrentUser(null);
      this.resetToken = null;
      window.history.replaceState({}, document.title, window.location.pathname);
      document.getElementById('reset-password-form')?.reset();
      this.showAuthForm('login');
      ui.toast('Mật khẩu đã được đặt lại. Vui lòng đăng nhập lại.', 'success');
    } catch (err) {
      showError(err.message || 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerText = 'Đặt lại mật khẩu';
      }
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

    // Hiển thị đúng cả ba vai trò. Trước đây dùng
    // `user.role === 'ADMIN' ? '...' : 'Thủ Thư'` nên tài khoản MEMBER đăng nhập
    // vào trang quản trị bị gán nhãn sai là "Thủ Thư".
    const ROLE_TEXT = {
      ADMIN: 'Quản Trị Viên Cấp Cao',
      LIBRARIAN: 'Thủ Thư',
      MEMBER: 'Độc Giả',
    };
    const roleEls = document.querySelectorAll('.current-user-role');
    roleEls.forEach((el) => {
      el.textContent = ROLE_TEXT[user.role] || user.role || 'Không xác định';
    });

    const avatarEls = document.querySelectorAll('.current-user-avatar');
    avatarEls.forEach((el) => {
      const letter = (user.fullName || user.email || 'A')[0].toUpperCase();
      el.textContent = letter;
    });

    this.applyRoleVisibility(user.role);
  },

  /**
   * Ẩn các phần tử mà vai trò hiện tại không có quyền dùng, để người dùng không
   * bấm vào rồi nhận lỗi 403. Đây chỉ là lớp trải nghiệm — chốt chặn thật sự
   * nằm ở RolesGuard phía backend.
   *
   * Dùng bằng cách thêm `data-require-role="ADMIN"` hoặc
   * `data-require-role="ADMIN,LIBRARIAN"` vào phần tử trong HTML.
   */
  applyRoleVisibility(role) {
    document.querySelectorAll('[data-require-role]').forEach((el) => {
      const allowed = (el.getAttribute('data-require-role') || '')
        .split(',')
        .map((r) => r.trim().toUpperCase())
        .filter(Boolean);

      const permitted = allowed.length === 0 || allowed.includes(String(role).toUpperCase());
      el.style.display = permitted ? '' : 'none';

      // Nếu đang mở tab bị ẩn thì chuyển về Bảng Thống Kê
      if (!permitted && el.classList.contains('nav-link') && el.classList.contains('active')) {
        const fallback = document.querySelector('.nav-link[data-tab="tab-dashboard"]');
        if (fallback) fallback.click();
      }
    });
  },
};

window.auth = auth;
