import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface ExportOptions {
  startDate?: string; // ISO 8601 date string
  endDate?: string;   // ISO 8601 date string
  currency?: string;
}

export interface EarningsExportRow {
  id: number;
  clipId: number;
  amount: number;
  currency: string;
  source: string;
  date: Date;
import { buildEarningsCsv } from './earnings-csv.util';

export interface EarningsExportOptions {
  startDate?: string;
  endDate?: string;
}

export interface EarningsExportResult {
  filename: string;
  content: string;
}

@Injectable()
export class EarningsExportService {
  private readonly logger = new Logger(EarningsExportService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Fetches earnings rows for export with optional date range filtering.
   * The date filter is typed explicitly to avoid the TS18046 "unknown" error.
   */
  async getEarningsForExport(
    userId: number,
    options: ExportOptions = {},
  ): Promise<EarningsExportRow[]> {
    const dateFilter: { gte?: Date; lte?: Date } = {};

    if (options.startDate) {
      dateFilter.gte = new Date(options.startDate);
    }

    if (options.endDate) {
      const end = new Date(options.endDate);
      end.setHours(23, 59, 59, 999);
      dateFilter.lte = end;
    }

    const rows = await this.prisma.earning.findMany({
      where: {
        clip: { video: { userId } },
        deletedAt: null,
        ...(Object.keys(dateFilter).length > 0 ? { date: dateFilter } : {}),
      },
      select: {
        id: true,
        clipId: true,
        amount: true,
        currency: true,
        source: true,
        date: true,
      },
      orderBy: { date: 'asc' },
    });

    return rows.map((r) => ({
      id: r.id,
      clipId: r.clipId,
      amount: r.amount,
      currency: r.currency,
      source: r.source ?? '',
      date: r.date,
    }));
  }

  /**
   * Converts earnings rows to a CSV string.
   */
  toCsv(rows: EarningsExportRow[]): string {
    const header = 'id,clipId,amount,currency,source,date';
    const lines = rows.map(
      (r) =>
        `${r.id},${r.clipId},${r.amount},${r.currency},${r.source},${r.date.toISOString()}`,
    );
    return [header, ...lines].join('\n');
  constructor(private prisma: PrismaService) {}

  private userEarningsWhere(userId: number): Record<string, unknown> {
    return {
      clip: { video: { userId } },
      deletedAt: null,
    };
  }

  async exportEarningsCsv(
    userId: number,
    options: EarningsExportOptions,
  ): Promise<EarningsExportResult> {
    let where: Record<string, unknown> = this.userEarningsWhere(userId);
    if (options.startDate || options.endDate) {
      const dateFilter: Record<string, Date> = {};
      if (options.startDate) {
        dateFilter.gte = new Date(options.startDate);
      }
      if (options.endDate) {
        const end = new Date(options.endDate);
        end.setUTCHours(23, 59, 59, 999);
        dateFilter.lte = end;
      }
      where = { ...where, date: dateFilter };
    }

    const earnings = await this.prisma.earning.findMany({
      where,
      select: {
        date: true,
        amount: true,
        currency: true,
        source: true,
        clip: { select: { title: true } },
      },
      orderBy: { date: 'desc' },
    });

    const rows = earnings.map((e) => [
      e.date.toISOString(),
      e.clip?.title,
      e.amount,
      e.currency,
      e.source,
      '',
    ]);

    const content = buildEarningsCsv(rows);
    const filename = `earnings-export-${new Date().toISOString().split('T')[0]}.csv`;

    this.logger.log(`Exported ${earnings.length} earnings records for user ${userId}`);

    return { filename, content };
  }
}
