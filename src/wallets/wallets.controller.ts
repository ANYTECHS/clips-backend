import {
  Controller,
  Delete,
  Param,
  ParseIntPipe,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  Body,
  Post,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Auth } from '../auth/decorators/auth.decorator';
import { WalletsService, DisconnectResult } from './wallets.service';
import { CreateWalletConnectionDto } from './dto/connect-wallet.dto';
import { WalletOwnershipGuard } from './guards/wallet-ownership.guard';

interface AuthRequest extends Request {
  user: { userId: number; email: string | null };
}

@ApiTags('wallets')
@ApiBearerAuth('access-token')
@Controller('wallets')
@Auth()
export class WalletsController {
  constructor(private readonly walletsService: WalletsService) {}

  @Delete(':id')
  @Throttle({ walletDisconnect: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    summary: 'Disconnect wallet',
    description: 'Soft-deletes the wallet (sets deletedAt). Blocked if pending payouts exist on the wallet.',
  })
  @ApiParam({ name: 'id', description: 'Wallet ID', type: 'number' })
  @ApiResponse({ status: 200, description: 'Wallet disconnected successfully' })
  @ApiResponse({ status: 400, description: 'Cannot disconnect - pending payouts exist' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Wallet not found or belongs to another user' })
  @UseGuards(WalletOwnershipGuard)
  @HttpCode(HttpStatus.OK)
  async disconnect(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthRequest,
  ): Promise<DisconnectResult> {
    return this.walletsService.disconnect(id, req.user.userId);
  }

  @Post('connect')
  @Throttle({ walletConnect: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    summary: 'Connect wallet',
    description: 'Connect or update a wallet for the authenticated user. Supports Stellar wallets via Freighter, Lobstr, or Albedo.',
  })
  @ApiResponse({ status: 200, description: 'Wallet connected successfully' })
  @ApiResponse({ status: 400, description: 'Invalid wallet data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @HttpCode(HttpStatus.OK)
  async connect(@Req() req: AuthRequest, @Body() dto: CreateWalletConnectionDto) {
    return this.walletsService.connect(req.user.userId, dto);
  }
}
