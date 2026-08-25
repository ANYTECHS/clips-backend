import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import * as PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service';

export interface PayoutReceiptData {
  payoutId: number;
  amount: number;
  currency: string;
  method: string;
  feeAmount?: number;
  feePercentage?: number;
  finalAmount?: number;
  transactionId: string;
  onChainTxHash: string | null;
  confirmedAt: Date;
  recipientEmail: string;
  walletAddress: string;
  paidAt?: Date;
  status?: string;
}

export interface ReceiptResponse {
  id: number;
  receiptId: string;
  payoutId: number;
  emailSent: boolean;
  emailSentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class PayoutReceiptService {
  private readonly logger = new Logger(PayoutReceiptService.name);
  private transporter: nodemailer.Transporter;

  constructor(private prisma: PrismaService) {
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

  /**
   * Generate a unique receipt ID
   */
  private generateReceiptId(): string {
    return `RCP-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
  }

  /**
   * Generate receipt, store metadata, and send email
   */
  async generateAndSendReceipt(data: PayoutReceiptData): Promise<ReceiptResponse> {
    const receiptId = this.generateReceiptId();

    try {
      // Generate PDF
      const pdfBuffer = await this.generatePdf(data);

      // Create receipt metadata in database
      const receipt = await this.prisma.payoutReceipt.create({
        data: {
          payoutId: data.payoutId,
          receiptId,
          emailSent: false,
        },
      });

      this.logger.log(
        `Created receipt metadata: ${receiptId} for payout ${data.payoutId}`,
      );

      // Send email with PDF
      try {
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

        // Update receipt with email sent status
        const updatedReceipt = await this.prisma.payoutReceipt.update({
          where: { id: receipt.id },
          data: {
            emailSent: true,
            emailSentAt: new Date(),
          },
        });

        this.logger.log(
          `Payout receipt ${receiptId} sent for payout ${data.payoutId} to ${data.recipientEmail}`,
        );

        return updatedReceipt;
      } catch (emailError) {
        this.logger.error(
          `Failed to send payout receipt email for payout ${data.payoutId}: ${emailError instanceof Error ? emailError.message : String(emailError)}`,
        );
        // Return receipt even if email fails - receipt generation succeeded
        return receipt;
      }
    } catch (error) {
      this.logger.error(
        `Failed to generate payout receipt for payout ${data.payoutId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Retrieve receipt by payout ID
   */
  async getReceiptByPayoutId(payoutId: number): Promise<ReceiptResponse> {
    const receipt = await this.prisma.payoutReceipt.findUnique({
      where: { payoutId },
    });

    if (!receipt) {
      throw new NotFoundException(
        `Receipt not found for payout ${payoutId}`,
      );
    }

    return receipt;
  }

  /**
   * Retrieve receipt by receipt ID
   */
  async getReceiptById(receiptId: string): Promise<ReceiptResponse> {
    const receipt = await this.prisma.payoutReceipt.findUnique({
      where: { receiptId },
    });

    if (!receipt) {
      throw new NotFoundException(`Receipt ${receiptId} not found`);
    }

    return receipt;
  }

  /**
   * Get receipt PDF buffer
   */
  async getReceiptPdf(payoutId: number, data: PayoutReceiptData): Promise<Buffer> {
    // Verify receipt exists
    await this.getReceiptByPayoutId(payoutId);

    // Generate PDF on-demand
    return this.generatePdf(data);
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
        ['Payout ID', `#${data.payoutId}`],
        ['Amount', `${data.amount} ${data.currency}`],
      ];

      // Add fee information if available
      if (data.feeAmount !== undefined && data.feePercentage !== undefined) {
        details.push(['Fee', `${data.feeAmount} ${data.currency} (${data.feePercentage}%)`]);
      }

      // Add net amount if available
      if (data.finalAmount !== undefined) {
        details.push(['Net Amount', `${data.finalAmount} ${data.currency}`]);
      }

      details.push(
        ['Payout Method', data.method],
        ['Status', data.status || 'Completed'],
        ['Date', data.confirmedAt ? data.confirmedAt.toISOString() : 'N/A'],
        ['Transaction ID', data.transactionId],
      );

      // Add on-chain hash if available (for Stellar payouts)
      if (data.onChainTxHash) {
        details.push(['On-Chain Hash', data.onChainTxHash]);
      }

      // Add wallet if available
      if (data.walletAddress) {
        details.push(['Wallet', this.maskWallet(data.walletAddress)]);
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
    const lines = [
      `Payout Receipt — #${data.payoutId}`,
      '',
      `Amount: ${data.amount} ${data.currency}`,
    ];

    if (data.feeAmount !== undefined && data.feePercentage !== undefined) {
      lines.push(`Fee: ${data.feeAmount} ${data.currency} (${data.feePercentage}%)`);
    }

    if (data.finalAmount !== undefined) {
      lines.push(`Net Amount: ${data.finalAmount} ${data.currency}`);
    }

    lines.push(
      `Payout Method: ${data.method}`,
      `Status: ${data.status || 'Completed'}`,
      `Date: ${data.confirmedAt ? data.confirmedAt.toISOString() : 'N/A'}`,
      `Transaction ID: ${data.transactionId}`,
    );

    if (data.onChainTxHash) {
      lines.push(`On-Chain Hash: ${data.onChainTxHash}`);
    }

    if (data.walletAddress) {
      lines.push(`Wallet: ${this.maskWallet(data.walletAddress)}`);
    }

    lines.push(
      '',
      'A PDF receipt is attached to this email.',
    );

    return lines.join('\n');
  }

  private buildHtml(data: PayoutReceiptData): string {
    const rows = `
      <tr><td style="padding:8px;font-weight:bold;">Payout ID</td><td style="padding:8px;">#${data.payoutId}</td></tr>
      <tr><td style="padding:8px;font-weight:bold;">Amount</td><td style="padding:8px;">${data.amount} ${data.currency}</td></tr>
      ${data.feeAmount !== undefined && data.feePercentage !== undefined ? `<tr><td style="padding:8px;font-weight:bold;">Fee</td><td style="padding:8px;">${data.feeAmount} ${data.currency} (${data.feePercentage}%)</td></tr>` : ''}
      ${data.finalAmount !== undefined ? `<tr><td style="padding:8px;font-weight:bold;">Net Amount</td><td style="padding:8px;">${data.finalAmount} ${data.currency}</td></tr>` : ''}
      <tr><td style="padding:8px;font-weight:bold;">Payout Method</td><td style="padding:8px;">${data.method}</td></tr>
      <tr><td style="padding:8px;font-weight:bold;">Status</td><td style="padding:8px;">${data.status || 'Completed'}</td></tr>
      <tr><td style="padding:8px;font-weight:bold;">Date</td><td style="padding:8px;">${data.confirmedAt ? data.confirmedAt.toISOString() : 'N/A'}</td></tr>
      <tr><td style="padding:8px;font-weight:bold;">Transaction ID</td><td style="padding:8px;">${data.transactionId}</td></tr>
      ${data.onChainTxHash ? `<tr><td style="padding:8px;font-weight:bold;">On-Chain Hash</td><td style="padding:8px;">${data.onChainTxHash}</td></tr>` : ''}
      ${data.walletAddress ? `<tr><td style="padding:8px;font-weight:bold;">Wallet</td><td style="padding:8px;">${this.maskWallet(data.walletAddress)}</td></tr>` : ''}
    `;

    return `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <h2 style="text-align:center;color:#6366f1;">Payout Receipt</h2>
        <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;">
          ${rows}
        </table>
        <p style="color:#888;font-size:12px;text-align:center;margin-top:24px;">A PDF receipt is attached to this email.</p>
      </div>
    `;
  }
}
