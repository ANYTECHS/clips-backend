import { IsString, IsNotEmpty, IsOptional, IsUrl } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsValidRoyaltyBps,
  CLIP_ROYALTY_BPS_MAX,
} from '../../common/validators/decorators';

/** @deprecated Use CreateMintDto */
export type MintClipDto = CreateMintDto;

export class CreateMintDto {
  @ApiProperty({
    description: 'ID of the clip being minted',
    example: '42',
  })
  @IsString()
  @IsNotEmpty()
  clipId: string;

  @ApiProperty({
    description:
      "Creator's wallet address — receives the creator royalty share",
    example: 'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
  })
  @IsString()
  @IsNotEmpty()
  creatorWallet: string;

  @ApiPropertyOptional({
    description: 'Optional on-chain metadata URI (IPFS / Arweave)',
    example: 'ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG',
  })
  @IsOptional()
  @IsUrl()
  metadataUri?: string;

  @ApiPropertyOptional({
    description:
      'NFT royalty in Basis Points (BPS). 0–1500 (0–15%). Defaults to 1000 (10%).',
    example: 1000,
    minimum: 0,
    maximum: 1500,
  })
  @IsOptional()
  @Type(() => Number)
  @IsValidRoyaltyBps({ max: CLIP_ROYALTY_BPS_MAX })
  royaltyBps?: number;
}
