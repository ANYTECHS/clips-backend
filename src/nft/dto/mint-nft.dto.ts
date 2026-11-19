import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUrl,
  IsInt,
  Min,
  Max,
  Matches,
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
  @ApiPropertyOptional({
    description: 'Slug of the NFT collection. Defaults to viral-clips.',
    example: 'viral-clips',
    pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
  })
  @IsOptional()
  @IsString({ message: 'collectionId must be a string' })
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'collectionId must be a lowercase slug',
  })
  collectionId?: string;

  @ApiProperty({
    description: 'Numeric ID of the clip being minted as an NFT',
    example: 42,
    minimum: 1,
  })
  @IsInt({ message: 'clipId must be an integer' })
  @Min(1, { message: 'clipId must be a positive integer (≥ 1)' })
  @Type(() => Number)
  clipId: number;

  /** Stellar wallet address that will receive the NFT and the creator royalty */
  @ApiProperty({
    description:
      'Stellar wallet address of the NFT creator (receives creator royalty)',
    example: 'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
  })
  @IsString({ message: 'creatorWallet must be a string' })
  @IsNotEmpty({ message: 'creatorWallet (Stellar address) is required' })
  creatorWallet: string;

  /** Optional IPFS / Arweave metadata URI — built automatically if omitted */
  @ApiPropertyOptional({
    description:
      'IPFS or Arweave metadata URI. Built automatically when omitted.',
    example: 'ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG',
  })
  @IsOptional()
  @IsUrl({}, { message: 'metadataUri must be a valid URL (e.g. ipfs://... or https://...)' })
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
  @IsInt({ message: 'royaltyBps must be an integer' })
  @Min(0, { message: 'royaltyBps must be at least 0 (0%)' })
  @Max(1500, { message: 'royaltyBps must not exceed 1500 (15%)' })
  @Type(() => Number)
  royaltyBps?: number;

  /**
   * Human-readable label for the creator royalty recipient.
   * Stored in NFT metadata for transparency.
   */
  @ApiPropertyOptional({
    description:
      'Human-readable label for the creator royalty recipient, e.g. "Creator".',
    example: 'Creator',
  })
  @IsOptional()
  @IsString({ message: 'creatorLabel must be a string' })
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
  @IsString({ message: 'royaltyDescription must be a string' })
  royaltyDescription?: string;

  /**
   * Ed25519 signature over the canonical mint-authorization challenge message:
   *   "ClipCash mint authorization for clip <clipId> by <creatorWallet>"
   *
   * When provided the backend verifies the signature before minting, proving
   * the caller controls the private key for `creatorWallet` and rejecting
   * unauthorized mints. Required for production mints (Issue #1165).
   *
   * Encoding: 128-char lowercase hex or standard/URL-safe base64.
   */
  @ApiPropertyOptional({
    description:
      'Ed25519 signature (hex or base64) over the challenge message ' +
      '"ClipCash mint authorization for clip <clipId> by <creatorWallet>". ' +
      'Required signature field: when supplied the server verifies wallet ' +
      'ownership before minting and rejects invalid signatures with 401. ' +
      'Omit only during local testing (Issue #1165).',
    example:
      'a3f2c1d4e5b6a7f8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2' +
      'c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4',
  })
  @IsOptional()
  @IsString({ message: 'walletSignature must be a string' })
  walletSignature?: string;
}
