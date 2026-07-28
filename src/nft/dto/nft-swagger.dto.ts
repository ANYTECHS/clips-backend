import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class VerifyNftOwnershipDto {
  @ApiProperty({
    description: 'NFT mint address / numeric token ID',
    example: '42',
  })
  @IsString()
  @IsNotEmpty()
  mintAddress: string;

  @ApiProperty({
    description: 'Stellar wallet address to verify as owner',
    example: 'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
  })
  @IsString()
  @IsNotEmpty()
  walletAddress: string;
}

export class NftOwnershipResultDto {
  @ApiProperty({
    description: 'Whether the wallet owns the NFT',
    example: true,
  })
  valid: boolean;

  @ApiPropertyOptional({
    description: 'Error message when valid is false',
    example: 'NFT is not owned by the specified wallet',
  })
  error?: string;
}

export class NftRoyaltyResponseDto {
  @ApiProperty({ example: 1000, description: 'Royalty in basis points' })
  royaltyBps: number;

  @ApiProperty({
    example: 'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
  })
  recipient: string;
}

export class RoyaltyRecipientDto {
  @ApiProperty({
    description: 'Stellar wallet address of the royalty recipient',
    example: 'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
  })
  wallet: string;

  @ApiProperty({
    description:
      'Royalty share in basis points (100 = 1%). Valid range: 0–1500.',
    example: 1000,
    minimum: 0,
    maximum: 1500,
  })
  bps: number;

  @ApiProperty({
    description: 'Human-readable label identifying this recipient',
    example: 'creator',
    enum: ['creator', 'platform'],
  })
  label: string;
}

export class NftMintResponseDto {
  @ApiProperty({ example: '42', description: 'Clip ID that was minted' })
  clipId: string;

  @ApiProperty({
    description: 'Creator wallet address',
    example: 'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
  })
  creatorWallet: string;

  @ApiProperty({
    description: 'On-chain metadata URI',
    example: 'ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG',
  })
  metadataUri: string;

  @ApiProperty({
    description: 'Creator royalty in basis points',
    example: 1000,
  })
  royaltyBps: number;

  @ApiProperty({
    description:
      'Array of royalty recipients with wallet, bps, and label. ' +
      'The combined total of all recipient bps must not exceed 1500.',
    type: [RoyaltyRecipientDto],
    example: [
      { wallet: 'GCREATOR...', bps: 1000, label: 'creator' },
      { wallet: 'GPLATFORM...', bps: 100, label: 'platform' },
    ],
  })
  royalties: RoyaltyRecipientDto[];

  @ApiProperty({ example: 'minted' })
  status: string;
}

export class NftPrepareMintResponseDto {
  @ApiProperty({ example: 'AAAAAgAAA...', description: 'Unsigned Soroban XDR' })
  xdr: string;

  @ApiProperty({ example: 42 })
  clipId: number;

  @ApiProperty({
    example: 'ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG',
  })
  metadataUri: string;
}

export class NftMetadataResponseDto {
  @ApiProperty({ example: 'Game-winning goal' })
  name: string;

  @ApiProperty({ example: 'ClipCash generated clip 42' })
  description: string;

  @ApiProperty({ example: 'https://cdn.example.com/thumbs/42.jpg' })
  image: string;

  @ApiProperty({ example: 'https://cdn.example.com/clips/42.mp4' })
  animation_url: string;

  @ApiProperty({ example: 1000 })
  seller_fee_basis_points: number;
}
