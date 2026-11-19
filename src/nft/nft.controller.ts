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
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import StellarSdk from '@stellar/stellar-sdk';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';

import { NftService, MintResult } from './nft.service';
import { MintClipDto } from './dto/mint-clip.dto';
import { PrepareMintDto } from './dto/prepare-mint.dto';
import { NftMintService } from '../clips/nft-mint.service';
import { RoyaltyQueryService, RoyaltyInfo } from './royalty-query.service';
import { LoginGuard } from '../auth/guards/login.guard';
import { BurnNftDto } from './dto/burn-nft.dto';
import { SorobanContractService } from './soroban-contract.service';

@ApiTags('nfts')
@Controller('nfts')
export class NftController {
  constructor(
    private readonly nftService: NftService,
    private readonly nftMintService: NftMintService,
    private readonly royaltyQueryService: RoyaltyQueryService,
    private readonly sorobanContract: SorobanContractService,
  ) {}

  /**
   * POST /nfts/:tokenId/burn
   * Prepares an unsigned burn transaction (optionally refunding unclaimed
   * royalties to the royalty recipient) for the owner to sign.
   */
  @UseGuards(LoginGuard)
  @Post(':tokenId/burn')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Prepare NFT burn transaction',
    description:
      'Only the current on-chain owner may burn. With refundRoyalties=true any unclaimed ' +
      'escrowed royalties are returned to the configured royalty recipient (Refunded event).',
  })
  @ApiParam({ name: 'tokenId', description: 'Numeric NFT token ID' })
  @ApiResponse({
    status: 200,
    description: 'Unsigned transaction XDR and expected refund amount',
    schema: {
      example: {
        tokenId: '42',
        refundRoyalties: true,
        refundAmount: '3000000',
        transaction: { xdr: 'AAAA...', network: 'Test SDF Network ; September 2015' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid token ID or body' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({ status: 403, description: 'Wallet is not the token owner' })
  @ApiResponse({ status: 404, description: 'Token does not exist' })
  @ApiResponse({
    status: 409,
    description: 'Contract paused, or unclaimed royalties exist and refundRoyalties is false',
  })
  async burn(@Param('tokenId') tokenId: string, @Body() dto: BurnNftDto) {
    if (!/^\d+$/.test(tokenId) || BigInt(tokenId) <= 0n) {
      throw new BadRequestException('tokenId must be a positive integer');
    }
    const id = StellarSdk.nativeToScVal(BigInt(tokenId), { type: 'u128' });

    let owner: string;
    try {
      owner = await this.sorobanContract.read<string>('owner_of', [id]);
    } catch {
      throw new NotFoundException(`Token ${tokenId} does not exist`);
    }
    if (owner !== dto.walletAddress) {
      throw new ForbiddenException('Wallet is not the token owner');
    }
    if (await this.sorobanContract.read<boolean>('is_paused')) {
      throw new ConflictException('Contract is paused');
    }
    const refundRoyalties = dto.refundRoyalties ?? false;
    const unclaimed = await this.sorobanContract.read<bigint>('unclaimed_royalty', [id]);
    if (!refundRoyalties && BigInt(unclaimed) > 0n) {
      throw new ConflictException(
        'Unclaimed royalties exist; set refundRoyalties=true to burn',
      );
    }

    const { xdr } = await this.sorobanContract.prepare(dto.walletAddress, 'burn', [
      new StellarSdk.Address(dto.walletAddress).toScVal(),
      id,
      StellarSdk.nativeToScVal(refundRoyalties, { type: 'bool' }),
    ]);

    return {
      tokenId,
      refundRoyalties,
      refundAmount: refundRoyalties ? BigInt(unclaimed).toString() : '0',
      transaction: { xdr, network: process.env.STELLAR_NETWORK_PASSPHRASE ?? null },
    };
  }

  /**
   * POST /nfts/mint
   * Mints a clip as an NFT with split royalties (legacy stub endpoint).
   */
  @Post('mint')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ nftMint: { limit: 5, ttl: 60000 } })
  async mint(@Body() dto: MintClipDto): Promise<MintResult> {
    return this.nftService.mintClip(dto);
  }

  /**
   * POST /nfts/prepare-mint
   * Builds a Soroban mint transaction and returns the XDR for the frontend to sign.
   * The authenticated user must own the clip being minted.
   */
  @UseGuards(LoginGuard)
  @Post('prepare-mint')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ nftMint: { limit: 5, ttl: 60000 } })
  async prepareMint(
    @Body() dto: PrepareMintDto,
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
  async getRoyalty(
    @Param('mintAddress') mintAddress: string,
  ): Promise<RoyaltyInfo> {
    return this.royaltyQueryService.getRoyaltyInfo(mintAddress);
  }
}
