import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUrl,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for POST /nfts/mint requests.
 *
 * Captures the clip to mint, the creator's wallet address, an optional
 * pre-built metadata URI, and an optional royalty override in basis points.
 * Supports multiple royalty recipients via label/description fields.
 */
export class MintNftDto {
  /** Numeric ID of the clip being minted as an NFT */
  @ApiProperty({ description: 'Numeric ID of the clip to mint', example: 42 })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  clipId: number;

  /** Stellar wallet address that will receive the NFT and the creator royalty */
  @ApiProperty({
    description: 'Stellar wallet address of the NFT creator (receives creator royalty)',
    example: 'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
  })
  @IsString()
  @IsNotEmpty()
  creatorWallet: string;

  /** Optional IPFS / Arweave metadata URI — built automatically if omitted */
  @ApiPropertyOptional({
    description: 'IPFS or Arweave metadata URI. Built automatically when omitted.',
    example: 'ipfs://Qm...',
  })
  @IsOptional()
  @IsUrl()
  metadataUri?: string;

  /**
   * Creator royalty in basis points (0–1500).
   * Defaults to 1000 (10 %) when not provided.
   * Combined with platform royalty the total must not exceed 1500 bps.
   */
  @ApiPropertyOptional({
    description:
      'Creator royalty in basis points (0–1500). Defaults to 1000 (10%). ' +
      'Combined with the platform royalty the total must not exceed 1500 bps.',
    example: 1000,
    minimum: 0,
    maximum: 1500,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1500)
  @Type(() => Number)
  royaltyBps?: number;

  /**
   * Human-readable label for the creator royalty recipient.
   * Stored in NFT metadata for transparency.
   */
  @ApiPropertyOptional({
    description: 'Human-readable label for the creator royalty recipient, e.g. "Creator".',
    example: 'Creator',
  })
  @IsOptional()
  @IsString()
  creatorLabel?: string;

  /**
   * Optional description of the royalty split for this NFT.
   * Included in on-chain metadata for transparency.
   */
  @ApiPropertyOptional({
    description:
      'Description of the royalty arrangement shown in NFT metadata. ' +
      'E.g. "10% creator royalty + 2% platform fee on every secondary sale."',
    example: '10% creator royalty + 2% platform fee on every secondary sale.',
  })
  @IsOptional()
  @IsString()
  royaltyDescription?: string;
}
