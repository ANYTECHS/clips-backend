import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { buildCsvRow } from '../earnings/earnings-csv.util';

// pdfkit CJS default export — same pattern as payout-receipt.service
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit');

export type PayoutExportFormat = 'csv' | 'pdf';

export interface PayoutExportOptions {
  format: PayoutExportFormat;
  startDate?: string;
  endDate?: string;
}

export interface PayoutExportRow {
  id: number;
  amount: number;
  currency: string;
  method: string;
  status: string;
  transactionId: string | null;
  feeAmount: number | null;
  finalAmount: number | null;
  createdAt: Date;
  paidAt: Date | null;
}

export interface PayoutExportResult {
  filename: string;
  contentType: string;
  body: Buffer;
}

const PAYOUT_EXPORT_HEADERS = [
  'id',
  'date',
  'status',
  'amount',
  'currency',
  'method',
  'fee',
  'netAmount',
  'transactionId',
] as const;

@Injectable()
export class PayoutExportService {
  private readonly logger = new Logger(PayoutExportService.name);

  constructor(private readonly prisma: PrismaService) {}

  async exportPayouts(
    userId: number,
    options: PayoutExportOptions,
  ): Promise<PayoutExportResult> {
    const format = options.format?.toLowerCase() as PayoutExportFormat;
    if (format !== 'csv' && format !== 'pdf') {
      throw new BadRequestException(
        `Invalid export format "${options.format}". Supported formats: csv, pdf`,
      );
    }

    const rows = await this.getPayoutsForExport(userId, options);
    const stamp = new Date().toISOString().slice(0, 10);

    if (format === 'csv') {
      const csv = this.toCsv(rows);
      return {
        filename: `payouts-${stamp}.csv`,
        contentType: 'text/csv; charset=utf-8',
        body: Buffer.from(csv, 'utf-8'),
      };
    }

    const pdf = await this.toPdf(rows);
    return {
      filename: `payouts-${stamp}.pdf`,
      contentType: 'application/pdf',
      body: pdf,
    };
  }

  async getPayoutsForExport(
    userId: number,
    options: Pick<PayoutExportOptions, 'startDate' | 'endDate'> = {},
  ): Promise<PayoutExportRow[]> {
    const dateFilter: { gte?: Date; lte?: Date } = {};

    if (options.startDate) {
      const start = new Date(options.startDate);
      if (Number.isNaN(start.getTime())) {
        throw new BadRequestException('Invalid startDate');
      }
      dateFilter.gte = start;
    }

    if (options.endDate) {
      const end = new Date(options.endDate);
      if (Number.isNaN(end.getTime())) {
        throw new BadRequestException('Invalid endDate');
      }
      end.setHours(23, 59, 59, 999);
      dateFilter.lte = end;
    }

    const rows = await this.prisma.payout.findMany({
      where: {
        userId,
        deletedAt: null,
        ...(Object.keys(dateFilter).length > 0
          ? { createdAt: dateFilter }
          : {}),
      },
      select: {
        id: true,
        amount: true,
        currency: true,
        method: true,
        status: true,
        transactionId: true,
        feeAmount: true,
        finalAmount: true,
        createdAt: true,
        paidAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    this.logger.log(
      `Exported ${rows.length} payouts for user ${userId}`,
    );

    return rows;
  }

  toCsv(rows: PayoutExportRow[]): string {
    const header = buildCsvRow([...PAYOUT_EXPORT_HEADERS]);
    const body = rows.map((r) =>
      buildCsvRow([
        r.id,
        r.createdAt.toISOString(),
        r.status,
        r.amount,
        r.currency,
        r.method,
        r.feeAmount ?? '',
        r.finalAmount ?? '',
        r.transactionId ?? '',
      ]),
    );
    return body.length > 0 ? `${header}\n${body.join('\n')}\n` : `${header}\n`;
  }

  toPdf(rows: PayoutExportRow[]): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(18).text('Payout History', { align: 'center' });
      doc.moveDown(0.5);
      doc
        .fontSize(10)
        .fillColor('#555555')
        .text(`Generated ${new Date().toISOString()}`, { align: 'center' });
      doc.moveDown(1.5);
      doc.fillColor('#000000');

      if (rows.length === 0) {
        doc.fontSize(12).text('No payouts found for the selected filters.');
        doc.end();
        return;
      }

      for (const row of rows) {
        doc.fontSize(11).font('Helvetica-Bold').text(`Payout #${row.id}`);
        doc.font('Helvetica').fontSize(10);
        doc.text(`Date: ${row.createdAt.toISOString()}`);
        doc.text(`Status: ${row.status}`);
        doc.text(`Amount: ${row.amount} ${row.currency}`);
        doc.text(`Method: ${row.method}`);
        if (row.feeAmount != null) {
          doc.text(`Fee: ${row.feeAmount} ${row.currency}`);
        }
        if (row.finalAmount != null) {
          doc.text(`Net: ${row.finalAmount} ${row.currency}`);
        }
        if (row.transactionId) {
          doc.text(`Transaction ID: ${row.transactionId}`);
        }
        doc.moveDown(0.8);
      }

      doc.end();
    });
  }
}
