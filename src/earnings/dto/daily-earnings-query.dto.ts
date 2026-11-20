import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsString } from 'class-validator';
import { TrimString } from '../../common/decorators/trim-string.decorator';
import {
  IsSupportedCurrency,
  CURRENCY_API_PROPERTY_OPTIONAL,
} from '../../common/validators/decorators';

/**
 * Query filters for GET /earnings/daily (Issue #979).
 */
export class DailyEarningsQueryDto {
  @ApiPropertyOptional({
    description: 'Inclusive start date (UTC, ISO 8601 date or datetime)',
    example: '2026-09-01',
  })
  @IsOptional()
  @IsISO8601({ strict: false })
  from?: string;

  @ApiPropertyOptional({
    description: 'Inclusive end date (UTC, ISO 8601 date or datetime)',
    example: '2026-09-27',
  })
  @IsOptional()
  @IsISO8601({ strict: false })
  to?: string;

  @ApiPropertyOptional({
    ...CURRENCY_API_PROPERTY_OPTIONAL,
    description: 'Filter by currency. Supported: USD, EUR, GBP, XLM, USDC.',
    example: 'USD',
  })
  @IsOptional()
  @TrimString()
  @IsString()
  @IsSupportedCurrency()
  currency?: string;
}
