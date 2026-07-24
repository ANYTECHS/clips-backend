import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';

import { NftService, MintResult } from './nft.service';
import { MintNftDto } from './dto/mint-nft.dto';
import { CreateMintPreparationDto } from './dto/prepare-mint.dto';
import { ConfirmMintDto } from './dto/confirm-mint.dto';
import { NftMintService } from '../clips/nft-mint.service';
import { NftMetadataService } from './nft-metadata.service';
import { IpfsUploadService } from './ipfs-upload.service';
import { RoyaltyQueryService, RoyaltyInfo } from './royalty-query.service';
import { LoginGuard } from '../auth/guards/login.guard';
import { NftMintGuard } from './guards/nft-mint.guard';

@ApiTags('nft')
@Controller('nfts')
export class NftController {
  constructor(
    private readonly nftService: NftService,
    private readonly nftMintService: NftMintService,
    private readonly nftMetadataService: NftMetadataService,
    private readonly ipfsUploadService: IpfsUploadService,
    private readonly royaltyQueryService: RoyaltyQueryService,
  ) {}

  /**
   * POST /nfts/mint
   * Builds NFT metadata via NftMetadataService, uploads it to IPFS via
   * IpfsUploadService, then mints the clip as an NFT with split royalties.
   * Skips the metadata build+upload step when the caller provides metadataUri.
   */
  @UseGuards(NftMintGuard)
  @Post('mint')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ nftMint: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Mint a clip as an NFT' })
  @ApiResponse({ status: 201, description: 'NFT minted successfully' })
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

  /**
   * POST /nfts/prepare-mint
   * Builds a Soroban mint transaction and returns the XDR for the frontend to sign.
   * The authenticated user must own the clip being minted.
   */
  @UseGuards(LoginGuard, NftMintGuard)
  @Post('prepare-mint')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ nftMint: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Prepare a Soroban mint transaction (returns XDR for signing)' })
  @ApiResponse({ status: 201, description: 'Mint transaction XDR returned' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async prepareMint(
    @Body() dto: CreateMintPreparationDto,
    @Req() req: Request,
  ) {
    const userId = Number((req as any).user?.id ?? 0);
    await this.nftMintService.validateClipOwner(dto.clipId, userId);
    return this.nftMintService.prepareMintTx(dto.clipId, dto.walletAddress);
  }

  /**
   * POST /nfts/confirm-mint
   * Finalizes mint tracking after the client submits a signed Soroban tx.
   * Sets mintAddress, mintedAt, and nftStatus=minted. Rejects duplicates.
   */
  @UseGuards(LoginGuard)
  @Post('confirm-mint')
  @HttpCode(HttpStatus.OK)
  @Throttle({ nftMint: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Confirm a completed on-chain NFT mint' })
  @ApiResponse({ status: 200, description: 'Mint confirmed; clip mint fields updated' })
  @ApiResponse({ status: 400, description: 'Clip already minted or invalid request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Clip not found' })
  async confirmMint(
    @Body() dto: ConfirmMintDto,
    @Req() req: Request,
  ) {
    const userId = Number((req as any).user?.id ?? 0);
    await this.nftMintService.validateClipOwner(dto.clipId, userId);
    return this.nftMintService.confirmMint(dto.clipId, dto.mintAddress);
  }

  /**
   * GET /nfts/:mintAddress/royalty
   * Queries the on-chain royalty info for a minted NFT.
   * The mintAddress is the numeric token ID (= clip.id) assigned at mint time.
   * Result is cached in Redis for 5 minutes.
   *
   * Response: { royaltyBps: number, recipient: string }
   */
  @Get(':mintAddress/royalty')
  @ApiOperation({ summary: 'Get on-chain royalty info for an NFT' })
  @ApiParam({ name: 'mintAddress', description: 'NFT mint address / token ID' })
  @ApiResponse({ status: 200, description: 'Royalty info returned' })
  async getRoyalty(
    @Param('mintAddress') mintAddress: string,
  ): Promise<RoyaltyInfo> {
    return this.royaltyQueryService.getRoyaltyInfo(mintAddress);
  }
}
