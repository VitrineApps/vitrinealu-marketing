import nodemailer from 'nodemailer';
import { config } from './config.js';
import { logger } from './logger.js';

// Email transport types
type EmailTransport = 'smtp' | 'sendgrid';

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export class MailerService {
  private transporter: nodemailer.Transporter;
  private transportType: EmailTransport;

  constructor() {
    this.transportType = this.detectTransportType();
    this.transporter = this.createTransporter();
  }

  private detectTransportType(): EmailTransport {
    // Check for SendGrid first, then SMTP
    if (config.config.SENDGRID_API_KEY) {
      return 'sendgrid';
    }

    if (config.config.SMTP_HOST && config.config.SMTP_USER && config.config.SMTP_PASS) {
      return 'smtp';
    }

    throw new Error('No email transport configured. Please set SENDGRID_API_KEY or SMTP_* environment variables.');
  }

  private createTransporter(): nodemailer.Transporter {
    if (this.transportType === 'sendgrid') {
      // SendGrid transport
      return nodemailer.createTransport({
        host: 'smtp.sendgrid.net',
        port: 587,
        secure: false,
        auth: {
          user: 'apikey',
          pass: config.config.SENDGRID_API_KEY
        }
      });
    } else {
      // SMTP transport
      return nodemailer.createTransport({
        host: config.config.SMTP_HOST,
        port: config.config.SMTP_PORT,
        secure: config.config.SMTP_PORT === 465, // Use TLS for port 465
        auth: {
          user: config.config.SMTP_USER,
          pass: config.config.SMTP_PASS
        }
      });
    }
  }

  async sendEmail(options: EmailOptions): Promise<void> {
    try {
      const mailOptions = {
        from: config.config.OWNER_EMAIL,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text || this.htmlToText(options.html)
      };

      const info = await this.transporter.sendMail(mailOptions);
      logger.info(`Email sent successfully: ${info.messageId}`);

    } catch (error) {
      logger.error('Failed to send email:', error);
      throw new Error(`Email sending failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async sendDigest(to: string, subject: string, htmlContent: string): Promise<void> {
    await this.sendEmail({
      to,
      subject: subject || 'Social Media Content Digest',
      html: htmlContent
    });
  }

  // Simple HTML to text conversion
  private htmlToText(html: string): string {
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
  }

  // Test email configuration
  async testConnection(): Promise<boolean> {
    try {
      await this.transporter.verify();
      logger.info('Email transport connection successful');
      return true;
    } catch (error) {
      logger.error('Email transport connection failed:', error);
      return false;
    }
  }

  getTransportType(): EmailTransport {
    return this.transportType;
  }
}

// Singleton instance
export const mailer = new MailerService();