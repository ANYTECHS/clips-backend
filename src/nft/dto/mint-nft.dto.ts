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

/**
 * DTO for POST /nfts/mint requests.
 *
 * Captures the clip to mint, the creator's wallet address, an optional
 * pre-built metadata URI, and an optional royalty override in basis points.
 */
export class MintNftDto {
  /** Numeric ID of the clip being minted as an NFT */
  @IsInt()
  @Min(1)
  @Type(() => Number)
  clipId: number;

  /** Stellar wallet address that will receive the NFT and the creator royalty */
  @IsString()
  @IsNotEmpty()
  creatorWallet: string;

  /** Optional IPFS / Arweave metadata URI — built automatically if omitted */
  @IsOptional()
  @IsUrl()
  metadataUri?: string;

  /**
   * Creator royalty in basis points (0–1500).
   * Defaults to 1000 (10 %) when not provided.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1500)
  @Type(() => Number)
  royaltyBps?: number;
}
