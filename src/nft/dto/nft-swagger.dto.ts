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

export class NftOwnerResponseDto {
  @ApiProperty({
    description: 'The Stellar wallet address of the owner, or null if not minted',
    example: 'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
    nullable: true,
  })
  owner: string | null;
}

export class WalletNftsResponseDto {
  @ApiProperty({
    description: 'The Stellar wallet address',
    example: 'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
  })
  address: string;

  @ApiProperty({
    description: 'Array of numeric token IDs owned by the wallet',
    type: [Number],
    example: [42, 51],
  })
  tokenIds: number[];

  @ApiProperty({
    description: 'Total number of NFTs owned by the wallet',
    example: 2,
  })
  balance: number;

  @ApiPropertyOptional({
    description: 'Cursor (offset) for the next page. Null when no more pages exist.',
    example: 20,
    nullable: true,
  })
  nextCursor?: number | null;

  @ApiPropertyOptional({
    description: 'Total number of tokens across all pages',
    example: 45,
  })
  total?: number;

  @ApiPropertyOptional({
    description: 'Requested page size',
    example: 20,
  })
  limit?: number;

  @ApiPropertyOptional({
    description: 'Current offset (cursor) used for this page',
    example: 0,
  })
  cursor?: number;
}

export class NftRoyaltyResponseDto {
  @ApiProperty({ example: 1000, description: 'Royalty in basis points' })
  royaltyBps: number;

  @ApiProperty({
    description: 'Masked Stellar wallet address of the royalty recipient',
    example: 'GC6X********UTZF3',
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
    description: 'Creator wallet address (may be masked in API responses)',
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
  @ApiProperty({
    description: 'Unsigned Soroban transaction XDR for the client wallet to sign',
    example:
      'AAAAAgAAAABjc+6XXsdHPixc8hbEdqMxK3+GpP9M7FLQ8kG2fH3+AAAAAGQAAAAAAAAAAQAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAGAAAAAAAAAABjc+6XXsdHPixc8hbEdqMxK3+GpP9M7FLQ8kG2fH3+',
  })
  xdr: string;

  @ApiProperty({
    description:
      'ClipCash database Clip ID — stored on-chain inside `TokenData.clip_id` ' +
      'so every NFT carries a verifiable link back to the backend record. ' +
      'Query the on-chain value at any time via the `get_clip_id(token_id)` ' +
      'contract view function (Issue #674).',
    example: 42,
  })
  clipId: number;

  @ApiProperty({
    description: 'On-chain token ID (equals clip ID)',
    example: 42,
  })
  tokenId: number;

  @ApiProperty({
    description: 'IPFS metadata URI embedded in the mint call',
    example: 'ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG',
  })
  metadataUri: string;

  @ApiProperty({
    description: 'Creator royalty in basis points applied to the mint',
    example: 1000,
    minimum: 0,
    maximum: 1500,
  })
  royaltyBps: number;

  @ApiProperty({
    description: 'Stellar wallet that will receive the NFT',
    example: 'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
  })
  to: string;

  @ApiProperty({
    description: 'Soroban NFT contract ID',
    example: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEU4',
  })
  contractId: string;

  @ApiProperty({
    description: 'Stellar network the XDR was built for',
    example: 'testnet',
  })
  network: string;
}

/** 409 body when the clip is already minting or minted. */
export class NftMintConflictDto {
  @ApiProperty({ example: 409 })
  statusCode: number;

  @ApiProperty({
    example: 'Clip is already being minted or has been minted',
  })
  message: string;

  @ApiProperty({ example: 'Conflict' })
  error: string;
}

/** 404 body when the clip cannot be found for mint preparation. */
export class NftMintNotFoundDto {
  @ApiProperty({ example: 404 })
  statusCode: number;

  @ApiProperty({ example: 'Clip with ID 42 not found' })
  message: string;

  @ApiProperty({ example: 'Not Found' })
  error: string;
}

/** 400 body for invalid prepare-mint payloads or non-conflict mint rejections. */
export class NftPrepareMintBadRequestDto {
  @ApiProperty({ example: 400 })
  statusCode: number;

  @ApiProperty({
    example: 'Invalid wallet address: Invalid Stellar address checksum',
  })
  message: string;

  @ApiProperty({ example: 'Bad Request' })
  error: string;
}

/**
 * Response after uploading clip NFT metadata to IPFS (before minting).
 * Swagger documents metadataUri, IPFS CID, and a full example response.
 */
export class NftUploadMetadataResponseDto {
  @ApiProperty({
    description: 'Clip ID whose metadata was uploaded',
    example: 42,
  })
  clipId: number;

  @ApiProperty({
    description: 'IPFS content identifier (CID) for the pinned metadata JSON',
    example: 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG',
  })
  cid: string;

  @ApiProperty({
    description: 'IPFS metadata URI persisted on the clip (ipfs://<cid>)',
    example: 'ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG',
  })
  metadataUri: string;
}

export class NftMetadataAttributeDto {
  @ApiProperty({ example: 'Virality Score' })
  trait_type: string;

  @ApiProperty({ example: 87, description: 'String or numeric attribute value' })
  value: string | number;
}

export class NftRoyaltyInfoDto {
  @ApiProperty({ example: 1000, description: 'Royalty in basis points' })
  bps: number;

  @ApiProperty({ example: 10, description: 'Royalty as a percentage' })
  percent: number;

  @ApiPropertyOptional({
    description: 'Masked Stellar wallet address of the royalty recipient',
    example: 'GC6X********UTZF3',
  })
  recipient?: string;
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

  @ApiProperty({
    type: [NftMetadataAttributeDto],
    description: 'OpenSea-compatible trait list for the clip',
    example: [
      { trait_type: 'Clip Duration', value: 34 },
      { trait_type: 'Virality Score', value: 87 },
      { trait_type: 'Creation Date', value: '2026-07-20T09:30:00.000Z' },
      { trait_type: 'Royalty BPS', value: 1000 },
      { trait_type: 'Royalty Percent', value: 10 },
    ],
  })
  attributes: NftMetadataAttributeDto[];

  @ApiProperty({ example: 1000, description: 'Creator royalty in basis points' })
  seller_fee_basis_points: number;

  @ApiPropertyOptional({
    description: 'Masked Stellar wallet address receiving the fee',
    example: 'GC6X********UTZF3',
  })
  fee_recipient?: string;

  @ApiProperty({
    type: NftRoyaltyInfoDto,
    description: 'Explicit royalty block for marketplaces / mint clients',
  })
  royalty: NftRoyaltyInfoDto;

  @ApiPropertyOptional({ example: 87, description: 'Clip virality score' })
  viralityScore?: number;

  @ApiPropertyOptional({ example: 34, description: 'Original clip duration in seconds' })
  originalDuration?: number;

  @ApiPropertyOptional({ example: '2026-07-20T09:30:00.000Z', description: 'Creation timestamp' })
  createdAt?: string;
}
