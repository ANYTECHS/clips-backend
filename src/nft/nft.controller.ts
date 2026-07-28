import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
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
import {
  NftMetadataResponseDto,
  NftMintResponseDto,
  NftOwnershipResultDto,
  NftPrepareMintResponseDto,
  VerifyNftOwnershipDto,
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
import { PrismaService } from '../prisma/prisma.service';
import { RoyaltyConfigurationService } from './royalty-configuration.service';
import { MintSignatureVerificationService } from './mint-signature-verification.service';
import { PrepareTransferDto } from './dto/prepare-transfer.dto';
import { LoginGuard } from '../auth/guards/login.guard';
import { NftMintGuard } from './guards/nft-mint.guard';
import { maskAddress } from '../wallets/wallet.utils';

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
    private readonly prisma: PrismaService,
    private readonly royaltyConfigurationService: RoyaltyConfigurationService,
  ) {}

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
  @ApiForbiddenResponse({ description: 'Caller does not own the clip' })
  async prepareMint(
    @Body() dto: CreateMintPreparationDto,
    @Req() req: Request,
  ) {
    const userId = Number((req as any).user?.id ?? 0);
    await this.nftMintService.validateClipOwner(dto.clipId, userId);
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
   * POST /nfts/prepare-transfer
   *
   * Builds an unsigned Soroban `transfer_with_royalty` XDR for the caller
   * to sign and submit on-chain.  The response includes a full royalty
   * breakdown (royaltyBps, royaltyAmount, royaltyPercent, recipient) so the
   * frontend can display the royalty fee to the user before they sign.
   *
   * Royalty enforcement flow:
   *   1. Backend resolves royaltyBps (override > on-chain per-token > default > 0)
   *   2. Computes royaltyAmount = salePrice × royaltyBps / 10_000
   *   3. Returns XDR for `transfer_with_royalty(from, to, token_id, sale_price)`
   *   4. On-chain: contract emits `transfer` + `royalty_paid` events
   */
  @UseGuards(LoginGuard)
  @Post('prepare-transfer')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ nftMint: { limit: 10, ttl: 60000 } })
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Prepare a transfer_with_royalty Soroban XDR',
    description:
      'Builds an unsigned Soroban transfer_with_royalty XDR for the caller to sign. ' +
      'Royalty is automatically calculated from the on-chain per-token or contract-level ' +
      'default BPS applied to salePrice. ' +
      'The response royaltyBreakdown shows bps, amount in stroops, percent, and recipient ' +
      'so the user can confirm the royalty before signing.',
  })
  @ApiBody({ type: PrepareTransferDto })
  @ApiResponse({
    status: 201,
    description: 'Transfer XDR and royalty breakdown returned',
    schema: {
      example: {
        xdr: 'AAAAAgAAA...',
        tokenId: 42,
        fromWallet: 'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
        toWallet: 'GBXXYQVNHHZSL3VQNNNQRXB2FHQWZYTQJ6JRYVJL7XP2KXFBH3TFQX',
        salePrice: 5000000000,
        royaltyBreakdown: {
          royaltyBps: 1000,
          royaltyAmount: 500000000,
          royaltyPercent: 10,
          recipient: 'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
        },
        contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEU4',
        network: 'testnet',
      },
    },
  })
  @ApiBadRequestResponse({
    description:
      'Invalid fromWallet/toWallet address, tokenId out of range, ' +
      'or royaltyBpsOverride outside 0–10 000',
  })
  @ApiUnauthorizedResponse({ description: 'Bearer JWT required' })
  async prepareTransfer(@Body() dto: PrepareTransferDto) {
    return this.nftMintService.prepareTransferTx(
      dto.tokenId,
      dto.fromWallet,
      dto.toWallet,
      dto.salePrice,
      dto.royaltyBpsOverride,
    );
  }
}
