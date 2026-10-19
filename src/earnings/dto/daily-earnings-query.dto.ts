import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsString, Length } from 'class-validator';
import { TrimString } from '../../common/decorators/trim-string.decorator';

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
    description: 'ISO 4217 currency filter (e.g. USD, XLM)',
    example: 'USD',
  })
  @IsOptional()
  @TrimString()
  @IsString()
  @Length(3, 3)
  currency?: string;
}
