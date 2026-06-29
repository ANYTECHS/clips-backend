import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import * as PDFDocument from 'pdfkit';

export interface PayoutReceiptData {
  payoutId: number;
  amount: number;
  currency: string;
  method: string;
  transactionId: string;
  onChainTxHash: string | null;
  confirmedAt: Date;
  recipientEmail: string;
  walletAddress: string;
}

@Injectable()
export class PayoutReceiptService {
  private readonly logger = new Logger(PayoutReceiptService.name);
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

  async generateAndSendReceipt(data: PayoutReceiptData): Promise<void> {
    try {
      const pdfBuffer = await this.generatePdf(data);

      await this.transporter.sendMail({
        from: process.env.SMTP_FROM || '"Clips App" <noreply@clips.app>',
        to: data.recipientEmail,
        subject: `Payout Receipt — #${data.payoutId}`,
        text: this.buildPlainText(data),
        html: this.buildHtml(data),
        attachments: [
          {
            filename: `payout-receipt-${data.payoutId}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf',
          },
        ],
      });

      this.logger.log(
        `Payout receipt sent for payout ${data.payoutId} to ${data.recipientEmail}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send payout receipt for payout ${data.payoutId}: ${error.message}`,
      );
    }
  }

  private generatePdf(data: PayoutReceiptData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      doc.fontSize(20).text('Payout Receipt', { align: 'center' });
      doc.moveDown();
      doc.fontSize(10).text('Clips App', { align: 'center' });
      doc.moveDown(2);

      // Receipt details
      doc.fontSize(12);

      const details: [string, string][] = [
        ['Payout Reference', `#${data.payoutId}`],
        ['Amount', `${data.amount} ${data.currency}`],
        ['Method', data.method],
        ['Status', 'Completed'],
        ['Date', data.confirmedAt.toISOString()],
        ['Wallet', this.maskWallet(data.walletAddress)],
        ['Transaction ID', data.transactionId],
      ];

      if (data.onChainTxHash) {
        details.push(['On-Chain Hash', data.onChainTxHash]);
      }

      for (const [label, value] of details) {
        doc.font('Helvetica-Bold').text(`${label}: `, { continued: true });
        doc.font('Helvetica').text(value);
        doc.moveDown(0.5);
      }

      doc.moveDown(2);
      doc
        .fontSize(9)
        .fillColor('#888888')
        .text(
          'This receipt was automatically generated. Please keep it for your records.',
          { align: 'center' },
        );

      doc.end();
    });
  }

  private maskWallet(address: string): string {
    if (address.length <= 10) return address;
    return `${address.slice(0, 4)}...${address.slice(-6)}`;
  }

  private buildPlainText(data: PayoutReceiptData): string {
    return [
      `Payout Receipt — #${data.payoutId}`,
      '',
      `Amount: ${data.amount} ${data.currency}`,
      `Method: ${data.method}`,
      `Status: Completed`,
      `Date: ${data.confirmedAt.toISOString()}`,
      `Wallet: ${this.maskWallet(data.walletAddress)}`,
      `Transaction ID: ${data.transactionId}`,
      data.onChainTxHash ? `On-Chain Hash: ${data.onChainTxHash}` : '',
      '',
      'A PDF receipt is attached to this email.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private buildHtml(data: PayoutReceiptData): string {
    return `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <h2 style="text-align:center;color:#6366f1;">Payout Receipt</h2>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:8px;font-weight:bold;">Reference</td><td style="padding:8px;">#${data.payoutId}</td></tr>
          <tr><td style="padding:8px;font-weight:bold;">Amount</td><td style="padding:8px;">${data.amount} ${data.currency}</td></tr>
          <tr><td style="padding:8px;font-weight:bold;">Method</td><td style="padding:8px;">${data.method}</td></tr>
          <tr><td style="padding:8px;font-weight:bold;">Status</td><td style="padding:8px;">Completed</td></tr>
          <tr><td style="padding:8px;font-weight:bold;">Date</td><td style="padding:8px;">${data.confirmedAt.toISOString()}</td></tr>
          <tr><td style="padding:8px;font-weight:bold;">Wallet</td><td style="padding:8px;">${this.maskWallet(data.walletAddress)}</td></tr>
          <tr><td style="padding:8px;font-weight:bold;">Transaction ID</td><td style="padding:8px;">${data.transactionId}</td></tr>
          ${data.onChainTxHash ? `<tr><td style="padding:8px;font-weight:bold;">On-Chain Hash</td><td style="padding:8px;">${data.onChainTxHash}</td></tr>` : ''}
        </table>
        <p style="color:#888;font-size:12px;text-align:center;margin-top:24px;">A PDF receipt is attached to this email.</p>
      </div>
    `;
  }
}
