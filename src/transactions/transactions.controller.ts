import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Req,
  ValidationPipe,
  Headers,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiInternalServerErrorResponse,
  ApiUnauthorizedResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiUnprocessableEntityResponse,
  ApiTooManyRequestsResponse,
  ApiOkResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Auth } from '../auth/decorators/auth.decorator';
import { TransactionsService } from './transactions.service';
import { TransactionConfirmationService } from './transaction-confirmation.service';
import { CreateTransactionDto } from './dto/send-transaction.dto';
import {
  TrackTransactionDto,
  TransactionStatusResponseDto,
  TRANSACTION_STATUS_SUCCESS_EXAMPLE,
  TRANSACTION_STATUS_FAILURE_EXAMPLE,
  TRANSACTION_STATUS_PENDING_EXAMPLE,
} from './dto/transaction-status.dto';

@ApiTags('transactions')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Unauthorized' })
@ApiInternalServerErrorResponse({ description: 'Internal server error' })
@Controller('transactions')
@Auth()
export class TransactionsController {
  constructor(
    private readonly transactionsService: TransactionsService,
    private readonly confirmationService: TransactionConfirmationService,
  ) {}

  @Post('send')
  @Throttle({ transactionSend: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    summary: "Send XLM from the user's custodial wallet",
    description:
      'Backend builds, signs, and submits the Stellar transaction. ' +
      'Frontend only provides amount + destination. ' +
      'Supply an Idempotency-Key header to safely retry without double-spending.',
  })
  @ApiResponse({
    status: 200,
    description: 'Transaction submitted, returns hash',
  })
  @ApiBadRequestResponse({
    description: 'Invalid destination or amount / self-send attempt',
  })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiNotFoundResponse({ description: 'No custodial wallet found' })
  @ApiUnprocessableEntityResponse({ description: 'Daily volume limit reached' })
  @ApiTooManyRequestsResponse({ description: 'Rate limit exceeded' })
  async send(
    @Req() req: any,
    @Headers('Idempotency-Key') idempotencyKey: string | undefined,
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    dto: CreateTransactionDto,
  ) {
    const result = await this.transactionsService.send(
      req.user.userId,
      dto,
      idempotencyKey?.trim() || undefined,
    );
    // Begin confirmation tracking so GET /transactions/:hash works (Issue #846).
    await this.confirmationService
      .track(result.hash, 'custodial_send', req.user.userId)
      .catch(() => undefined);
    return result;
  }

  /**
   * POST /transactions/track
   * Register a submitted Soroban / Stellar hash for confirmation polling (Issue #846).
   */
  @Post('track')
  @ApiOperation({
    summary: 'Track a submitted Soroban/Stellar transaction (Issue #846)',
    description:
      'Stores the transaction hash and begins polling Horizon until the status is ' +
      '`confirmed` or `failed`. Use GET /transactions/:hash for the latest status.',
  })
  @ApiBody({ type: TrackTransactionDto })
  @ApiOkResponse({
    description: 'Tracking started (or existing record returned)',
    type: TransactionStatusResponseDto,
    examples: {
      pending: { summary: 'Pending', value: TRANSACTION_STATUS_PENDING_EXAMPLE },
    },
  })
  @ApiBadRequestResponse({ description: 'Invalid hash format' })
  async track(
    @Req() req: any,
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    dto: TrackTransactionDto,
  ): Promise<TransactionStatusResponseDto> {
    return this.confirmationService.track(
      dto.hash,
      dto.label,
      req.user?.userId,
    );
  }

  /**
   * GET /transactions/:hash
   * Latest known status: pending | confirmed | failed (Issue #846).
   */
  @Get(':hash')
  @ApiOperation({
    summary: 'Get transaction confirmation status (Issue #846)',
    description:
      'Returns the latest known status for a tracked Soroban/Stellar transaction hash. ' +
      'Supported states: `pending`, `confirmed`, `failed`. Pending hashes are refreshed ' +
      'from Horizon on each request.',
  })
  @ApiParam({
    name: 'hash',
    description: '64-char hex transaction hash',
    example: 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456',
  })
  @ApiOkResponse({
    description: 'Latest known transaction status',
    type: TransactionStatusResponseDto,
    examples: {
      success: {
        summary: 'Confirmed',
        value: TRANSACTION_STATUS_SUCCESS_EXAMPLE,
      },
      failure: {
        summary: 'Failed',
        value: TRANSACTION_STATUS_FAILURE_EXAMPLE,
      },
      pending: {
        summary: 'Pending',
        value: TRANSACTION_STATUS_PENDING_EXAMPLE,
      },
    },
  })
  @ApiNotFoundResponse({ description: 'Hash not tracked and not found on Horizon' })
  @ApiBadRequestResponse({ description: 'Invalid hash format' })
  async getStatus(
    @Param('hash') hash: string,
  ): Promise<TransactionStatusResponseDto> {
    return this.confirmationService.getStatus(hash);
  }
}
