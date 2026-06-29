import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { buildCsvRow } from './earnings-csv.util';

export const TAX_REPORT_CSV_HEADERS = [
  'recordType',
  'date',
  'description',
  'amount',
  'currency',
  'status',
  'transactionId',
] as const;

export interface TaxReportExportResult {
  filename: string;
  content: string;
  year: number;
  totalEarnings: number;
  totalPayouts: number;
}

@Injectable()
export class TaxReportExportService {
  private readonly logger = new Logger(TaxReportExportService.name);

  constructor(private prisma: PrismaService) {}

  async exportTaxReportCsv(
    userId: number,
    year: number,
  ): Promise<TaxReportExportResult> {
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      throw new BadRequestException('year must be a valid four-digit calendar year');
    }

    const startDate = new Date(Date.UTC(year, 0, 1));
    const endDate = new Date(Date.UTC(year + 1, 0, 1));

    const earnings = await this.prisma.earning.findMany({
      where: {
        clip: { video: { userId } },
        deletedAt: null,
        date: { gte: startDate, lt: endDate },
      },
      select: {
        date: true,
        amount: true,
        currency: true,
        source: true,
        clip: { select: { title: true } },
      },
      orderBy: { date: 'asc' },
    });

    const payouts = await this.prisma.payout.findMany({
      where: {
        userId,
        createdAt: { gte: startDate, lt: endDate },
      },
      select: {
        createdAt: true,
        amount: true,
        currency: true,
        status: true,
        transactionId: true,
        onChainTxHash: true,
        method: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const rows: (string | number | null | undefined)[][] = [
      ...earnings.map((earning) => [
        'earning',
        earning.date.toISOString(),
        earning.clip?.title ?? earning.source ?? 'Earning',
        earning.amount,
        earning.currency,
        'recorded',
        '',
      ]),
      ...payouts.map((payout) => [
        'payout',
        payout.createdAt.toISOString(),
        `Payout via ${payout.method}`,
        payout.amount,
        payout.currency,
        payout.status,
        payout.onChainTxHash ?? payout.transactionId ?? '',
      ]),
    ];

    const header = buildCsvRow([...TAX_REPORT_CSV_HEADERS]);
    const body = rows.map((row) => buildCsvRow(row)).join('\n');
    const content = body.length > 0 ? `${header}\n${body}` : `${header}\n`;

    const totalEarnings = earnings.reduce((sum, row) => sum + row.amount, 0);
    const totalPayouts = payouts.reduce((sum, row) => sum + row.amount, 0);

    this.logger.log(
      `Exported tax report for user ${userId}, year ${year}: ${earnings.length} earnings, ${payouts.length} payouts`,
    );

    return {
      filename: `tax-report-${year}.csv`,
      content,
      year,
      totalEarnings,
      totalPayouts,
    };
  }
}
