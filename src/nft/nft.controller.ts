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
import { CreateMintDto } from './dto/mint-clip.dto';
import { CreateMintPreparationDto } from './dto/prepare-mint.dto';
import { NftMintService } from '../clips/nft-mint.service';
import { RoyaltyQueryService, RoyaltyInfo } from './royalty-query.service';
import { LoginGuard } from '../auth/guards/login.guard';
import { NftMintGuard } from './guards/nft-mint.guard';

@ApiTags('nft')
@Controller('nfts')
export class NftController {
  constructor(
    private readonly nftService: NftService,
    private readonly nftMintService: NftMintService,
    private readonly royaltyQueryService: RoyaltyQueryService,
  ) {}

  /**
   * POST /nfts/mint
   * Mints a clip as an NFT with split royalties (legacy stub endpoint).
   */
  @UseGuards(NftMintGuard)
  @Post('mint')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ nftMint: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Mint a clip as an NFT (legacy)' })
  @ApiResponse({ status: 201, description: 'NFT minted successfully' })
  async mint(@Body() dto: CreateMintDto): Promise<MintResult> {
    return this.nftService.mintClip(dto);
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
