import {
  IsInt,
  IsString,
  IsNotEmpty,
  IsPositive,
  Min,
  IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Request body for POST /nfts/prepare-transfer
 *
 * Builds an unsigned Soroban `transfer_with_royalty` XDR that the caller
 * can sign and submit on-chain.  The response includes a full royalty
 * breakdown so the frontend can display the fee before the user signs.
 */
export class PrepareTransferDto {
  @ApiProperty({
    description: 'Numeric token ID of the NFT being transferred (= clip.id)',
    example: 42,
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  tokenId: number;

  @ApiProperty({
    description: 'Stellar wallet address of the current NFT owner (sender)',
    example: 'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
  })
  @IsString()
  @IsNotEmpty()
  fromWallet: string;

  @ApiProperty({
    description: 'Stellar wallet address of the new NFT owner (recipient)',
    example: 'GBXXYQVNHHZSL3VQNNNQRXB2FHQWZYTQJ6JRYVJL7XP2KXFBH3TFQX',
  })
  @IsString()
  @IsNotEmpty()
  toWallet: string;

  @ApiProperty({
    description:
      'Agreed sale price in stroops (1 XLM = 10_000_000 stroops). ' +
      'Used to compute the royalty amount: royalty = floor(salePrice × royaltyBps / 10_000). ' +
      'Arithmetic is performed with BigInt to prevent IEEE-754 overflow — see safe-math.helper.ts. ' +
      'Pass 0 for a gifted/free transfer (no royalty will be charged). ' +
      'Values where floor(salePrice × royaltyBps / 10_000) > Number.MAX_SAFE_INTEGER ' +
      '(≈ 9 × 10^15) are rejected with HTTP 400.',
    example: 5000000000,
    minimum: 0,
  })
  @IsInt()
  @Min(0)
  @Type(() => Number)
  salePrice: number;

  /**
   * Optional royalty BPS override.
   * When omitted the backend resolves the rate from the contract:
   *   1. Per-token royalty stored on-chain
   *   2. Contract-level default royalty
   *   3. 0 BPS (no royalty)
   */
  @ApiPropertyOptional({
    description:
      'Royalty rate in basis points (0–10 000) to apply to this transfer. ' +
      'When omitted the on-chain per-token or default rate is used.',
    example: 1000,
    minimum: 0,
    maximum: 10000,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  royaltyBpsOverride?: number;
}
