import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { EmailDeliveryJobData } from './email-delivery.queue';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.ethereal.email',
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  async sendTemplatedEmail(job: EmailDeliveryJobData): Promise<void> {
    const content = this.buildTemplate(job.template, job.context.token);
    const info = await this.transporter.sendMail({
      from: process.env.SMTP_FROM || '"Clips App" <noreply@clips.app>',
      to: job.to,
      subject: job.subject,
      text: content.text,
      html: content.html,
    });

    this.logger.log(
      `Email sent to ${job.to} (${job.template}) — messageId: ${info.messageId}`,
    );
  }

  async sendEmail(options: {
    to: string;
    subject: string;
    text?: string;
    html?: string;
  }): Promise<void> {
    const info = await this.transporter.sendMail({
      from: process.env.SMTP_FROM || '"Clips App" <noreply@clips.app>',
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    });

    this.logger.log(
      `Email sent to ${options.to} — messageId: ${info.messageId}`,
    );
  }

  async sendMagicLink(email: string, token: string): Promise<void> {
    await this.sendTemplatedEmail({
      to: email,
      subject: 'Your magic login link',
      template: 'magic-link',
      context: { token },
    });
  }

  async sendPasswordResetLink(email: string, token: string): Promise<void> {
    await this.sendTemplatedEmail({
      to: email,
      subject: 'Reset your password',
      template: 'password-reset',
      context: { token },
    });
  }

  async sendVerificationEmail(email: string, token: string): Promise<void> {
    await this.sendTemplatedEmail({
      to: email,
      subject: 'Verify your email address',
      template: 'verification',
      context: { token },
    });
  }

  private buildTemplate(template: EmailDeliveryJobData['template'], token: string) {
    const baseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';
    if (template === 'magic-link') {
      const link = `${baseUrl}/auth/verify-magic?token=${token}`;
      return {
        text: `Click the link below to log in (expires in 15 minutes):\n\n${link}`,
        html: `
        <p>Click the button below to log in. This link expires in <strong>15 minutes</strong>.</p>
        <a href="${link}" style="display:inline-block;padding:12px 24px;background:#6366f1;color:#fff;border-radius:6px;text-decoration:none;">Log in</a>
        <p>Or copy this URL: ${link}</p>
      `,
      };
    }

    if (template === 'password-reset') {
      const link = `${baseUrl}/reset-password?token=${token}`;
      return {
        text: `Click the link below to reset your password (expires in 1 hour):\n\n${link}`,
        html: `
        <p>Click the button below to reset your password. This link expires in <strong>1 hour</strong>.</p>
        <a href="${link}" style="display:inline-block;padding:12px 24px;background:#6366f1;color:#fff;border-radius:6px;text-decoration:none;">Reset password</a>
        <p>Or copy this URL: ${link}</p>
      `,
      };
    }

    const link = `${baseUrl}/auth/verify-email?token=${token}`;
    return {
      text: `Click the link below to verify your email address (expires in 24 hours):\n\n${link}`,
      html: `
        <p>Welcome to Clips App! Click the button below to verify your email address. This link expires in <strong>24 hours</strong>.</p>
        <a href="${link}" style="display:inline-block;padding:12px 24px;background:#6366f1;color:#fff;border-radius:6px;text-decoration:none;">Verify Email</a>
        <p>Or copy this URL: ${link}</p>
      `,
    };
  }
}
