import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Query,
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
  ApiQuery,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiNotFoundResponse,
  ApiInternalServerErrorResponse,
  ApiConflictResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Auth } from '../auth/decorators/auth.decorator';
import { WalletsService, DisconnectResult } from './wallets.service';
import { WalletBalanceService } from './wallet-balance.service';
import { CreateWalletConnectionDto } from './dto/connect-wallet.dto';
import { WalletNftsQueryDto } from './dto/wallet-nfts-query.dto';
import { WalletOwnershipGuard } from './guards/wallet-ownership.guard';
import { WalletBalanceResult } from '../stellar/stellar.service';
import { NftOwnershipService } from '../nft/nft-ownership.service';

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
    private readonly nftOwnershipService: NftOwnershipService,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List all wallets for the authenticated user',
    description:
      'Returns all active (non-deleted) wallets belonging to the current user. ' +
      'Wallet addresses are partially masked for privacy. ' +
      'Each wallet includes its chain (stellar | solana | base) and provider type.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of wallets',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'number' },
          address: { type: 'string', example: '******KPRQ6A' },
          chain: { type: 'string', enum: ['stellar', 'solana', 'base'] },
          type: { type: 'string', example: 'freighter' },
          connectedAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async listWallets(@Req() req: AuthRequest) {
    return this.walletsService.listWallets(req.user.userId);
  }

  @Get(':id')
  @UseGuards(WalletOwnershipGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get a single wallet by ID',
    description:
      'Returns details of a specific wallet. The wallet must belong to the authenticated user. ' +
      'Includes chain information (stellar | solana | base) and provider type.',
  })
  @ApiParam({ name: 'id', description: 'Wallet ID', type: 'number' })
  @ApiResponse({
    status: 200,
    description: 'Wallet details',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'number' },
        address: { type: 'string', example: '******KPRQ6A' },
        chain: { type: 'string', enum: ['stellar', 'solana', 'base'] },
        type: { type: 'string', example: 'freighter' },
        connectedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Wallet not found' })
  async getWallet(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthRequest,
  ) {
    return this.walletsService.getWalletById(id, req.user.userId);
  }

  @Get(':id/balance')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @UseGuards(WalletOwnershipGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get wallet XLM balance',
    description:
      'Returns the current native XLM balance for the specified wallet and a warning flag when funds are below the 2 XLM threshold that may cause NFT mint failures. ' +
      'Queries the Horizon server for the currently configured Stellar network (testnet or public/mainnet, per STELLAR_NETWORK).',
  })
  @ApiParam({ name: 'id', description: 'Wallet ID', type: 'number' })
  @ApiResponse({
    status: 200,
    description: 'Balance retrieved successfully',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            balance: {
              type: 'number',
              description: 'Available XLM balance',
            },
            warning: {
              type: 'boolean',
              description: 'True when balance is below 2 XLM',
            },
          },
        },
        examples: {
          sufficientBalance: {
            summary: 'Balance above the 2 XLM threshold',
            value: { balance: 5.2, warning: false },
          },
          lowBalanceWarning: {
            summary: 'Balance below the 2 XLM threshold — may cause mint failures',
            value: { balance: 0.5, warning: true },
          },
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
  @ApiResponse({
    status: 200,
    description: 'Wallet disconnected successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Wallet disconnected successfully' },
        walletId: { type: 'number', example: 1 },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Cannot disconnect - pending payouts or active NFTs exist',
  })
  @ApiConflictResponse({
    description:
      'Wallet is already disconnected, has pending payouts, or has active NFTs',
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
      'Connect or update a wallet for the authenticated user. ' +
      'Supports Stellar (freighter, lobstr, albedo), Solana (phantom, solflare, backpack), ' +
      'and Base/EVM (metamask, coinbase, walletconnect) wallets. ' +
      'If a wallet with the same address+chain already exists it is re-activated.',
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

  /**
   * GET /wallets/:address/nfts
   * Returns all token IDs owned by the given Stellar wallet address,
   * with optional pagination (Issue #673).
   */
  @Get(':address/nfts')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List NFT token IDs owned by a Stellar wallet address (Issue #673)',
    description:
      'Returns all token IDs currently owned by the specified Stellar wallet address. ' +
      'Supports pagination via `page` and `limit` query parameters. ' +
      'Large collections are handled safely via result-size limits (max 100 per page). ' +
      'Authentication is not required — the address is the lookup key.',
  })
  @ApiParam({
    name: 'address',
    description: 'Stellar wallet address (56-character G... address)',
    example: 'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (1-based, default: 1)',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Results per page (max 100, default: 20)',
    example: 20,
  })
  @ApiOkResponse({
    description: 'Paginated list of NFT token IDs owned by the wallet',
    schema: {
      type: 'object',
      properties: {
        address: {
          type: 'string',
          example: 'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
        },
        tokenIds: {
          type: 'array',
          items: { type: 'number' },
          example: [42, 51, 99],
        },
        total: {
          type: 'number',
          description: 'Total number of tokens owned by this wallet',
          example: 3,
        },
        page: { type: 'number', example: 1 },
        limit: { type: 'number', example: 20 },
        hasNextPage: {
          type: 'boolean',
          description: 'True when there are more pages available',
          example: false,
        },
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Invalid Stellar wallet address format' })
  async getWalletNfts(
    @Param('address') address: string,
    @Query() query: WalletNftsQueryDto,
  ) {
    if (!address || address.length !== 56 || !address.startsWith('G')) {
      throw new BadRequestException(
        'Invalid Stellar wallet address: must be a 56-character G... address',
      );
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const allTokenIds = await this.nftOwnershipService.getWalletTokenIds(address);
    const total = allTokenIds.length;

    // Apply pagination
    const start = (page - 1) * limit;
    const end = start + limit;
    const tokenIds = allTokenIds.slice(start, end);
    const hasNextPage = end < total;

    return {
      address,
      tokenIds,
      total,
      page,
      limit,
      hasNextPage,
    };
  }
}