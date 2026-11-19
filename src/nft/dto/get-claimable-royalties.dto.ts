import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

/**
 * Response DTO for retrieving the current claimable royalty balance
 * for a specific recipient and optional asset.
 */
export class GetClaimableRoyaltiesResponseDto {
  @ApiProperty({ example: 42, description: 'Token / clip ID' })
  tokenId: number;

  @ApiProperty({
    example: 'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
    description: 'Royalty recipient wallet address',
  })
  recipient: string;

  @ApiProperty({
    example: 5000000,
    description: 'Claimable balance in stroops (smallest unit)',
  })
  claimableBalance: number;

  @ApiProperty({
    example: 50.0,
    description: 'Claimable balance in the asset (XLM for native)',
  })
  claimableAmount: number;

  @ApiProperty({
    example: 'native',
    description: 'Asset type (native XLM or SAC contract ID)',
  })
  asset: string;

  @ApiProperty({
    example: true,
    description: 'Whether this amount can be claimed (non-zero balance)',
  })
  canClaim: boolean;

  @ApiProperty({ example: 'testnet', description: 'Stellar network' })
  network: string;
}

/**
 * Query parameters for GetClaimableRoyalties endpoint
 */
export class GetClaimableRoyaltiesQueryDto {
  @ApiPropertyOptional({
    description:
      'Royalty recipient wallet address. If not provided, uses the authenticated user\'s wallet.',
    example: 'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
  })
  @IsOptional()
  @IsString()
  recipient?: string;

  @ApiPropertyOptional({
    description:
      'Asset contract address (SAC) to check claimable balance for. Defaults to native XLM when omitted.',
    example: 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA',
  })
  @IsOptional()
  @IsString()
  assetContractId?: string;
}
