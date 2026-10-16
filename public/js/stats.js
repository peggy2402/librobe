/**
 * Dashboard & Statistics Module
 */

const stats = {
  async loadOverview() {
    try {
      const data = await api.get('/api/stats');
      this.renderKPIs(data);
      this.renderTopBooks(data.topBorrowedBooks || []);
      this.renderOverdueLoans(data.recentOverdueLoans || []);
    } catch (err) {
      console.error('Lỗi tải thống kê:', err);
    }
  },

  renderKPIs(data) {
    const totalBooksEl = document.getElementById('stat-total-books');
    const borrowedBooksEl = document.getElementById('stat-borrowed-books');
    const activeMembersEl = document.getElementById('stat-active-members');
    const finesCollectedEl = document.getElementById('stat-fines-collected');

    if (totalBooksEl) totalBooksEl.textContent = Number(data.totalBooks || 0).toLocaleString();
    if (borrowedBooksEl) borrowedBooksEl.textContent = Number(data.borrowedBooks || 0).toLocaleString();
    if (activeMembersEl) activeMembersEl.textContent = Number(data.activeMembers || 0).toLocaleString();
    if (finesCollectedEl) finesCollectedEl.textContent = ui.formatCurrency(data.totalFinesCollected || 0);
  },

  renderTopBooks(list = []) {
    const tbody = document.getElementById('top-books-tbody');
    if (!tbody) return;

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 24px;">Chưa có dữ liệu mượn sách</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map((item, idx) => `
      <tr>
        <td style="font-weight: 600; color: var(--text-muted); width: 40px;">#${idx + 1}</td>
        <td>
          <div style="font-weight: 600; color: var(--text-primary);">${item.bookTitle}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted); font-family: monospace;">ISBN: ${item.isbn}</div>
        </td>
        <td><span class="badge badge-info">${item.borrowCount} lượt mượn</span></td>
        <td>
          ${item.copiesAvailable > 0 
            ? `<span class="badge badge-success">Còn ${item.copiesAvailable} cuốn</span>`
            : `<span class="badge badge-danger">Hết bản in</span>`}
        </td>
      </tr>
    `).join('');
  },

  renderOverdueLoans(list = []) {
    const tbody = document.getElementById('overdue-loans-tbody');
    if (!tbody) return;

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--color-success); padding: 24px;">Không có phiếu mượn nào bị quá hạn</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map((item) => `
      <tr>
        <td style="font-family: monospace; font-weight: 600; color: #f87171;">${item.transactionCode}</td>
        <td>
          <div style="font-weight: 600;">${item.bookTitle}</div>
        </td>
        <td>${item.memberName}</td>
        <td>
          <span class="badge badge-danger">Quá ${item.daysOverdue} ngày</span>
        </td>
        <td style="font-weight: 600; color: #f87171;">${ui.formatCurrency(item.fineAmount)}</td>
      </tr>
    `).join('');
  },
};

window.stats = stats;
