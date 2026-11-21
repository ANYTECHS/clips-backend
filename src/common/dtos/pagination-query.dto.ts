import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

/** Reusable pagination query DTO (videos, clips, transactions, NFTs, earnings). */
export class PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Page number (1-based)', default: DEFAULT_PAGE, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page must be a positive integer' })
  @Min(1, { message: 'page must be a positive integer' })
  page: number = DEFAULT_PAGE;

  @ApiPropertyOptional({ description: 'Items per page', default: DEFAULT_LIMIT, minimum: 1, maximum: MAX_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit must be a positive integer' })
  @Min(1, { message: 'limit must be a positive integer' })
  @Max(MAX_LIMIT, { message: `limit must not exceed ${MAX_LIMIT}` })
  limit: number = DEFAULT_LIMIT;

  get skip(): number {
    return (this.page - 1) * this.limit;
  }

  get take(): number {
    return this.limit;
  }
}
