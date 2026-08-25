import { Injectable, Logger } from '@nestjs/common';
import { EarningsExportService, ExportOptions } from './earnings-export.service';
import { CurrencyConversionService } from './currency-conversion.service';

export interface TaxReportRow {
  year: number;
  month: number;
  grossAmount: number;
  currency: string;
  source: string;
}

export interface TaxReport {
  userId: number;
  year: number;
  totalGross: number;
  currency: string;
  rows: TaxReportRow[];
}

@Injectable()
export class TaxReportExportService {
  private readonly logger = new Logger(TaxReportExportService.name);

  constructor(
    private readonly earningsExportService: EarningsExportService,
    private readonly currencyConversionService: CurrencyConversionService,
  ) {}

  /**
   * Generates a tax report for a given user and year.
   * All amounts are converted to `reportCurrency` (default: USD).
   */
  async generateAnnualTaxReport(
    userId: number,
    year: number,
    reportCurrency = 'USD',
  ): Promise<TaxReport> {
    const options: ExportOptions = {
      startDate: `${year}-01-01`,
      endDate: `${year}-12-31`,
    };

    const earnings = await this.earningsExportService.getEarningsForExport(userId, options);

    let totalGross = 0;
    const rows: TaxReportRow[] = earnings.map((e) => {
      const convertedAmount = this.currencyConversionService.convert(
        e.amount,
        e.currency,
        reportCurrency,
      );
      totalGross += convertedAmount;

      return {
        year: e.date.getFullYear(),
        month: e.date.getMonth() + 1,
        grossAmount: convertedAmount,
        currency: reportCurrency,
        source: e.source,
      };
    });

    return {
      userId,
      year,
      totalGross: parseFloat(totalGross.toFixed(2)),
      currency: reportCurrency,
      rows,
    };
  }

  /**
   * Converts a tax report to CSV format for download.
   */
  toCsv(report: TaxReport): string {
    const header = 'year,month,grossAmount,currency,source';
    const lines = report.rows.map(
      (r) => `${r.year},${r.month},${r.grossAmount},${r.currency},${r.source}`,
    );
    return [header, ...lines].join('\n');
  }
}
