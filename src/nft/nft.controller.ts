import {
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { LoginGuard } from '../auth/guards/login.guard';
import { NftMintService } from '../clips/nft-mint.service';
import { PrepareMintDto } from './dto/prepare-mint.dto';
import { NftMintable } from './decorators/nft-mintable.decorator';
import { NftMintGuard } from './guards/nft-mint.guard';

interface AuthenticatedRequest {
  user: { userId: number };
}

@Controller('nfts')
export class NftController {
  constructor(private readonly nftMintService: NftMintService) {}

  @Post('prepare-mint')
  @UseGuards(LoginGuard, NftMintGuard)
  @NftMintable({ clipIdParam: 'clipId' })
  @Throttle({ nftMint: { limit: 5, ttl: 60_000 } })
  async prepareMint(
    @Req() req: AuthenticatedRequest,
    @Body() body: PrepareMintDto,
  ) {
    await this.nftMintService.validateClipOwner(body.clipId, req.user.userId);
    return this.nftMintService.prepareMintTx(body.clipId, body.walletAddress);
  }
}
