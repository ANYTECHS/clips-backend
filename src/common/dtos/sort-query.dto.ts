import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional } from 'class-validator';

export enum SortDirection {
  ASC = 'asc',
  DESC = 'desc',
}

const normalizeDirection = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

/**
 * Build a reusable, whitelisted sort DTO.
 *
 * @example
 * export class ClipSortDto extends createSortQueryDto(['createdAt', 'viralityScore'] as const, 'createdAt') {}
 * prisma.clip.findMany({ orderBy: dto.toPrismaOrderBy() });
 */
export function createSortQueryDto<F extends string>(
  allowedFields: readonly F[],
  defaultField: F,
  defaultDirection: SortDirection = SortDirection.DESC,
) {
  class SortQueryDto {
    static readonly allowedFields = allowedFields;

    @ApiPropertyOptional({ description: 'Field to sort by', enum: allowedFields, default: defaultField })
    @IsOptional()
    @IsIn(allowedFields as readonly string[], {
      message: `sortBy must be one of: ${allowedFields.join(', ')}`,
    })
    sortBy: F = defaultField;

    @ApiPropertyOptional({ description: 'Sort direction', enum: SortDirection, default: defaultDirection })
    @IsOptional()
    @Transform(normalizeDirection)
    @IsIn(Object.values(SortDirection), { message: 'sortOrder must be ASC or DESC' })
    sortOrder: SortDirection = defaultDirection;

    /** Prisma orderBy built only from whitelisted values. */
    toPrismaOrderBy(): Record<F, SortDirection> {
      const field = allowedFields.includes(this.sortBy) ? this.sortBy : defaultField;
      const dir = this.sortOrder === SortDirection.ASC ? SortDirection.ASC : SortDirection.DESC;
      return { [field]: dir } as Record<F, SortDirection>;
    }
  }
  return SortQueryDto;
}
