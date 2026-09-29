import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
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

  private userEarningsWhere(userId: number): Record<string, unknown> {
    return {
      clip: { video: { userId } },
      deletedAt: null,
    };
  }

  private parseAndValidateDates(options: EarningsExportOptions): {
    start?: Date;
    end?: Date;
  } {
    const result: { start?: Date; end?: Date } = {};

    if (options.startDate) {
      const start = new Date(options.startDate);
      if (Number.isNaN(start.getTime())) {
        throw new BadRequestException(
          `Invalid startDate "${options.startDate}". Use an ISO 8601 date (e.g. 2025-01-01).`,
        );
      }
      result.start = start;
    }

    if (options.endDate) {
      const end = new Date(options.endDate);
      if (Number.isNaN(end.getTime())) {
        throw new BadRequestException(
          `Invalid endDate "${options.endDate}". Use an ISO 8601 date (e.g. 2025-12-31).`,
        );
      }
      end.setUTCHours(23, 59, 59, 999);
      result.end = end;
    }

    if (result.start && result.end && result.start > result.end) {
      throw new BadRequestException(
        'Invalid date range: startDate must be on or before endDate.',
      );
    }

    return result;
  }

  /**
   * Builds a CSV of the authenticated user's earnings for an optional date range.
   * Columns: date, clipTitle, amount, currency, source, transactionId
   * Empty result still returns a header-only CSV so downloads succeed.
   */
  async exportEarningsCsv(
    userId: number,
    options: EarningsExportOptions,
  ): Promise<EarningsExportResult> {
    const { start, end } = this.parseAndValidateDates(options);

    let where: Record<string, unknown> = this.userEarningsWhere(userId);
    if (start || end) {
      const dateFilter: Record<string, Date> = {};
      if (start) dateFilter.gte = start;
      if (end) dateFilter.lte = end;
      where = { ...where, date: dateFilter };
    }

    const earnings = await this.prisma.earning.findMany({
      where,
      select: {
        id: true,
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
      e.clip?.title ?? '',
      e.amount,
      e.currency,
      e.source,
      String(e.id),
    ]);

    const content = buildEarningsCsv(rows);
    const filename = `earnings-export-${new Date().toISOString().split('T')[0]}.csv`;

    this.logger.log(
      `Exported ${earnings.length} earnings record(s) for user ${userId}`,
    );

    return { filename, content };
  }
}
