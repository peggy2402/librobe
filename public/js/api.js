/**
 * API Service Client for Librobe
 */
const API_BASE = window.location.origin;

const api = {
  getToken() {
    return localStorage.getItem('librobe_token') || '';
  },

  setToken(token) {
    if (token) {
      localStorage.setItem('librobe_token', token);
    } else {
      localStorage.removeItem('librobe_token');
    }
  },

  getCurrentUser() {
    const raw = localStorage.getItem('librobe_user');
    try {
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  setCurrentUser(user) {
    if (user) {
      localStorage.setItem('librobe_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('librobe_user');
    }
  },

  async request(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };

    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      if (response.status === 401 && !endpoint.includes('/auth/login')) {
        this.setToken(null);
        this.setCurrentUser(null);
        window.location.reload();
        throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      }

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorMsg = Array.isArray(data.message)
          ? data.message.join(', ')
          : data.message || `Lỗi yêu cầu máy chủ (${response.status})`;
        throw new Error(errorMsg);
      }

      return data;
    } catch (err) {
      console.error(`[API Error] ${endpoint}:`, err);
      throw err;
    }
  },

  get(endpoint, params = {}) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        query.append(k, v);
      }
    });
    const queryString = query.toString();
    const finalUrl = queryString ? `${endpoint}?${queryString}` : endpoint;
    return this.request(finalUrl, { method: 'GET' });
  },

  post(endpoint, body = {}) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  patch(endpoint, body = {}) {
    return this.request(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },

  delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  },
};

window.api = api;
