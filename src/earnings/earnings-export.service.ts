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
  }
}
