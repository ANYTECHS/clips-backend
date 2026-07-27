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
  @ApiProperty({ example: true })
  valid: boolean;

  @ApiPropertyOptional({
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

export class NftMintResponseDto {
  @ApiProperty({ example: '42' })
  clipId: string;

  @ApiProperty({
    example: 'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
  })
  creatorWallet: string;

  @ApiProperty({
    example: 'ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG',
  })
  metadataUri: string;

  @ApiProperty({ example: 1000 })
  royaltyBps: number;

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
