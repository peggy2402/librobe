import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    const baseUrl = (process.env.APP_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
    const resetUrl = `${baseUrl}/admin?resetToken=${encodeURIComponent(token)}`;
    const provider = process.env.MAIL_PROVIDER || (process.env.NODE_ENV === 'production' ? 'resend' : 'console');

    if (provider === 'console') {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('Không cho phép dùng MAIL_PROVIDER=console ở production');
      }
      this.logger.log(`[password-reset] ${email}: ${resetUrl}`);
      return;
    }

    if (provider !== 'resend' || !process.env.RESEND_API_KEY || !process.env.MAIL_FROM) {
      throw new Error('Mail provider chưa được cấu hình đầy đủ');
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.MAIL_FROM,
        to: [email],
        subject: 'Đặt lại mật khẩu Librobe',
        html: `<p>Bạn vừa yêu cầu đặt lại mật khẩu Librobe.</p><p><a href="${resetUrl}">Đặt lại mật khẩu</a></p><p>Liên kết có hiệu lực trong ${process.env.RESET_TOKEN_TTL_MINUTES || '20'} phút và chỉ dùng được một lần.</p>`,
      }),
    });

    if (!response.ok) {
      throw new Error(`Gửi email thất bại (${response.status})`);
    }
  }
}
