import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

export class GetCollectionNftsQueryDto {
  @ApiPropertyOptional({
    description: 'Filter tokens by a supported collection slug',
    example: 'viral-clips',
  })
  @IsOptional()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  collectionId?: string;

  @ApiPropertyOptional({
    description: 'Maximum number of results (1-100)',
    default: 50,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
}
