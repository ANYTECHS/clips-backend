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
 */
export class MintNftDto {
  @ApiProperty({
    description: 'Numeric ID of the clip being minted as an NFT',
    example: 42,
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  clipId: number;

  @ApiProperty({
    description:
      'Stellar wallet address that will receive the NFT and the creator royalty',
    example: 'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
  })
  @IsString()
  @IsNotEmpty()
  creatorWallet: string;

  @ApiPropertyOptional({
    description: 'Optional IPFS / Arweave metadata URI — built automatically if omitted',
    example: 'ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG',
  })
  @IsOptional()
  @IsUrl()
  metadataUri?: string;

  @ApiPropertyOptional({
    description: 'Creator royalty in basis points (0–1500). Defaults to 1000 (10%).',
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
}
