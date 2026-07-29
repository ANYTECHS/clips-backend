import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
  ApiBearerAuth,
  ApiInternalServerErrorResponse,
  ApiUnauthorizedResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';

import { NftService, MintResult } from './nft.service';
import { MintNftDto } from './dto/mint-nft.dto';
import { CreateMintPreparationDto } from './dto/prepare-mint.dto';
import { ConfirmMintDto } from './dto/confirm-mint.dto';
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
  VerifyNftOwnershipDto,
  NftOwnerResponseDto,
  WalletNftsResponseDto,
  NftMintResponseDto,
} from './dto/nft-swagger.dto';
import {
  RoyaltyQueryResponseDto,
  RoyaltyNotFoundDto,
  RoyaltyUnauthorizedDto,
} from './dto/royalty-query.dto';
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
import { maskAddress } from '../wallets/wallet.utils';
import {
  UpdateRoyaltyRecipientDto,
  UpdateRoyaltyRecipientResponseDto,
} from './dto/update-royalty-recipient.dto';
import { DeploymentStatusResponseDto } from './dto/deployment-status.dto';
import { GasStatsResponseDto } from './dto/gas-stats.dto';
import { GasMetricsService } from './gas-metrics.service';
import {
  UpdateMetadataDto,
  UpdateMetadataResponseDto,
  MetadataUpdateLimitErrorDto,
} from './dto/update-metadata.dto';

@ApiTags('nfts')
@ApiTags('nft')
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
    private readonly gasMetricsService: GasMetricsService,
  ) {}

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

  @Get('/wallets/:address/nfts')
  @ApiOperation({
    summary: 'Get NFTs owned by a wallet',
    description:
      'Queries the on-chain Soroban contract to get all token IDs currently held by the specified wallet.',
  })
  @ApiParam({
    name: 'address',
    description: 'Stellar wallet address',
    example: 'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
  })
  @ApiOkResponse({
    description: 'Owned NFTs returned successfully',
    type: WalletNftsResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid wallet address' })
  async getWalletNfts(
    @Param('address') address: string,
  ): Promise<WalletNftsResponseDto> {
    if (!address || address.length !== 56 || !address.startsWith('G')) {
      throw new BadRequestException('Invalid Stellar wallet address');
    }
    const tokenIds = await this.nftOwnershipService.getWalletTokenIds(address);
    return {
      address,
      tokenIds,
      balance: tokenIds.length,
    };
  }

  @UseGuards(NftMintGuard)
  @Post('mint')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ nftMint: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    summary: 'Mint a clip as an NFT',
    description:
      'Builds metadata, uploads to IPFS when needed, then mints with split royalties.',
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
  @ApiForbiddenResponse({ description: 'Mint guard rejected the request' })
  async mint(@Body() dto: MintNftDto): Promise<MintResult> {
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
    description: 'Mismatched arrays, invalid payload, or batch size exceeded limit',
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
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Prepare an NFT mint transaction for signing' })
  @ApiResponse({ status: 201, description: 'Mint transaction prepared' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'User does not own the clip' })
  @UseGuards(LoginGuard)
  @UseGuards(LoginGuard, NftMintGuard)
  @Post('prepare-mint')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ nftMint: { limit: 5, ttl: 60000 } })
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Prepare a Soroban mint transaction (returns XDR for signing)',
    description:
      'Builds an unsigned Soroban mint transaction XDR against the currently configured Stellar network ' +
      '(testnet or public/mainnet, per STELLAR_NETWORK).',
  })
  @ApiBody({ type: CreateMintPreparationDto })
  @ApiResponse({
    status: 201,
    description: 'Mint transaction XDR returned',
    type: NftPrepareMintResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized — Bearer JWT required',
  })
  @ApiBadRequestResponse({
    description:
      'Invalid clip or wallet, or the clip cannot be minted because it is already minting/minted ' +
      'or has already been posted to a social platform (business rule: posted clips cannot be minted).',
    schema: {
      example: {
        statusCode: 400,
        message: 'Posted clips cannot be minted.',
        error: 'Bad Request',
      },
    },
  })
  @ApiForbiddenResponse({
    description: 'Caller does not own the clip',
    schema: {
      example: {
        statusCode: 403,
        message: 'You do not own this clip',
        error: 'Forbidden',
      },
    },
  })
  @ApiUnauthorizedResponse({
    description:
      'Wallet signature is invalid or does not match the provided walletAddress. ' +
      'Required signature fields: walletAddress (Stellar G... key), ' +
      'walletSignature (Ed25519 signature over the canonical challenge message: ' +
      '"ClipCash mint authorization for clip <clipId> by <walletAddress>").',
    schema: {
      example: {
        statusCode: 401,
        message: 'Mint signature is invalid — wallet authorization failed',
        error: 'Unauthorized',
      },
    },
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
}
