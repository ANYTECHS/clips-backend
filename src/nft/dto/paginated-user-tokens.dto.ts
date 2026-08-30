import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

export class GetUserTokensQueryDto {
  @ApiPropertyOptional({
    description: 'Maximum number of token IDs to return per page (1-100)',
    example: 20,
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    description:
      'Cursor passed to on-chain get_user_tokens(owner, limit, cursor). ' +
      '0-based offset into the owner\'s token list (Issue #838).',
    example: 0,
    default: 0,
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  cursor?: number = 0;
}

export class PaginatedUserTokensResponseDto {
  @ApiProperty({
    description: 'Stellar wallet address queried',
    example: 'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
  })
  address: string;

  @ApiProperty({
    description: 'Token IDs in the current page',
    type: [Number],
    example: [42, 51, 63],
  })
  tokenIds: number[];

  @ApiPropertyOptional({
    description: 'Cursor (offset) for the next page. Null when no more pages exist.',
    example: 20,
    nullable: true,
  })
  nextCursor: number | null;

  @ApiProperty({
    description: 'Total number of NFTs owned by the wallet',
    example: 45,
  })
  total: number;

  @ApiProperty({
    description: 'Requested page size',
    example: 20,
  })
  limit: number;

  @ApiProperty({
    description: 'Current offset (cursor) used for this page',
    example: 0,
  })
  cursor: number;
}
