import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiBody,
  ApiOkResponse,
  ApiNotFoundResponse,
  ApiBadRequestResponse,
  ApiInternalServerErrorResponse,
} from '@nestjs/swagger';
import { NftStandardQueriesService } from './nft-standard-queries.service';
import {
  NftOwnerResponseDto,
  NftBalanceResponseDto,
  NftTokenUriResponseDto,
} from './dto/nft-owner.dto';
import {
  RoyaltyConfigResponseDto,
  RoyaltySummaryResponseDto,
  SetRoyaltyDto,
} from './dto/nft-royalty.dto';
import {
  GetClipMetadataResponseDto,
  StoreClipMetadataResponseDto,
  StoreClipMetadataDto,
  ClipMetadataDto,
} from './dto/nft-clip-metadata.dto';

/**
 * Standard NFT query endpoints (Issue #1285: Soroban NFT Enhancement).
 *
 * Provides ERC721-like view functions and ClipCash extensions:
 * - owner_of(tokenId): Get owner of a specific NFT
 * - balance_of(walletAddress): Get NFT count for a wallet
 * - token_uri(tokenId): Get metadata URI
 * - Royalty management and configuration
 * - ClipCash metadata storage and retrieval
 */
@ApiTags('nfts')
@ApiInternalServerErrorResponse({ description: 'Internal server error' })
@Controller('nfts/standard')
export class NftStandardQueriesController {
  constructor(private readonly queriesService: NftStandardQueriesService) {}

  /**
   * ERC721-like owner_of() view function.
   * Returns the owner address of a specific NFT.
   * Read-only, no authentication required.
   */
  @Get(':id/owner')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get the owner of an NFT (ERC721 owner_of)',
    description:
      'Queries the Soroban contract for the owner of a specific NFT token. ' +
      'This is a view-only function compatible with marketplace standards.',
  })
  @ApiParam({
    name: 'id',
    description: 'Token ID (numeric)',
    example: '12345',
  })
  @ApiOkResponse({
    description: 'Owner information retrieved',
    type: NftOwnerResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Token not found or not yet minted' })
  @ApiBadRequestResponse({ description: 'Invalid token ID format' })
  async getOwner(@Param('id') tokenId: string): Promise<NftOwnerResponseDto> {
    return this.queriesService.ownerOf(tokenId);
  }

  /**
   * ERC721-like balance_of() view function.
   * Returns the count of NFTs owned by a wallet address.
   * Read-only, no authentication required.
   */
  @Get('wallets/:address/balance')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get NFT balance for a wallet (ERC721 balance_of)',
    description:
      'Queries the Soroban contract for the number of NFTs owned by a wallet address. ' +
      'This is a view-only function compatible with marketplace standards. ' +
      'Also returns the list of token IDs owned.',
  })
  @ApiParam({
    name: 'address',
    description: 'Stellar wallet address',
    example: 'GBKRDQ5EOPBJQFTBKYZX4AYJVHGCQGXD7UPFMZUWBNYH3FQNVGPG3ZVY',
  })
  @ApiOkResponse({
    description: 'Balance information retrieved',
    type: NftBalanceResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid wallet address' })
  async getBalance(@Param('address') walletAddress: string): Promise<NftBalanceResponseDto> {
    return this.queriesService.balanceOf(walletAddress);
  }

  /**
   * ERC721-like token_uri() view function.
   * Returns the metadata URI for a specific NFT.
   * Read-only, no authentication required.
   */
  @Get(':id/uri')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get metadata URI for an NFT (ERC721 token_uri)',
    description:
      'Queries the Soroban contract for the metadata URI of a specific NFT token. ' +
      'The URI typically points to IPFS or a centralized metadata store. ' +
      'This is a view-only function compatible with marketplace standards.',
  })
  @ApiParam({
    name: 'id',
    description: 'Token ID (numeric)',
    example: '12345',
  })
  @ApiOkResponse({
    description: 'Token URI retrieved',
    type: NftTokenUriResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Token not found' })
  @ApiBadRequestResponse({ description: 'Invalid token ID format' })
  async getTokenUri(@Param('id') tokenId: string): Promise<NftTokenUriResponseDto> {
    return this.queriesService.tokenUri(tokenId);
  }

  /**
   * Get NFTs owned by a wallet (labeled wallet balance).
   * Returns paginated list with ownership details.
   */
  @Get('wallets/:address/nfts-labels')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get wallet NFT list with labels',
    description:
      'Lists all NFTs owned by a wallet address. ' +
      'Results include token metadata and ownership timestamps. ' +
      'Compatible with marketplace UI requirements.',
  })
  @ApiParam({
    name: 'address',
    description: 'Stellar wallet address',
    example: 'GBKRDQ5EOPBJQFTBKYZX4AYJVHGCQGXD7UPFMZUWBNYH3FQNVGPG3ZVY',
  })
  @ApiOkResponse({
    description: 'Wallet NFT list retrieved',
    type: NftBalanceResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid wallet address' })
  async getWalletNftsLabeled(
    @Param('address') walletAddress: string,
  ): Promise<NftBalanceResponseDto> {
    return this.queriesService.balanceOf(walletAddress);
  }

  // ── Royalty Management (Issue #1285) ────────────────────────────────────

  /**
   * Set royalty configuration for an NFT.
   * Supports configurable basis points (max 1500 BPS = 15%).
   */
  @Post(':id/royalties')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Set royalty configuration for an NFT',
    description:
      'Sets the royalty recipient and basis points for secondary sales. ' +
      'Validates that royalties do not exceed 1500 BPS (15%). ' +
      'Can be called multiple times to update configuration.',
  })
  @ApiParam({
    name: 'id',
    description: 'Token ID (numeric)',
    example: '12345',
  })
  @ApiBody({ type: SetRoyaltyDto })
  @ApiOkResponse({
    description: 'Royalty configured successfully',
    type: RoyaltyConfigResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid basis points or wallet address' })
  async setRoyalty(
    @Param('id') tokenId: string,
    @Body() dto: SetRoyaltyDto,
  ): Promise<RoyaltyConfigResponseDto> {
    return this.queriesService.setRoyalty(tokenId, dto.recipient, dto.basisPoints);
  }

  /**
   * Get full royalty summary for an NFT.
   * Returns primary and secondary royalty recipients.
   */
  @Get(':id/royalties/summary')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get royalty summary for an NFT',
    description:
      'Retrieves the complete royalty configuration for an NFT, including: ' +
      '- Primary royalty recipient (usually the creator) ' +
      '- Secondary recipients (platform fees, etc) ' +
      '- Total basis points ' +
      '- Validation status (exceeds max allowed)',
  })
  @ApiParam({
    name: 'id',
    description: 'Token ID (numeric)',
    example: '12345',
  })
  @ApiOkResponse({
    description: 'Royalty summary retrieved',
    type: RoyaltySummaryResponseDto,
  })
  @ApiNotFoundResponse({ description: 'No royalty configuration found for this token' })
  @ApiBadRequestResponse({ description: 'Invalid token ID' })
  async getRoyaltySummary(@Param('id') tokenId: string): Promise<RoyaltySummaryResponseDto> {
    return this.queriesService.getRoyaltySummary(tokenId);
  }

  // ── ClipCash Metadata (Issue #1285) ────────────────────────────────────

  /**
   * Store ClipCash-specific metadata on-chain.
   * Includes virality score and original duration.
   */
  @Post(':id/metadata/clip')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Store ClipCash metadata on-chain',
    description:
      'Stores ClipCash-specific metadata including: ' +
      '- Virality score (0-100) ' +
      '- Original clip duration ' +
      '- Metadata and thumbnail URIs ' +
      'This metadata is queryable by frontend and enables advanced features.',
  })
  @ApiParam({
    name: 'id',
    description: 'Token ID (numeric)',
    example: '12345',
  })
  @ApiBody({ type: StoreClipMetadataDto })
  @ApiOkResponse({
    description: 'Metadata stored successfully',
    type: StoreClipMetadataResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid metadata or token ID' })
  async storeClipMetadata(
    @Param('id') tokenId: string,
    @Body() dto: StoreClipMetadataDto,
  ): Promise<StoreClipMetadataResponseDto> {
    const metadata: ClipMetadataDto = {
      clipId: dto.clipId,
      viralityScore: dto.viralityScore,
      originalDuration: dto.originalDuration,
      metadataUri: dto.metadataUri,
      thumbnailUri: dto.thumbnailUri,
      recordedAt: new Date().toISOString(),
    };

    return this.queriesService.storeClipMetadata(tokenId, metadata);
  }

  /**
   * Retrieve ClipCash metadata for an NFT.
   * Returns virality score, duration, and media URIs.
   */
  @Get(':id/metadata/clip')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get ClipCash metadata for an NFT',
    description:
      'Retrieves stored ClipCash metadata including: ' +
      '- Virality score (0-100) ' +
      '- Original clip duration in seconds ' +
      '- Metadata and thumbnail URIs ' +
      'Used by frontend to display enhanced metadata and analytics.',
  })
  @ApiParam({
    name: 'id',
    description: 'Token ID (numeric)',
    example: '12345',
  })
  @ApiOkResponse({
    description: 'Metadata retrieved successfully',
    type: GetClipMetadataResponseDto,
  })
  @ApiNotFoundResponse({ description: 'No metadata found for this token' })
  @ApiBadRequestResponse({ description: 'Invalid token ID' })
  async getClipMetadata(@Param('id') tokenId: string): Promise<GetClipMetadataResponseDto> {
    return this.queriesService.getClipMetadata(tokenId);
  }
}
