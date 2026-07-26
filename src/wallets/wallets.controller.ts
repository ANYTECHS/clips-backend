import {
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  Body,
  Post,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiNotFoundResponse,
  ApiInternalServerErrorResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Auth } from '../auth/decorators/auth.decorator';
import { WalletsService, DisconnectResult } from './wallets.service';
import { WalletBalanceService } from './wallet-balance.service';
import { CreateWalletConnectionDto } from './dto/connect-wallet.dto';
import { WalletOwnershipGuard } from './guards/wallet-ownership.guard';
import { WalletBalanceResult } from '../stellar/stellar.service';

interface AuthRequest extends Request {
  user: { userId: number; email: string | null };
}

@ApiTags('wallets')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Unauthorized' })
@ApiInternalServerErrorResponse({ description: 'Internal server error' })
@Controller('wallets')
@Auth()
export class WalletsController {
  constructor(
    private readonly walletsService: WalletsService,
    private readonly walletBalanceService: WalletBalanceService,
  ) {}

  @Get(':id/balance')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @UseGuards(WalletOwnershipGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get wallet XLM balance',
    description:
      'Returns the current native XLM balance for the specified wallet and a warning flag when funds are below the 2 XLM threshold that may cause NFT mint failures.',
  })
  @ApiParam({ name: 'id', description: 'Wallet ID', type: 'number' })
  @ApiResponse({
    status: 200,
    description: 'Balance retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        balance: {
          type: 'number',
          example: 5.2,
          description: 'Available XLM balance',
        },
        warning: {
          type: 'boolean',
          example: false,
          description: 'True when balance is below 2 XLM',
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid wallet address stored on record',
  })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiNotFoundResponse({
    description: 'Wallet not found or Stellar account does not exist',
  })
  @ApiInternalServerErrorResponse({
    description: 'Horizon network request failed',
  })
  async getBalance(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthRequest,
  ): Promise<WalletBalanceResult> {
    return this.walletBalanceService.getBalance(id, req.user.userId);
  }

  @Delete(':id')
  @Throttle({ walletDisconnect: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    summary: 'Disconnect wallet',
    description:
      'Soft-deletes the wallet (sets deletedAt). Blocked if pending payouts or active NFTs still depend on the wallet.',
  })
  @ApiParam({ name: 'id', description: 'Wallet ID', type: 'number' })
  @ApiResponse({ status: 200, description: 'Wallet disconnected successfully' })
  @ApiBadRequestResponse({
    description: 'Cannot disconnect - pending payouts or active NFTs exist',
  })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiNotFoundResponse({
    description: 'Wallet not found or belongs to another user',
  })
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
    description:
      'Connect or update a wallet for the authenticated user. Supports Stellar wallets via Freighter, Lobstr, or Albedo.',
  })
  @ApiResponse({ status: 200, description: 'Wallet connected successfully' })
  @ApiBadRequestResponse({
    description: 'Invalid wallet data or signature verification failed',
  })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @HttpCode(HttpStatus.OK)
  async connect(
    @Req() req: AuthRequest,
    @Body() dto: CreateWalletConnectionDto,
  ) {
    return this.walletsService.connect(req.user.userId, dto);
  }
}
