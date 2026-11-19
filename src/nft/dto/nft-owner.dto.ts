import { ApiProperty } from '@nestjs/swagger';

/**
 * Response DTO for owner_of() queries.
 * ERC721-like standard ownership query.
 */
export class NftOwnerResponseDto {
  @ApiProperty({
    description: 'The token ID (matches clip ID)',
    example: '12345',
  })
  tokenId: string;

  @ApiProperty({
    description: 'The Stellar account address that owns this NFT',
    example: 'GBKRDQ5EOPBJQFTBKYZX4AYJVHGCQGXD7UPFMZUWBNYH3FQNVGPG3ZVY',
  })
  owner: string;

  @ApiProperty({
    description: 'ISO timestamp of when this NFT was minted',
    example: '2026-10-18T14:30:00Z',
  })
  mintedAt: string;

  @ApiProperty({
    description: 'Collection ID this NFT belongs to',
    example: 'viral-clips',
  })
  collectionId: string;
}

/**
 * Response DTO for balance_of() queries.
 * ERC721-like standard balance query.
 */
export class NftBalanceResponseDto {
  @ApiProperty({
    description: 'The Stellar account address',
    example: 'GBKRDQ5EOPBJQFTBKYZX4AYJVHGCQGXD7UPFMZUWBNYH3FQNVGPG3ZVY',
  })
  walletAddress: string;

  @ApiProperty({
    description: 'Total number of NFTs owned by this wallet',
    example: 42,
  })
  balance: number;

  @ApiProperty({
    description: 'Array of token IDs owned by this wallet',
    example: ['12345', '12346', '12347'],
    isArray: true,
  })
  tokenIds: string[];
}

/**
 * Response DTO for token_uri() queries.
 */
export class NftTokenUriResponseDto {
  @ApiProperty({
    description: 'The token ID',
    example: '12345',
  })
  tokenId: string;

  @ApiProperty({
    description: 'The URI pointing to token metadata (IPFS or HTTP)',
    example: 'https://ipfs.io/ipfs/QmX...',
  })
  uri: string;

  @ApiProperty({
    description: 'Media content type (json for standard metadata)',
    example: 'json',
  })
  contentType: string;
}
