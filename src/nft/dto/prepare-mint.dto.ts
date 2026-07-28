import { IsInt, IsString, IsNotEmpty, IsOptional, IsUrl, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** @deprecated Use CreateMintPreparationDto */
export type PrepareMintDto = CreateMintPreparationDto;

/**
 * Request body for POST /nfts/prepare-mint
 *
 * Builds an unsigned Soroban mint transaction XDR that the frontend
 * wallet (Freighter / Albedo) will sign and submit.
 */
export class CreateMintPreparationDto {
  @ApiProperty({
    description: 'Numeric ID of the ClipCash clip to mint as an NFT',
    example: 42,
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  clipId: number;

  @ApiProperty({
    description:
      'Stellar wallet address that will own the minted NFT and sign the transaction (Freighter / Albedo).',
    example: 'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
  })
  @IsString()
  @IsNotEmpty()
  walletAddress: string;

  @ApiPropertyOptional({
    description:
      'Pre-built IPFS or Arweave metadata URI. ' +
      'When omitted the backend uploads the clip metadata to IPFS automatically ' +
      'and uses the resulting URI.',
    example: 'ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG',
  })
  @IsOptional()
  @IsUrl()
  metadataUri?: string;
}
