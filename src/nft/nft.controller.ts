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
  ApiBearerAuth,
  ApiOkResponse,
  ApiNotFoundResponse,
  ApiUnauthorizedResponse,
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
  NftRoyaltyResponseDto,
  VerifyNftOwnershipDto,
} from './dto/nft-swagger.dto';
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
import { LoginGuard } from '../auth/guards/login.guard';
import { NftMintGuard } from './guards/nft-mint.guard';

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
  @ApiBadRequestResponse({ description: 'Invalid mint payload' })
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
  })
  @ApiBody({ type: CreateMintPreparationDto })
  @ApiResponse({
    status: 201,
    description: 'Mint transaction XDR returned',
    type: NftPrepareMintResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Unauthorized — Bearer JWT required' })
  @ApiBadRequestResponse({ description: 'Invalid clip or wallet' })
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
  @ApiUnauthorizedResponse({ description: 'Unauthorized — Bearer JWT required' })
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
      'Checks whether the given Stellar wallet owns the NFT token via Soroban owner_of.',
  })
  @ApiBody({ type: VerifyNftOwnershipDto })
  @ApiResponse({
    status: 200,
    description: 'Ownership check result',
    type: NftOwnershipResultDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid mint address or wallet' })
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
      royaltyRecipient = this.royaltyConfigurationService.getPlatformWallet();
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
    }) as NftMetadataResponseDto;
  }

  @Get(':mintAddress/royalty')
  @ApiOperation({ summary: 'Get on-chain royalty info for an NFT' })
  @ApiParam({
    name: 'mintAddress',
    description: 'NFT mint address / token ID',
    example: '42',
  })
  @ApiResponse({
    status: 200,
    description: 'Royalty info returned',
    type: NftRoyaltyResponseDto,
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
      'Reads royalty BPS and recipient from the Soroban get_royalties contract method. Results are cached in Redis for 5 minutes.',
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
}
