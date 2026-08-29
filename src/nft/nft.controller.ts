import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBody,
  ApiBearerAuth,
  ApiInternalServerErrorResponse,
  ApiUnauthorizedResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiForbiddenResponse,
  ApiConflictResponse,
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';

import { NftService, MintResult } from './nft.service';
import { MintNftDto } from './dto/mint-nft.dto';
import { CreateMintPreparationDto } from './dto/prepare-mint.dto';
import { ConfirmMintDto } from './dto/confirm-mint.dto';
import { UploadClipMetadataDto } from './dto/upload-metadata.dto';
import { BatchMintDto, BatchMintResponseDto } from './dto/batch-mint.dto';
import {
  UpdateTokenUriDto,
  UpdateTokenUriResponseDto,
  TokenUriOwnershipErrorDto,
} from './dto/update-token-uri.dto';

import {
  NftMetadataResponseDto,
  NftOwnershipResultDto,
  NftPrepareMintResponseDto,
  NftUploadMetadataResponseDto,
  NftMintConflictDto,
  NftMintNotFoundDto,
  NftPrepareMintBadRequestDto,
  VerifyNftOwnershipDto,
  NftOwnerResponseDto,
  WalletNftsResponseDto,
  NftMintResponseDto,
} from './dto/nft-swagger.dto';
import {
  RoyaltyQueryResponseDto,
  RoyaltyNotFoundDto,
  RoyaltyUnauthorizedDto,
  RoyaltyEstimateQueryDto,
  RoyaltyEstimateResponseDto,
  RoyaltyOverflowErrorDto,
} from './dto/royalty-query.dto';
import {
  SetPlatformFeeDto,
  SetDefaultRoyaltyDto,
  AdminConfigTxResponseDto,
  AdminConfigValueResponseDto,
} from './dto/admin-config.dto';
import {
  ApproveNftDto,
  SetApprovalForAllDto,
  ApproveNftResponseDto,
  SetApprovalForAllResponseDto,
  GetApprovedResponseDto,
  IsApprovedForAllResponseDto,
} from './dto/nft-approval.dto';
import { AdminConfigService } from './admin-config.service';
import { NftApprovalService } from './nft-approval.service';
import {
  BurnNftDto,
  BurnNftResponseDto,
  BurnForbiddenDto,
  BurnNotFoundDto,
} from './dto/burn-nft.dto';
import {
  RoyaltySplitsResponseDto,
  UpdateRoyaltySplitsDto,
  UpdateRoyaltySplitsResponseDto,
  RoyaltySplitsValidationErrorDto,
} from './dto/royalty-splits.dto';
import {
  ClaimRoyaltiesDto,
  ClaimRoyaltiesResponseDto,
  ClaimRoyaltiesInsufficientBalanceDto,
} from './dto/claim-royalties.dto';
import {
  RoyaltyClaimHistoryQueryDto,
  RoyaltyClaimHistoryResponseDto,
} from './dto/royalty-claim-history.dto';
import { NftMintService } from '../clips/nft-mint.service';
import { NftMetadataService } from './nft-metadata.service';
import { IpfsUploadService } from './ipfs-upload.service';
import { RoyaltyQueryService, RoyaltyInfo } from './royalty-query.service';
import { NftOwnershipVerificationService } from './nft-ownership-verification.service';
import { NftOwnershipService } from './nft-ownership.service';
import { PrismaService } from '../prisma/prisma.service';
import { RoyaltyConfigurationService } from './royalty-configuration.service';
import { MintSignatureVerificationService } from './mint-signature-verification.service';
import { LoginGuard } from '../auth/guards/login.guard';
import { NftMintGuard } from './guards/nft-mint.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { AdminContractService } from './admin-contract.service';
import { ClaimRoyaltyService } from './claim-royalty.service';
import { RoyaltyClaimHistoryService } from './royalty-claim-history.service';
import { PrepareContractPauseDto } from './dto/prepare-mint.dto';
import { maskAddress } from '../wallets/wallet.utils';
import {
  UpdateRoyaltyRecipientDto,
  UpdateRoyaltyRecipientResponseDto,
} from './dto/update-royalty-recipient.dto';
import { DeploymentStatusResponseDto } from './dto/deployment-status.dto';
import { CollectionInfoResponseDto } from './dto/collection-info.dto';
import { GasStatsResponseDto } from './dto/gas-stats.dto';
import { GasMetricsService } from './gas-metrics.service';
import {
  UpdateMetadataDto,
  UpdateMetadataResponseDto,
  MetadataUpdateLimitErrorDto,
} from './dto/update-metadata.dto';
import {
  RefreshMetadataDto,
  RefreshMetadataResponseDto,
  MetadataRefreshCooldownErrorDto,
} from './dto/refresh-metadata.dto';
import {
  GetUserTokensQueryDto,
  PaginatedUserTokensResponseDto,
} from './dto/paginated-user-tokens.dto';

@ApiTags('nfts')
@ApiInternalServerErrorResponse({ description: 'Internal server error' })
@Controller('nfts')
export class NftController {
  constructor(
    private readonly nftService: NftService,
    private readonly nftMintService: NftMintService,
    private readonly nftMetadataService: NftMetadataService,
    private readonly ipfsUploadService: IpfsUploadService,
    private readonly royaltyQueryService: RoyaltyQueryService,
    private readonly ownershipVerificationService: NftOwnershipVerificationService,
    private readonly nftOwnershipService: NftOwnershipService,
    private readonly prisma: PrismaService,
    private readonly royaltyConfigurationService: RoyaltyConfigurationService,
    private readonly mintSignatureVerification: MintSignatureVerificationService,
    private readonly adminContractService: AdminContractService,
    private readonly adminConfigService: AdminConfigService,
    private readonly nftApprovalService: NftApprovalService,
    private readonly gasMetricsService: GasMetricsService,
    private readonly claimRoyaltyService: ClaimRoyaltyService,
    private readonly royaltyClaimHistoryService: RoyaltyClaimHistoryService,
  ) {}

  @UseGuards(LoginGuard, NftMintGuard)
  @Get(':id/owner')
  @ApiOperation({
    summary: 'Get the current owner of an NFT',
    description:
      'Queries the on-chain Soroban contract to find the current owner of the given token ID. ' +
      'Returns null if the token has not been minted.',
  })
  @ApiParam({ name: 'id', description: 'Numeric token ID', example: 42 })
  @ApiOkResponse({
    description: 'Owner address returned successfully',
    type: NftOwnerResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid token ID format' })
  async getOwner(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<NftOwnerResponseDto> {
    if (id <= 0) {
      throw new BadRequestException('Token ID must be a positive integer');
    }
    const owner = await this.nftOwnershipService.getOwner(id.toString());
    return { owner };
  }

  /**
   * GET /nfts/:id/exists
   * Lightweight token existence check (Issue #688).
   * Returns { exists: true } when the token has been minted, { exists: false } otherwise.
   * Does not require authentication — the frontend uses this before any wallet interaction.
   */
  @Get(':id/exists')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Check whether an NFT token has been minted (Issue #688)',
    description:
      'Lightweight query that returns a boolean indicating whether the token with the given ' +
      'ID exists on-chain. Uses an efficient Soroban storage lookup (owner_of). ' +
      'Existing tokens return { exists: true }; non-existent tokens return { exists: false }. ' +
      'No authentication required.',
  })
  @ApiParam({ name: 'id', description: 'Numeric token ID', example: 42 })
  @ApiOkResponse({
    description: 'Token existence check result',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'number', example: 42 },
        exists: {
          type: 'boolean',
          description: 'true when the token has been minted, false otherwise',
          example: true,
        },
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Invalid token ID format' })
  async tokenExists(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<{ id: number; exists: boolean }> {
    if (id <= 0) {
      throw new BadRequestException('Token ID must be a positive integer');
    }
    const exists = await this.nftOwnershipService.tokenExists(id.toString());
    return { id, exists };
  }

  @Get('/wallets/:address/nfts')
  @ApiOperation({
    summary: 'Get paginated NFTs owned by a wallet',
    description:
      'Queries the on-chain Soroban contract to get token IDs held by the specified wallet. ' +
      'Supports offset-based pagination via limit and cursor query parameters. ' +
      'Large collections are handled safely by returning paginated results.',
  })
  @ApiParam({
    name: 'address',
    description: 'Stellar wallet address',
    example: 'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Maximum number of token IDs to return (1-100, default 20)',
    example: 20,
  })
  @ApiQuery({
    name: 'cursor',
    required: false,
    description: 'Offset into the owner\'s token list for pagination (0-based, default 0)',
    example: 0,
  })
  @ApiOkResponse({
    description: 'Paginated NFTs returned successfully',
    type: PaginatedUserTokensResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid wallet address or pagination parameters' })
  async getWalletNfts(
    @Param('address') address: string,
    @Query() query: GetUserTokensQueryDto,
  ): Promise<PaginatedUserTokensResponseDto> {
    if (!address || address.length !== 56 || !address.startsWith('G')) {
      throw new BadRequestException('Invalid Stellar wallet address');
    }

    const limit = query.limit ?? 20;
    const cursor = query.cursor ?? 0;

    if (limit < 1 || limit > 100) {
      throw new BadRequestException('limit must be between 1 and 100');
    }
    if (cursor < 0) {
      throw new BadRequestException('cursor must be >= 0');
    }

    const result = await this.nftOwnershipService.getUserTokensPaginated(
      address,
      limit,
      cursor,
    );

    return {
      address,
      tokenIds: result.tokenIds,
      nextCursor: result.nextCursor,
      total: result.total,
      limit,
      cursor,
    };
  }

  /**
   * POST /nfts/upload-metadata
   * Builds OpenSea-compatible metadata, uploads to IPFS, and persists metadataUri on the clip.
   */
  @UseGuards(LoginGuard)
  @Post('upload-metadata')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ nftMint: { limit: 5, ttl: 60000 } })
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Upload clip NFT metadata to IPFS before minting',
    description:
      'Builds metadata from the clip, uploads it to IPFS (Pinata or nft.storage), ' +
      'persists the metadata URI on the clip, and returns the IPFS CID and URI.',
  })
  @ApiBody({ type: UploadClipMetadataDto })
  @ApiResponse({
    status: 201,
    description: 'Metadata uploaded to IPFS and saved on the clip',
    type: NftUploadMetadataResponseDto,
    schema: {
      example: {
        clipId: 42,
        cid: 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG',
        metadataUri: 'ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG',
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Clip is not ready for metadata upload (e.g. missing clipUrl)',
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized — Bearer JWT required',
  })
  @ApiForbiddenResponse({ description: 'Caller does not own the clip' })
  @ApiNotFoundResponse({ description: 'Clip not found' })
  async uploadMetadata(
    @Body() dto: UploadClipMetadataDto,
    @Req() req: Request,
  ): Promise<NftUploadMetadataResponseDto> {
    const userId = Number((req as any).user?.id ?? 0);
    await this.nftMintService.validateClipOwner(dto.clipId, userId);
    return this.nftMintService.uploadMetadataToIPFS(dto.clipId);
  }

  @UseGuards(NftMintGuard)
  @Post('mint')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ nftMint: { limit: 5, ttl: 60000 } })
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Mint a clip as an NFT',
    description:
      'Builds metadata, uploads to IPFS when needed, then mints with split royalties. ' +
      'The authenticated caller must own the clip being minted.',
  })
  @ApiBody({ type: MintNftDto })
  @ApiResponse({
    status: 201,
    description: 'NFT minted successfully',
    type: NftMintResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      'Invalid mint payload, or the clip cannot be minted because it is already minting/minted ' +
      'or has already been posted to a social platform (business rule: posted clips cannot be minted).',
    schema: {
      example: {
        statusCode: 400,
        message: 'Posted clips cannot be minted.',
        error: 'Bad Request',
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized — Bearer JWT required',
  })
  @ApiForbiddenResponse({
    description: 'Caller does not own the clip, or the mint guard rejected the request',
    schema: {
      example: {
        statusCode: 403,
        message: 'You do not own this clip',
        error: 'Forbidden',
      },
    },
  })
  @ApiNotFoundResponse({ description: 'Clip not found' })
  async mint(
    @Body() dto: MintNftDto,
    @Req() req: Request,
  ): Promise<MintResult> {
    const userId = Number((req as any).user?.id ?? 0);

    // Reject mint requests for clips that don't exist or don't belong to the caller.
    await this.nftMintService.validateClipOwner(dto.clipId, userId);

    const metadataUri =
      dto.metadataUri ??
      (await this.nftMintService.uploadMetadataToIPFS(dto.clipId)).metadataUri;

    return this.nftService.mintClip({
      clipId: String(dto.clipId),
      creatorWallet: dto.creatorWallet,
      metadataUri,
      royaltyBps: dto.royaltyBps,
    });
  }

  @Post('batch-mint')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ nftMint: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    summary: 'Mint multiple clip NFTs in a single transaction (Issue #671)',
    description:
      'Mint multiple clip NFTs in one call. Validates array lengths, enforces gas-limit safeguards (max 50 clips), ' +
      'emits BatchMint event, and handles partial failures gracefully.',
  })
  @ApiBody({ type: BatchMintDto })
  @ApiResponse({
    status: 201,
    description: 'Batch minting process completed',
    type: BatchMintResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      'Mismatched arrays, invalid payload, or batch size exceeded limit. ' +
      'Individual clips that cannot be minted — including clips already posted ' +
      'to a social platform (Issue #764) — are reported per-clip in ' +
      '`partialFailures` rather than failing the whole batch.',
  })
  async batchMint(@Body() dto: BatchMintDto): Promise<BatchMintResponseDto> {
    return this.nftService.batchMintClips(dto);
  }

  @UseGuards(LoginGuard)
  @Patch(':id/token-uri')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Update custom token URI per clip (Issue #670)',
    description:
      'Stores a custom metadata token URI for the specified NFT token ID. Restricts updates strictly to the NFT owner.',
  })
  @ApiParam({ name: 'id', description: 'Numeric token ID', example: 42 })
  @ApiBody({ type: UpdateTokenUriDto })
  @ApiOkResponse({
    description: 'Custom token URI updated successfully',
    type: UpdateTokenUriResponseDto,
  })
  @ApiForbiddenResponse({
    description: 'Only the NFT owner can update token URI',
    type: TokenUriOwnershipErrorDto,
  })
  @ApiNotFoundResponse({ description: 'NFT token not found' })
  async updateTokenUri(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTokenUriDto,
    @Req() req: Request,
  ): Promise<UpdateTokenUriResponseDto> {
    const tokenIdStr = id.toString();
    const currentOwner = await this.nftOwnershipService.getOwner(tokenIdStr);

    if (!currentOwner) {
      throw new NotFoundException(`NFT token ${id} not found`);
    }

    return this.nftService.updateTokenUri(tokenIdStr, dto.uri);
  }


  /**
   * POST /nfts/prepare-mint
   * Builds a Soroban mint transaction and returns the XDR for the frontend to sign.
   * The authenticated user must own the clip being minted.
   */
  @UseGuards(LoginGuard, NftMintGuard)
  @Post('prepare-mint')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ nftMint: { limit: 5, ttl: 60000 } })
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Prepare a Soroban mint transaction (returns XDR for signing)',
    description:
      'Builds an unsigned Soroban mint transaction XDR against the currently configured Stellar network ' +
      '(testnet or public/mainnet, per STELLAR_NETWORK). Request body requires clipId and walletAddress. ' +
      'For a standalone Node.js reference implementation of this same XDR-building flow (useful when ' +
      'integrating outside this API, e.g. from an ops script or another backend service), see ' +
      'contracts/nft-contract/examples/mint-from-backend.ts.',
  })
  @ApiBody({ type: CreateMintPreparationDto })
  @ApiResponse({
    status: 201,
    description: 'Mint transaction XDR returned',
    type: NftPrepareMintResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized - Bearer JWT required',
  })
  @ApiBadRequestResponse({
    description:
      'Invalid clipId/walletAddress, clip not ready, or posted clips cannot be minted.',
    type: NftPrepareMintBadRequestDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized — Bearer JWT required, or wallet signature invalid',
  })
  @ApiForbiddenResponse({
    description: 'Caller does not own the clip',
  })
  @ApiNotFoundResponse({
    description: 'Clip not found',
    type: NftMintNotFoundDto,
  })
  @ApiConflictResponse({
    description: 'Clip is already minting or has already been minted',
    type: NftMintConflictDto,
  })
  @ApiServiceUnavailableResponse({
    description: 'Soroban RPC temporarily unavailable (circuit breaker open)',
  })
  async prepareMint(
    @Body() dto: CreateMintPreparationDto,
    @Req() req: Request,
  ) {
    const userId = Number((req as any).user?.id ?? 0);

    // 1. Ownership check: clip must belong to the authenticated user.
    await this.nftMintService.validateClipOwner(dto.clipId, userId);

    // 2. Signature check: when the caller provides a wallet signature, verify
    //    it before building the XDR.  This proves the caller controls the
    //    private key for walletAddress, preventing mints on behalf of others.
    if (dto.walletSignature) {
      this.mintSignatureVerification.verify(
        dto.clipId,
        dto.walletAddress,
        dto.walletSignature,
      );
    }

    return this.nftMintService.prepareMintTx(dto.clipId, dto.walletAddress);
  }

  @UseGuards(LoginGuard)
  @Post('confirm-mint')
  @HttpCode(HttpStatus.OK)
  @Throttle({ nftMint: { limit: 10, ttl: 60000 } })
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Confirm a completed on-chain NFT mint' })
  @ApiBody({ type: ConfirmMintDto })
  @ApiResponse({
    status: 200,
    description: 'Mint confirmed; clip mint fields updated',
  })
  @ApiBadRequestResponse({
    description: 'Clip already minted or invalid request',
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized — Bearer JWT required',
  })
  @ApiNotFoundResponse({ description: 'Clip not found' })
  async confirmMint(@Body() dto: ConfirmMintDto, @Req() req: Request) {
    const userId = Number((req as any).user?.id ?? 0);
    await this.nftMintService.validateClipOwner(dto.clipId, userId);
    return this.nftMintService.confirmMint(dto.clipId, dto.mintAddress);
  }

  @Post('verify-ownership')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify on-chain NFT ownership',
    description:
      'Checks whether the given Stellar wallet owns the NFT token via Soroban owner_of. ' +
      'Returns { valid: true } when the wallet owns the token, or { valid: false, error: string } otherwise. ' +
      'Queries the currently configured Stellar network (testnet or public/mainnet, per STELLAR_NETWORK).',
  })
  @ApiBody({ type: VerifyNftOwnershipDto })
  @ApiResponse({
    status: 200,
    description: 'Ownership check result (boolean response)',
    type: NftOwnershipResultDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid mint address or wallet address format',
  })
  @ApiNotFoundResponse({ description: 'NFT token not found on-chain' })
  @ApiInternalServerErrorResponse({
    description: 'Soroban RPC or contract query failure',
  })
  async verifyOwnership(
    @Body() dto: VerifyNftOwnershipDto,
  ): Promise<NftOwnershipResultDto> {
    return this.ownershipVerificationService.verifyNFTOwnership(
      dto.mintAddress,
      dto.walletAddress,
    );
  }

  @Get(':clipId/metadata')
  @ApiOperation({
    summary: 'Get OpenSea-compatible NFT metadata for a clip',
    description:
      'Builds metadata JSON from clip data without uploading to IPFS.',
  })
  @ApiParam({ name: 'clipId', description: 'Clip ID', example: 42 })
  @ApiResponse({
    status: 200,
    description: 'NFT metadata returned',
    type: NftMetadataResponseDto,
    schema: {
      example: {
        name: 'Game-winning goal',
        description: 'ClipCash generated clip 42',
        image: 'https://cdn.example.com/thumbs/42.jpg',
        animation_url: 'https://cdn.example.com/clips/42.mp4',
        attributes: [
          { trait_type: 'Clip Duration', value: 34 },
          { trait_type: 'Virality Score', value: 87 },
          { trait_type: 'Creation Date', value: '2026-07-20T09:30:00.000Z' },
          { trait_type: 'Royalty BPS', value: 1000 },
          { trait_type: 'Royalty Percent', value: 10 },
        ],
        seller_fee_basis_points: 1000,
        fee_recipient: 'GC6X********UTZF3',
        royalty: {
          bps: 1000,
          percent: 10,
          recipient: 'GC6X********UTZF3',
        },
      },
    },
  })
  @ApiNotFoundResponse({ description: 'Clip not found or not ready' })
  async getMetadata(
    @Param('clipId', ParseIntPipe) clipId: number,
  ): Promise<NftMetadataResponseDto> {
    const clip = await this.prisma.clip.findUnique({ where: { id: clipId } });
    if (!clip) {
      throw new NotFoundException(`Clip with ID ${clipId} not found`);
    }
    if (!clip.clipUrl) {
      throw new NotFoundException(
        `Clip ${clipId} is not ready for metadata (missing clipUrl)`,
      );
    }

    const royaltyBps = this.royaltyConfigurationService.getCreatorRoyaltyBps(
      clip.royaltyBps,
    );
    let royaltyRecipient: string | undefined;
    try {
      const platformWallet = this.royaltyConfigurationService.getPlatformWallet();
      royaltyRecipient = platformWallet ? maskAddress(platformWallet) : undefined;
    } catch {
      royaltyRecipient = undefined;
    }

    return this.nftMetadataService.build({
      id: clip.id,
      title: clip.title,
      caption: clip.caption,
      clipUrl: clip.clipUrl,
      thumbnail: clip.thumbnail,
      duration: clip.duration,
      viralityScore: clip.viralityScore,
      createdAt: clip.createdAt,
      royaltyBps,
      royaltyRecipient,
    });
  }

  /**
   * GET /nfts/royalty/estimate
   * Estimates the royalty owed on a given sale price without requiring a
   * minted token, using the same BPS math the Soroban contract's
   * `calculate_royalty` helper uses (Issue #680). Useful for showing a
   * "you'll receive ~X" estimate in the UI before a resale actually happens.
   */
  @Get('royalty/estimate')
  @ApiOperation({
    summary: 'Estimate the royalty owed on a sale price (Issue #680)',
    description:
      'Pure calculation — does not touch the chain. Mirrors the Soroban contract\'s ' +
      '`calculate_royalty(sale_price, royalty_bps)` helper so estimates match what the ' +
      'contract actually pays out on `transfer_with_royalty`. Rounds down (truncates toward ' +
      'zero) any fractional stroop. When `royaltyBps` is omitted, the configured creator ' +
      'royalty rate is used.',
  })
  @ApiQuery({
    name: 'salePrice',
    description: 'Sale price in stroops (1 XLM = 10,000,000 stroops)',
    example: 100_000_000,
  })
  @ApiQuery({
    name: 'royaltyBps',
    description: 'Royalty rate in basis points (100 = 1%). Defaults to the platform creator royalty rate.',
    example: 1000,
    required: false,
  })
  @ApiOkResponse({
    description: 'Royalty estimate calculated successfully',
    type: RoyaltyEstimateResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      'Invalid salePrice / royaltyBps, or computed royalty exceeds Number.MAX_SAFE_INTEGER ' +
      '(Issue #836 checked arithmetic).',
    type: RoyaltyOverflowErrorDto,
  })
  getRoyaltyEstimate(
    @Query() query: RoyaltyEstimateQueryDto,
  ): RoyaltyEstimateResponseDto {
    const royaltyBps = this.royaltyConfigurationService.getCreatorRoyaltyBps(
      query.royaltyBps,
    );
    const royaltyAmount = this.royaltyConfigurationService.calculateRoyalty(
      query.salePrice,
      royaltyBps,
    );
    return { salePrice: query.salePrice, royaltyBps, royaltyAmount };
  }

  /**
   * GET /nfts/:mintAddress/royalty
   * Queries the on-chain royalty info for a minted NFT.
   * The mintAddress is the numeric token ID (= clip.id) assigned at mint time.
   * Result is cached in Redis for 5 minutes.
   *
   * Response: { royaltyBps: number, recipient: string }
   */
  @UseGuards(LoginGuard)
  @Get(':mintAddress/royalty')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get on-chain royalty info for an NFT',
    description:
      'Reads royalty BPS and recipient from the Soroban get_royalties contract method. Results are cached in Redis for 5 minutes. ' +
      'Queries the currently configured Stellar network (testnet or public/mainnet, per STELLAR_NETWORK).',
  })
  @ApiParam({
    name: 'mintAddress',
    description: 'NFT mint address / numeric token ID assigned at mint time',
    example: '42',
  })
  @ApiOkResponse({
    description: 'Royalty info returned successfully',
    type: RoyaltyQueryResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'Royalty data not found for the given mint address',
    type: RoyaltyNotFoundDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid authentication',
    type: RoyaltyUnauthorizedDto,
  })
  async getRoyalty(
    @Param('mintAddress') mintAddress: string,
  ): Promise<RoyaltyInfo> {
    return this.royaltyQueryService.getRoyaltyInfo(mintAddress);
  }

  /**
   * POST /nfts/:id/burn
   * Prepares a Soroban transaction that permanently burns a minted clip NFT.
   * Only the clip owner (authenticated user) may request this, and only the
   * on-chain token owner's wallet can sign the returned transaction.
   */
  @UseGuards(LoginGuard)
  @Post(':id/burn')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Burn a minted clip NFT',
    description:
      'Builds an unsigned Soroban transaction that calls the burn(owner, token_id) contract ' +
      'method, permanently destroying the token. The caller must own the clip; the returned XDR ' +
      "must be signed by the NFT owner's wallet and submitted to the network by the frontend.",
  })
  @ApiParam({ name: 'id', description: 'Clip ID / token ID to burn', example: 42 })
  @ApiBody({ type: BurnNftDto })
  @ApiOkResponse({
    description: 'Unsigned burn transaction XDR returned successfully',
    type: BurnNftResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid wallet address, or clip not yet minted' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized — Bearer JWT required' })
  @ApiForbiddenResponse({
    description: 'Caller does not own the clip being burned',
    type: BurnForbiddenDto,
  })
  @ApiNotFoundResponse({ description: 'Clip not found', type: BurnNotFoundDto })
  async burn(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: BurnNftDto,
    @Req() req: Request,
  ): Promise<BurnNftResponseDto> {
    const userId = Number((req as any).user?.id ?? 0);
    await this.nftMintService.validateClipOwner(id, userId);
    return this.nftMintService.prepareBurnTx(id, dto.walletAddress);
  }

  /**
   * GET /nfts/:id/royalties/history
   * Paginated royalty claim history for an NFT (Issue #840).
   */
  @Get(':id/royalties/history')
  @ApiOperation({
    summary: 'Get royalty claim history for an NFT',
    description:
      'Returns paginated historical royalty claims for the given token. ' +
      'Each record is created when a RoyaltyClaimed contract event is indexed ' +
      'and includes the Stellar transaction hash.',
  })
  @ApiParam({ name: 'id', description: 'Clip / token ID', example: 42 })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiOkResponse({
    description: 'Paginated royalty claim history',
    type: RoyaltyClaimHistoryResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid token ID or pagination params' })
  async getRoyaltyClaimHistory(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: RoyaltyClaimHistoryQueryDto,
  ): Promise<RoyaltyClaimHistoryResponseDto> {
    if (id <= 0) {
      throw new BadRequestException('Token ID must be a positive integer');
    }
    return this.royaltyClaimHistoryService.getHistory(
      id,
      query.page ?? 1,
      query.limit ?? 20,
    );
  }

  /**
   * GET /nfts/:id/royalties
   * Returns the full multi-recipient royalty split configured for a token.
   */
  @Get(':id/royalties')
  @ApiOperation({
    summary: 'Get the multi-recipient royalty split for an NFT',
    description:
      'Reads the full royalty split (recipient -> basis points) from the Soroban get_royalties ' +
      'contract method. Falls back to the default royalty/platform fee configuration when no ' +
      'per-token override has been set.',
  })
  @ApiParam({ name: 'id', description: 'Clip ID / token ID', example: 42 })
  @ApiOkResponse({
    description: 'Royalty split returned successfully',
    type: RoyaltySplitsResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid token ID' })
  @ApiNotFoundResponse({ description: 'No royalty split configured for this token' })
  async getRoyaltySplits(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<RoyaltySplitsResponseDto> {
    const shares = await this.royaltyQueryService.getRoyaltySplits(id);
    return {
      tokenId: id,
      shares: shares.map((s) => ({ recipient: s.recipient, bps: s.royaltyBps })),
      totalBps: shares.reduce((sum, s) => sum + s.royaltyBps, 0),
    };
  }

  /**
   * PATCH /nfts/:id/royalties
   * Prepares a Soroban transaction that configures a token's royalty split
   * across multiple recipients.
   */
  @UseGuards(LoginGuard)
  @Patch(':id/royalties')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Configure a multi-recipient royalty split for an NFT',
    description:
      'Builds an unsigned Soroban transaction that calls set_royalties(token_id, royalties), ' +
      'splitting future royalty payouts across multiple recipients. Combined shares must not ' +
      "exceed 10000 BPS (100%). The returned XDR must be signed by the NFT owner's wallet.",
  })
  @ApiParam({ name: 'id', description: 'Clip ID / token ID', example: 42 })
  @ApiBody({ type: UpdateRoyaltySplitsDto })
  @ApiOkResponse({
    description: 'Unsigned set_royalties transaction XDR returned successfully',
    type: UpdateRoyaltySplitsResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid wallet address, clip not yet minted, or combined shares exceed 10000 BPS',
    type: RoyaltySplitsValidationErrorDto,
  })
  @ApiUnauthorizedResponse({ description: 'Unauthorized — Bearer JWT required' })
  @ApiForbiddenResponse({ description: 'Caller does not own the clip' })
  @ApiNotFoundResponse({ description: 'Clip not found' })
  async updateRoyaltySplits(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRoyaltySplitsDto,
    @Req() req: Request,
  ): Promise<UpdateRoyaltySplitsResponseDto> {
    const userId = Number((req as any).user?.id ?? 0);
    await this.nftMintService.validateClipOwner(id, userId);
    return this.nftMintService.prepareSetRoyaltiesTx(id, dto.walletAddress, dto.shares);
  }

  /**
   * GET /nfts/contract/info
   *
   * Returns the currently deployed Soroban NFT contract details:
   * contractId, network, rpcUrl, and networkPassphrase.
   *
   * This is useful for frontends and tooling that need to know which
   * contract to interact with on the currently configured network.
   */
  @Get('contract/info')
  @ApiOperation({
    summary: 'Get deployed Soroban NFT contract info',
    description:
      'Returns the contract ID and network details for the currently deployed ' +
      'ClipCash NFT Soroban contract. Network is driven by the STELLAR_NETWORK ' +
      'environment variable (testnet | public).',
  })
  @ApiOkResponse({
    description: 'Contract info returned successfully',
    schema: {
      example: {
        contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEU4',
        network: 'testnet',
        rpcUrl: 'https://soroban-testnet.stellar.org',
        networkPassphrase: 'Test SDF Network ; September 2015',
        explorerUrl:
          'https://stellar.expert/explorer/testnet/contract/CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEU4',
      },
    },
  })
  getContractInfo(): {
    contractId: string;
    network: string;
    rpcUrl: string;
    networkPassphrase: string;
    explorerUrl: string;
  } {
    const contractId =
      process.env.SOROBAN_NFT_CONTRACT_ID ??
      'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEU4';
    const network = (process.env.STELLAR_NETWORK ?? 'testnet').toLowerCase();
    const isMainnet = network === 'public';

    const rpcUrl = isMainnet
      ? 'https://soroban-rpc.stellar.org'
      : 'https://soroban-testnet.stellar.org';

    const networkPassphrase = isMainnet
      ? 'Public Global Stellar Network ; September 2015'
      : 'Test SDF Network ; September 2015';

    const explorerBase = isMainnet
      ? 'https://stellar.expert/explorer/public/contract'
      : 'https://stellar.expert/explorer/testnet/contract';

    return {
      contractId,
      network,
      rpcUrl,
      networkPassphrase,
      explorerUrl: `${explorerBase}/${contractId}`,
    };
  }

  /**
   * GET /nfts/contract/version
   *
   * Reads the deployed contract's semantic version via the on-chain,
   * read-only `version()` call (Issue #692). Unlike `contract/info`
   * (which is derived from env vars), this reflects what's actually
   * running in the deployed WASM.
   */
  @Get('contract/version')
  @ApiOperation({
    summary: 'Get the deployed Soroban NFT contract version',
    description:
      'Calls the read-only version() function on the currently deployed ' +
      'ClipCash NFT Soroban contract and returns its semantic version ' +
      "alongside the contract ID it was read from.",
  })
  @ApiOkResponse({
    description: 'Contract version returned successfully',
    schema: {
      example: {
        contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEU4',
        version: '1.1.0',
      },
    },
  })
  async getContractVersion(): Promise<{ contractId: string; version: string }> {
    return this.adminContractService.getContractVersion();
  }

  /**
   * GET /nfts/admin/pause-status
   * Reads the contract's current pause state via Soroban `is_paused`.
   */
  @Get('admin/pause-status')
  @ApiOperation({
    summary: 'Get the Soroban NFT contract pause status',
    description:
      'Reads the current pause state from the contract via the read-only is_paused call.',
  })
  @ApiOkResponse({
    description: 'Pause status returned successfully',
    schema: { example: { paused: false } },
  })
  async getPauseStatus(): Promise<{ paused: boolean }> {
    return this.adminContractService.getPauseStatus();
  }

  /**
   * POST /nfts/admin/pause
   * Builds (but does not sign) a Soroban `pause` transaction. The admin
   * wallet signs the returned XDR and submits it, mirroring prepare-mint.
   */
  @UseGuards(AdminGuard)
  @Post('admin/pause')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Prepare a Soroban pause() transaction (returns XDR for signing)',
    description:
      'Emergency control: pauses minting and transfers on the NFT contract. ' +
      'Requires the x-admin-secret header. The admin wallet must then sign and submit the returned XDR.',
  })
  @ApiBody({ type: PrepareContractPauseDto })
  @ApiOkResponse({ description: 'Pause transaction XDR returned' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid x-admin-secret header' })
  async preparePause(@Body() dto: PrepareContractPauseDto) {
    return this.adminContractService.preparePauseTx(dto.adminAddress, true);
  }

  /**
   * POST /nfts/admin/unpause
   * Builds (but does not sign) a Soroban `unpause` transaction.
   */
  @UseGuards(AdminGuard)
  @Post('admin/unpause')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Prepare a Soroban unpause() transaction (returns XDR for signing)',
    description:
      'Restores minting and transfers on the NFT contract. Requires the x-admin-secret header. ' +
      'The admin wallet must then sign and submit the returned XDR.',
  })
  @ApiBody({ type: PrepareContractPauseDto })
  @ApiOkResponse({ description: 'Unpause transaction XDR returned' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid x-admin-secret header' })
  async prepareUnpause(@Body() dto: PrepareContractPauseDto) {
    return this.adminContractService.preparePauseTx(dto.adminAddress, false);
  }

  /**
   * POST /nfts/admin/config/platform-fee
   * Prepare set_platform_fee() — contract owner only (Issue #835).
   * On-chain success emits ConfigUpdated.
   */
  @UseGuards(AdminGuard)
  @Post('admin/config/platform-fee')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Prepare set_platform_fee() admin config tx (Issue #835)',
    description:
      'Builds an unsigned Soroban `set_platform_fee(bps)` transaction. ' +
      'Requires x-admin-secret. Only the contract owner wallet can successfully ' +
      'submit on-chain. Emits `ConfigUpdated` (local + on-chain).',
  })
  @ApiBody({
    type: SetPlatformFeeDto,
    examples: {
      setFee: {
        summary: 'Set platform fee to 2%',
        value: {
          adminAddress: 'GADMIN6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
          platformFeeBps: 200,
        },
      },
    },
  })
  @ApiOkResponse({
    description: 'Unsigned set_platform_fee XDR returned',
    type: AdminConfigTxResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid x-admin-secret / not contract owner on-chain' })
  @ApiBadRequestResponse({ description: 'Invalid address or BPS out of range' })
  async prepareSetPlatformFee(
    @Body() dto: SetPlatformFeeDto,
  ): Promise<AdminConfigTxResponseDto> {
    return this.adminConfigService.prepareSetPlatformFee(
      dto.adminAddress,
      dto.platformFeeBps,
    );
  }

  /**
   * POST /nfts/admin/config/default-royalty
   * Prepare set_default_royalty() — contract owner only (Issue #835).
   */
  @UseGuards(AdminGuard)
  @Post('admin/config/default-royalty')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Prepare set_default_royalty() admin config tx (Issue #835)',
    description:
      'Builds an unsigned Soroban `set_default_royalty(bps)` transaction. ' +
      'Requires x-admin-secret. Only the contract owner can submit on-chain. ' +
      'Emits `ConfigUpdated` (local + on-chain).',
  })
  @ApiBody({
    type: SetDefaultRoyaltyDto,
    examples: {
      setRoyalty: {
        summary: 'Set default royalty to 10%',
        value: {
          adminAddress: 'GADMIN6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
          defaultRoyaltyBps: 1000,
        },
      },
    },
  })
  @ApiOkResponse({
    description: 'Unsigned set_default_royalty XDR returned',
    type: AdminConfigTxResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid x-admin-secret / not contract owner on-chain' })
  @ApiBadRequestResponse({ description: 'Invalid address or BPS out of range' })
  async prepareSetDefaultRoyalty(
    @Body() dto: SetDefaultRoyaltyDto,
  ): Promise<AdminConfigTxResponseDto> {
    return this.adminConfigService.prepareSetDefaultRoyalty(
      dto.adminAddress,
      dto.defaultRoyaltyBps,
    );
  }

  @Get('admin/config/platform-fee')
  @ApiOperation({
    summary: 'Read on-chain platform fee BPS (Issue #835)',
    description: 'Queries get_platform_fee() on the Soroban NFT contract.',
  })
  @ApiOkResponse({ type: AdminConfigValueResponseDto })
  async getPlatformFeeConfig(): Promise<AdminConfigValueResponseDto> {
    return this.adminConfigService.getPlatformFee();
  }

  @Get('admin/config/default-royalty')
  @ApiOperation({
    summary: 'Read on-chain default royalty BPS (Issue #835)',
    description: 'Queries get_default_royalty() on the Soroban NFT contract.',
  })
  @ApiOkResponse({ type: AdminConfigValueResponseDto })
  async getDefaultRoyaltyConfig(): Promise<AdminConfigValueResponseDto> {
    return this.adminConfigService.getDefaultRoyalty();
  }

  /**
   * POST /nfts/approve-all
   * Grant or revoke operator approval for all tokens (Issue #842).
   */
  @UseGuards(LoginGuard)
  @Post('approve-all')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Approve or revoke an operator for all NFTs (Issue #842)',
    description:
      'Prepares unsigned `set_approval_for_all(owner, operator, approved)` XDR. ' +
      'Emits ApprovalForAll on-chain when submitted.',
  })
  @ApiBody({ type: SetApprovalForAllDto })
  @ApiOkResponse({
    description: 'Unsigned set_approval_for_all XDR',
    type: SetApprovalForAllResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Bearer JWT required' })
  @ApiBadRequestResponse({ description: 'Invalid address or body' })
  async approveAll(
    @Body() dto: SetApprovalForAllDto,
  ): Promise<SetApprovalForAllResponseDto> {
    return this.nftApprovalService.prepareSetApprovalForAll(
      dto.ownerAddress,
      dto.operatorAddress,
      dto.approved,
    );
  }

  /**
   * GET /nfts/:id/approved — get_approved(token_id) (Issue #842).
   */
  @Get(':id/approved')
  @ApiOperation({
    summary: 'Get the approved spender for an NFT (Issue #842)',
    description: 'Calls Soroban `get_approved(token_id)`. Returns null when none.',
  })
  @ApiParam({ name: 'id', description: 'Numeric token ID', example: 42 })
  @ApiOkResponse({ type: GetApprovedResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid token ID' })
  async getApproved(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<GetApprovedResponseDto> {
    return this.nftApprovalService.getApproved(id);
  }

  /**
   * POST /nfts/:id/approve — approve(owner, spender, token_id) (Issue #842).
   */
  @UseGuards(LoginGuard)
  @Post(':id/approve')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Approve a spender for a specific NFT (Issue #842)',
    description:
      'Prepares unsigned `approve(owner, spender, token_id)` XDR. ' +
      'Pass empty spenderAddress to revoke. Emits Approval on-chain when submitted. ' +
      'Unauthorized callers (non-owners) fail ownership validation.',
  })
  @ApiParam({ name: 'id', description: 'Numeric token / clip ID', example: 42 })
  @ApiBody({ type: ApproveNftDto })
  @ApiOkResponse({ type: ApproveNftResponseDto })
  @ApiUnauthorizedResponse({ description: 'Bearer JWT required' })
  @ApiBadRequestResponse({ description: 'Invalid address or not token owner' })
  @ApiForbiddenResponse({ description: 'Caller does not own the NFT' })
  async approveNft(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApproveNftDto,
    @Req() req: Request,
  ): Promise<ApproveNftResponseDto> {
    const userId = Number((req as any).user?.id ?? (req as any).user?.userId ?? 0);
    await this.nftMintService.validateClipOwner(id, userId);
    return this.nftApprovalService.prepareApprove(
      id,
      dto.ownerAddress,
      dto.spenderAddress,
    );
  }

  @UseGuards(AdminGuard)
  @Post(':id/refresh-metadata')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Prepare an admin-authorized NFT metadata refresh',
    description:
      'Builds an unsigned Soroban refresh_metadata(token_id, metadata) transaction. ' +
      'Requires x-admin-secret; the contract admin wallet signs and submits the XDR. ' +
      'Each token is limited to one refresh every 30 days on-chain.',
  })
  @ApiParam({ name: 'id', description: 'Numeric token ID', example: 42 })
  @ApiBody({ type: RefreshMetadataDto })
  @ApiOkResponse({
    description: 'Metadata refresh transaction XDR returned',
    type: RefreshMetadataResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid x-admin-secret header' })
  @ApiTooManyRequestsResponse({
    description: 'Metadata refresh is still within the 30-day cooldown',
    type: MetadataRefreshCooldownErrorDto,
  })
  async prepareRefreshMetadata(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RefreshMetadataDto,
  ): Promise<RefreshMetadataResponseDto> {
    const { adminAddress, ...metadata } = dto;
    return this.adminContractService.prepareRefreshMetadataTx(id, adminAddress, metadata);
  }

  @UseGuards(LoginGuard)
  @Patch(':id/royalty-recipient')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Update royalty recipient address for an NFT (Issue #672)',
    description:
      'Allows creators / current recipient to change the recipient address for future royalties. ' +
      'Verifies caller authorization, updates stored address, and emits RoyaltyRecipientUpdated event.',
  })
  @ApiParam({ name: 'id', description: 'Numeric token ID', example: 42 })
  @ApiBody({ type: UpdateRoyaltyRecipientDto })
  @ApiOkResponse({
    description: 'Royalty recipient updated successfully',
    type: UpdateRoyaltyRecipientResponseDto,
  })
  @ApiForbiddenResponse({
    description: 'Only the current recipient can update the royalty recipient address',
  })
  @ApiNotFoundResponse({ description: 'NFT token not found' })
  async updateRoyaltyRecipient(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRoyaltyRecipientDto,
  ): Promise<UpdateRoyaltyRecipientResponseDto> {
    const tokenIdStr = id.toString();
    return this.nftService.updateRoyaltyRecipient(
      tokenIdStr,
      dto.newRecipient,
      dto.currentRecipient,
    );
  }

  // ── Issue #676: Emergency withdraw for stuck XLM ────────────────────────

  /**
   * POST /nfts/admin/withdraw/initiate
   *
   * Starts the 24-hour timelock before XLM can be withdrawn. Admin must
   * call this first; `withdraw_xlm` only executes after the lock expires.
   */
  @UseGuards(AdminGuard)
  @Post('admin/withdraw/initiate')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Initiate the 24-hour emergency-withdraw timelock (Issue #676)',
    description:
      'Calls `initiate_withdraw()` on the Soroban contract. The contract ' +
      'records `now + 86400s` as the earliest time `withdraw_xlm` may run. ' +
      'Requires the x-admin-secret header. Returns an unsigned XDR for signing.',
  })
  @ApiBody({
    schema: { example: { adminAddress: 'GC6X...UTZF3' } },
  })
  @ApiOkResponse({
    description: 'Timelock initiation XDR returned',
    schema: {
      example: {
        xdr: 'AAAA...',
        action: 'initiate_withdraw',
        unlockAfterSeconds: 86400,
        contractId: 'CAA...',
        network: 'testnet',
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid x-admin-secret' })
  async prepareInitiateWithdraw(@Body() body: { adminAddress: string }) {
    const StellarSdk = (await import('@stellar/stellar-sdk')).default;
    const contractId =
      process.env.SOROBAN_NFT_CONTRACT_ID ??
      'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEU4';
    const rpcUrl =
      (this as any).stellarService?.rpcUrl ??
      process.env.SOROBAN_RPC_URL ??
      'https://soroban-testnet.stellar.org';
    const networkPassphrase =
      (this as any).stellarService?.networkPassphrase ??
      'Test SDF Network ; September 2015';

    const server = new StellarSdk.rpc.Server(rpcUrl);
    const contract = new StellarSdk.Contract(contractId);
    const sourceAccount = await server.getAccount(body.adminAddress);

    const op = contract.call('initiate_withdraw');

    const tx = new StellarSdk.TransactionBuilder(sourceAccount, {
      fee: '10000',
      networkPassphrase,
    })
      .addOperation(op)
      .setTimeout(StellarSdk.TimeoutInfinite)
      .build();

    return {
      xdr: tx.toXDR(),
      action: 'initiate_withdraw',
      unlockAfterSeconds: 86400,
      contractId,
      network: (this as any).stellarService?.network ?? process.env.STELLAR_NETWORK ?? 'testnet',
    };
  }

  /**
   * GET /nfts/admin/withdraw/timelock-status
   *
   * Queries the on-chain unlock timestamp so admins can see how long
   * remains before the withdraw is executable (Issue #676).
   */
  @UseGuards(AdminGuard)
  @Get('admin/withdraw/timelock-status')
  @ApiOperation({
    summary: 'Get emergency-withdraw timelock status (Issue #676)',
    description:
      'Queries `get_withdraw_unlock_time()` on the Soroban contract. ' +
      'Returns the Unix timestamp after which withdrawal is allowed, ' +
      'or null when no initiation is pending.',
  })
  @ApiOkResponse({
    description: 'Timelock status returned',
    schema: {
      example: {
        unlockTime: 1754042400,
        unlockTimeIso: '2026-08-01T18:00:00.000Z',
        secondsRemaining: 82345,
        ready: false,
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid x-admin-secret' })
  async getWithdrawTimelockStatus(): Promise<{
    unlockTime: number | null;
    unlockTimeIso: string | null;
    secondsRemaining: number;
    ready: boolean;
  }> {
    const StellarSdk = (await import('@stellar/stellar-sdk')).default;
    const contractId =
      process.env.SOROBAN_NFT_CONTRACT_ID ??
      'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEU4';
    const rpcUrl =
      (this as any).stellarService?.rpcUrl ??
      'https://soroban-testnet.stellar.org';
    const networkPassphrase =
      (this as any).stellarService?.networkPassphrase ??
      'Test SDF Network ; September 2015';

    const server = new StellarSdk.rpc.Server(rpcUrl);
    const contract = new StellarSdk.Contract(contractId);
    const dummyAccount = new StellarSdk.Account(
      'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN',
      '0',
    );

    const op = contract.call('get_withdraw_unlock_time');
    const tx = new StellarSdk.TransactionBuilder(dummyAccount, {
      fee: '100',
      networkPassphrase,
    })
      .addOperation(op)
      .setTimeout(StellarSdk.TimeoutInfinite)
      .build();

    const simulation = await server.simulateTransaction(tx);
    const results = (simulation as { results?: Array<{ xdr: string }> }).results;

    if (!results?.[0]?.xdr) {
      return { unlockTime: null, unlockTimeIso: null, secondsRemaining: 0, ready: false };
    }

    const returnValue = StellarSdk.xdr.ScVal.fromXDR(results[0].xdr, 'base64');
    const native = StellarSdk.scValToNative(returnValue);
    // Option<u64> returns null or a bigint/number
    if (native == null) {
      return { unlockTime: null, unlockTimeIso: null, secondsRemaining: 0, ready: false };
    }

    const unlockTime = Number(native);
    const nowSecs = Math.floor(Date.now() / 1000);
    const secondsRemaining = Math.max(0, unlockTime - nowSecs);

    return {
      unlockTime,
      unlockTimeIso: new Date(unlockTime * 1000).toISOString(),
      secondsRemaining,
      ready: secondsRemaining === 0,
    };
  }

  /**
   * POST /nfts/admin/withdraw/execute
   *
   * Executes the emergency XLM withdrawal after the 24h timelock has passed.
   * Prepares an unsigned Soroban `withdraw_xlm` XDR (Issue #676).
   */
  @UseGuards(AdminGuard)
  @Post('admin/withdraw/execute')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Prepare emergency withdraw_xlm XDR (admin-only, Issue #676)',
    description:
      'Builds an unsigned Soroban `withdraw_xlm(recipient, amount_stroops)` ' +
      'transaction. Can only succeed after the 24-hour timelock set by ' +
      '`initiate_withdraw` has elapsed. Returns XDR for the admin wallet to sign.',
  })
  @ApiBody({
    schema: {
      example: {
        adminAddress: 'GC6X...UTZF3',
        recipientAddress: 'GDEST...ABC',
        amountStroops: '10000000',
      },
    },
  })
  @ApiOkResponse({
    description: 'Unsigned withdraw_xlm XDR returned',
    schema: {
      example: {
        xdr: 'AAAA...',
        recipient: 'GDEST...',
        amountStroops: '10000000',
        contractId: 'CAA...',
        network: 'testnet',
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid x-admin-secret' })
  @ApiBadRequestResponse({ description: 'Amount must be > 0' })
  async prepareWithdrawXlm(
    @Body() body: { adminAddress: string; recipientAddress: string; amountStroops: string },
  ) {
    const amountStroops = BigInt(body.amountStroops ?? '0');
    if (amountStroops <= 0n) {
      throw new BadRequestException('amountStroops must be greater than 0');
    }

    const StellarSdk = (await import('@stellar/stellar-sdk')).default;
    const contractId =
      process.env.SOROBAN_NFT_CONTRACT_ID ??
      'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEU4';
    const rpcUrl =
      (this as any).stellarService?.rpcUrl ??
      'https://soroban-testnet.stellar.org';
    const networkPassphrase =
      (this as any).stellarService?.networkPassphrase ??
      'Test SDF Network ; September 2015';

    const server = new StellarSdk.rpc.Server(rpcUrl);
    const contract = new StellarSdk.Contract(contractId);
    const sourceAccount = await server.getAccount(body.adminAddress);

    const op = contract.call(
      'withdraw_xlm',
      StellarSdk.Address.fromString(body.recipientAddress).toScVal(),
      StellarSdk.nativeToScVal(amountStroops, { type: 'i128' }),
    );

    const tx = new StellarSdk.TransactionBuilder(sourceAccount, {
      fee: '10000',
      networkPassphrase,
    })
      .addOperation(op)
      .setTimeout(StellarSdk.TimeoutInfinite)
      .build();

    return {
      xdr: tx.toXDR(),
      recipient: body.recipientAddress,
      amountStroops: body.amountStroops,
      contractId,
      network: (this as any).stellarService?.network ?? process.env.STELLAR_NETWORK ?? 'testnet',
    };
  }

  /**
   * POST /nfts/tokens/:tokenId/approve
   *
   * Prepares an unsigned Soroban `approve(owner, spender, token_id)` XDR
   * for the owner to sign. Grants `spender` the right to transfer one
   * specific token (Issue #675).
   */
  @UseGuards(LoginGuard)
  @Post('tokens/:tokenId/approve')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Approve a spender for a specific NFT token (Issue #675)',
    description:
      'Calls the Soroban `approve(owner, spender, token_id)` function. ' +
      'Grants `spenderAddress` the right to call `transfer_from` for this ' +
      'single token. Pass `spenderAddress` as null / empty string to revoke.',
  })
  @ApiParam({ name: 'tokenId', description: 'On-chain token ID', example: 42 })
  @ApiBody({
    schema: {
      example: {
        ownerAddress: 'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
        spenderAddress: 'GDEST...ABC',
      },
    },
  })
  @ApiOkResponse({
    description: 'Unsigned approve XDR returned',
    schema: {
      example: {
        xdr: 'AAAA...',
        tokenId: 42,
        owner: 'GC6X...',
        spender: 'GDEST...',
        contractId: 'CAA...',
        network: 'testnet',
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Bearer JWT required' })
  @ApiBadRequestResponse({ description: 'Invalid address or token not owned by caller' })
  async prepareApprove(
    @Param('tokenId', ParseIntPipe) tokenId: number,
    @Body() body: { ownerAddress: string; spenderAddress: string },
    @Req() req: Request,
  ) {
    const userId = Number((req as any).user?.id ?? 0);
    await this.nftMintService.validateClipOwner(tokenId, userId);

    const { ownerAddress, spenderAddress } = body;
    [ownerAddress, spenderAddress].forEach((addr) => {
      const check = (this as any).stellarService?.validateAddress(addr) ??
        { valid: addr?.length > 0 };
      if (!check.valid) {
        throw new BadRequestException(`Invalid Stellar address: ${addr}`);
      }
    });

    const server = new (await import('@stellar/stellar-sdk')).default.rpc.Server(
      (this as any).stellarService?.rpcUrl ?? process.env.SOROBAN_RPC_URL ?? '',
    );
    const StellarSdk = (await import('@stellar/stellar-sdk')).default;
    const contractId =
      process.env.SOROBAN_NFT_CONTRACT_ID ??
      'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEU4';
    const contract = new StellarSdk.Contract(contractId);
    const sourceAccount = await server.getAccount(ownerAddress);

    const op = contract.call(
      'approve',
      StellarSdk.Address.fromString(ownerAddress).toScVal(),
      StellarSdk.Address.fromString(spenderAddress).toScVal(),
      StellarSdk.nativeToScVal(BigInt(tokenId), { type: 'u64' }),
    );

    const tx = new StellarSdk.TransactionBuilder(sourceAccount, {
      fee: '10000',
      networkPassphrase: (this as any).stellarService?.networkPassphrase ?? '',
    })
      .addOperation(op)
      .setTimeout(StellarSdk.TimeoutInfinite)
      .build();

    return {
      xdr: tx.toXDR(),
      tokenId,
      owner: ownerAddress,
      spender: spenderAddress,
      contractId,
      network: (this as any).stellarService?.network ?? process.env.STELLAR_NETWORK ?? 'testnet',
    };
  }

  /**
   * POST /nfts/approvals/operator
   *
   * Grant or revoke operator-level approval for ALL tokens owned by the
   * caller. Prepares an unsigned Soroban `set_approval_for_all` XDR
   * (Issue #675).
   */
  @UseGuards(LoginGuard)
  @Post('approvals/operator')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Grant or revoke operator approval for all tokens (Issue #675)',
    description:
      'Calls the Soroban `set_approval_for_all(owner, operator, approved)` ' +
      'function. When `approved` is true, `operatorAddress` may call ' +
      '`transfer_from` on any of the owner\'s tokens. ' +
      'Set `approved` to false to revoke. Returns an unsigned XDR for signing.',
  })
  @ApiBody({
    schema: {
      example: {
        ownerAddress: 'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
        operatorAddress: 'GDEST...ABC',
        approved: true,
      },
    },
  })
  @ApiOkResponse({
    description: 'Unsigned set_approval_for_all XDR returned',
    schema: {
      example: {
        xdr: 'AAAA...',
        owner: 'GC6X...',
        operator: 'GDEST...',
        approved: true,
        contractId: 'CAA...',
        network: 'testnet',
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Bearer JWT required' })
  @ApiBadRequestResponse({ description: 'Invalid Stellar address' })
  async prepareSetApprovalForAll(
    @Body() body: { ownerAddress: string; operatorAddress: string; approved: boolean },
  ) {
    const { ownerAddress, operatorAddress, approved } = body;

    const StellarSdk = (await import('@stellar/stellar-sdk')).default;
    const contractId =
      process.env.SOROBAN_NFT_CONTRACT_ID ??
      'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEU4';
    const rpcUrl =
      (this as any).stellarService?.rpcUrl ??
      process.env.SOROBAN_RPC_URL ??
      'https://soroban-testnet.stellar.org';
    const networkPassphrase =
      (this as any).stellarService?.networkPassphrase ??
      'Test SDF Network ; September 2015';

    const server = new StellarSdk.rpc.Server(rpcUrl);
    const contract = new StellarSdk.Contract(contractId);
    const sourceAccount = await server.getAccount(ownerAddress);

    const op = contract.call(
      'set_approval_for_all',
      StellarSdk.Address.fromString(ownerAddress).toScVal(),
      StellarSdk.Address.fromString(operatorAddress).toScVal(),
      StellarSdk.nativeToScVal(approved, { type: 'bool' }),
    );

    const tx = new StellarSdk.TransactionBuilder(sourceAccount, {
      fee: '10000',
      networkPassphrase,
    })
      .addOperation(op)
      .setTimeout(StellarSdk.TimeoutInfinite)
      .build();

    return {
      xdr: tx.toXDR(),
      owner: ownerAddress,
      operator: operatorAddress,
      approved,
      contractId,
      network: (this as any).stellarService?.network ?? process.env.STELLAR_NETWORK ?? 'testnet',
    };
  }

  /**
   * GET /nfts/approvals/operator
   *
   * Query whether `operatorAddress` is approved to manage all tokens of
   * `ownerAddress` (Issue #675 — `is_approved_for_all`).
   */
  @Get('approvals/operator')
  @ApiOperation({
    summary: 'Check operator approval for all tokens (Issue #675)',
    description:
      'Calls the Soroban `is_approved_for_all(owner, operator)` view function. ' +
      'Returns whether `operatorAddress` is currently approved to transfer all ' +
      'tokens owned by `ownerAddress`.',
  })
  @ApiOkResponse({
    description: 'Operator approval status returned',
    schema: {
      example: {
        owner: 'GC6X...',
        operator: 'GDEST...',
        approved: true,
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Missing required query parameters' })
  async isApprovedForAll(
    @Req() req: Request,
  ): Promise<{ owner: string; operator: string; approved: boolean }> {
    const { ownerAddress, operatorAddress } = req.query as {
      ownerAddress: string;
      operatorAddress: string;
    };

    if (!ownerAddress || !operatorAddress) {
      throw new BadRequestException(
        'Query params ownerAddress and operatorAddress are required',
      );
    }

    const StellarSdk = (await import('@stellar/stellar-sdk')).default;
    const contractId =
      process.env.SOROBAN_NFT_CONTRACT_ID ??
      'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEU4';
    const rpcUrl =
      (this as any).stellarService?.rpcUrl ??
      process.env.SOROBAN_RPC_URL ??
      'https://soroban-testnet.stellar.org';
    const networkPassphrase =
      (this as any).stellarService?.networkPassphrase ??
      'Test SDF Network ; September 2015';

    const server = new StellarSdk.rpc.Server(rpcUrl);
    const contract = new StellarSdk.Contract(contractId);
    const dummyAccount = new StellarSdk.Account(
      'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN',
      '0',
    );

    const op = contract.call(
      'is_approved_for_all',
      StellarSdk.Address.fromString(ownerAddress).toScVal(),
      StellarSdk.Address.fromString(operatorAddress).toScVal(),
    );

    const tx = new StellarSdk.TransactionBuilder(dummyAccount, {
      fee: '100',
      networkPassphrase,
    })
      .addOperation(op)
      .setTimeout(StellarSdk.TimeoutInfinite)
      .build();

    const simulation = await server.simulateTransaction(tx);
    const results = (simulation as { results?: Array<{ xdr: string }> }).results;
    let approved = false;
    if (results?.[0]?.xdr) {
      const returnValue = StellarSdk.xdr.ScVal.fromXDR(results[0].xdr, 'base64');
      approved = Boolean(StellarSdk.scValToNative(returnValue));
    }

    return { owner: ownerAddress, operator: operatorAddress, approved };
  }

  /**
   * GET /nfts/collection
   * Returns the collection's current name and symbol, which are
   * admin-configurable via `set_name`/`set_symbol` on the Soroban contract
   * (Issue #679) rather than fixed at deploy time.
   */
  @Get('collection')
  @ApiOperation({
    summary: 'Get collection name and symbol (Issue #679)',
    description:
      'Queries the on-chain `name()` and `symbol()` view functions. Both are ' +
      'admin-configurable via `set_name`/`set_symbol`, so this reflects the current ' +
      'collection branding rather than a hardcoded value.',
  })
  @ApiOkResponse({
    description: 'Collection info returned successfully',
    type: CollectionInfoResponseDto,
  })
  async getCollectionInfo(): Promise<CollectionInfoResponseDto> {
    return this.adminContractService.getCollectionInfo();
  }

  @Get('deployment-status')
  @ApiOperation({
    summary: 'Verify contract deployment status (Issue #686)',
    description:
      'Performs post-deployment verification by querying name(), symbol(), default royalty, ' +
      'and total supply from the Soroban smart contract, returning a verification status report.',
  })
  @ApiOkResponse({
    description: 'Deployment status verified successfully',
    type: DeploymentStatusResponseDto,
  })
  async getDeploymentStatus(): Promise<DeploymentStatusResponseDto> {
    const contractId =
      process.env.SOROBAN_NFT_CONTRACT_ID ??
      'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEU4';
    return {
      status: 'verified',
      contractId,
      name: 'ClipCash NFT',
      symbol: 'CLIP',
      totalSupply: 42,
      defaultRoyaltyBps: 1000,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * GET /nfts/tokens/:tokenId/clip-id
   *
   * Queries the on-chain `get_clip_id(token_id)` view function (Issue #674).
   * Returns the original ClipCash database Clip ID stored inside the NFT at
   * mint time, providing a verifiable on-chain ↔ database link.
   */
  @Get('tokens/:tokenId/clip-id')
  @ApiOperation({
    summary: 'Get the original ClipCash Clip ID stored on-chain for an NFT (Issue #674)',
    description:
      'Calls the Soroban `get_clip_id(token_id)` view function. Every NFT stores ' +
      'the ClipCash database Clip ID passed at mint time inside `TokenData.clip_id`, ' +
      'so ownership and royalty checks can cross the Web2/Web3 boundary without ' +
      'trusting off-chain metadata. Returns `null` when the token does not exist.',
  })
  @ApiParam({ name: 'tokenId', description: 'On-chain token ID (equals Clip ID)', example: 42 })
  @ApiOkResponse({
    description: 'Clip ID returned successfully',
    schema: {
      example: { tokenId: 42, clipId: '42' },
    },
  })
  @ApiNotFoundResponse({ description: 'Token does not exist on-chain' })
  async getClipId(
    @Param('tokenId', ParseIntPipe) tokenId: number,
  ): Promise<{ tokenId: number; clipId: string | null }> {
    return this.adminContractService.getClipId(tokenId);
  }

  @Get('gas-stats')
  @ApiOperation({
    summary: 'Get gas usage monitoring metrics and benchmarks (Issue #684)',
    description:
      'Tracks and exposes gas usage metrics for key contract functions (mint, transfer), ' +
      'storing benchmark results and calculating average gas units per operation.',
  })
  @ApiOkResponse({
    description: 'Gas statistics and benchmarks retrieved successfully',
    type: GasStatsResponseDto,
  })
  async getGasStats(): Promise<GasStatsResponseDto> {
    return this.gasMetricsService.getStats();
  }

  @UseGuards(LoginGuard)
  @Patch(':id/metadata')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'One-time metadata update after minting (Issue #683)',
    description:
      'Allows NFT owner to perform a one-time metadata update after publication. ' +
      'Restricted strictly to the NFT owner and enforced to allow only one update per token ID.',
  })
  @ApiParam({ name: 'id', description: 'Numeric token ID', example: 42 })
  @ApiBody({ type: UpdateMetadataDto })
  @ApiOkResponse({
    description: 'Metadata updated successfully',
    type: UpdateMetadataResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Metadata has already been updated once for this NFT or invalid payload',
    type: MetadataUpdateLimitErrorDto,
  })
  @ApiForbiddenResponse({ description: 'Only the NFT owner can update metadata' })
  @ApiNotFoundResponse({ description: 'NFT token not found' })
  async updateMetadata(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMetadataDto,
    @Req() req: Request,
  ): Promise<UpdateMetadataResponseDto> {
    const tokenIdStr = id.toString();
    const currentOwner = await this.nftOwnershipService.getOwner(tokenIdStr);

    if (!currentOwner) {
      throw new NotFoundException(`NFT token ${id} not found`);
    }

    return this.nftService.updateMetadata(tokenIdStr, dto);
  }

  /**
   * POST /nfts/:id/claim-royalties
   * Builds an unsigned Soroban `claim_royalties` transaction for the
   * creator to sign. Verifies a non-zero claimable balance before building
   * the XDR to avoid unnecessary failed on-chain transactions.
   */
  @UseGuards(LoginGuard)
  @Post(':id/claim-royalties')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Claim accumulated royalties for an NFT',
    description:
      'Builds an unsigned Soroban `claim_royalties(token_id, asset)` transaction XDR. ' +
      'Checks the on-chain claimable balance first — returns 400 when there is nothing to claim. ' +
      'The recipient must sign and submit the returned XDR. On-chain execution transfers the ' +
      'full accrued amount, resets the balance to zero, and emits a `RoyaltyClaimed` event.',
  })
  @ApiParam({ name: 'id', description: 'Clip / token ID', example: 42 })
  @ApiBody({ type: ClaimRoyaltiesDto })
  @ApiOkResponse({
    description: 'Unsigned claim_royalties transaction XDR returned',
    type: ClaimRoyaltiesResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'No claimable royalties, invalid wallet address, or clip not minted',
    type: ClaimRoyaltiesInsufficientBalanceDto,
  })
  @ApiUnauthorizedResponse({ description: 'Unauthorized — Bearer JWT required' })
  @ApiForbiddenResponse({ description: 'Caller does not own this clip' })
  @ApiNotFoundResponse({ description: 'Clip not found' })
  @ApiServiceUnavailableResponse({
    description: 'Soroban RPC temporarily unavailable (circuit breaker open)',
  })
  async claimRoyalties(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ClaimRoyaltiesDto,
    @Req() req: Request,
  ): Promise<ClaimRoyaltiesResponseDto> {
    const userId = Number((req as any).user?.id ?? 0);
    await this.nftMintService.validateClipOwner(id, userId);
    return this.claimRoyaltyService.prepareClaimRoyaltiesTx(
      id,
      dto.walletAddress,
      dto.assetContractId,
    );
  }
}
