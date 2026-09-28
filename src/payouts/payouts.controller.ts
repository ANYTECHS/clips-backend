import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import { Auth } from '../auth/decorators/auth.decorator';
import { CreatePayoutDto } from './dto/request-payout.dto';
import { InitiateStellarPayoutDto } from './dto/initiate-stellar-payout.dto';
import { CreatePayoutRequestDto } from './dto/create-payout-request.dto';
import {
  PayoutOnChainStatusResponseDto,
  PayoutProcessResponseDto,
  PayoutResponseDto,
  StellarPayoutInitiationResponseDto,
} from './dto/payout-responses.dto';
import { PayoutReceiptDto } from './dto/receipt-responses.dto';
import { PayoutsService } from './payouts.service';
import { BalanceService } from './balance.service';

import { API_ERROR_SCHEMA } from '../common/dtos';
import {
  PAYOUT_STATUS_SWAGGER_DESCRIPTION,
  PAYOUT_STATUS_VALUES,
} from './payouts.constants';

interface RequestWithUser extends Request {
  user: { userId: number };
}

const validationErrorSchema = API_ERROR_SCHEMA;

const payoutError = (statusCode: number, error: string, message: string) => ({
  value: { statusCode, message, error },
});

@ApiTags('payout')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Unauthorized', schema: API_ERROR_SCHEMA })
@ApiInternalServerErrorResponse({ description: 'Internal server error', schema: API_ERROR_SCHEMA })
@Controller('payouts')
@Auth()
export class PayoutsController {
  constructor(
    private readonly payoutsService: PayoutsService,
    private readonly balanceService: BalanceService,
  ) {}

  @Get('balance')
  @ApiOperation({
    summary: 'Get available balance for payout',
    description:
      'Returns the available balance that can be withdrawn. ' +
      'Formula: Total Earnings - Total Paid Out - Total Pending Payouts.',
  })
  @ApiResponse({
    status: 200,
    description: 'Available balance information',
    schema: {
      type: 'object',
      properties: {
        totalEarnings: { type: 'number', example: 500 },
        totalPaidOut: { type: 'number', example: 100 },
        totalPending: { type: 'number', example: 50 },
        availableBalance: { type: 'number', example: 350 },
      },
    },
  })
  async getBalance(@Req() req: RequestWithUser) {
    return this.balanceService.getAvailableBalance(req.user.userId);
  }

  @Post('request-partial')
  @ApiOperation({
    summary: 'Request a partial payout (withdraw specific amount)',
    description:
      'Request to withdraw a specific amount up to the available balance. ' +
      'Amount must be positive and not exceed available balance. ' +
      'Payout status is determined by amount: ' +
      'below approval threshold → approved, above → pending_review.',
  })
  @ApiBody({
    type: CreatePayoutRequestDto,
    examples: {
      stellarPartial: {
        summary: 'Withdraw $200 to Stellar wallet',
        value: {
          amount: 200,
          walletId: 1,
          reason: 'Monthly withdrawal',
        },
      },
      bankTransfer: {
        summary: 'Withdraw $150 via bank transfer',
        value: {
          amount: 150,
          payoutMethodId: 1,
          reason: 'Quarterly payout',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Partial payout request created successfully',
    type: PayoutResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      'Invalid amount, insufficient balance, or validation failed',
    schema: {
      example: {
        statusCode: 400,
        message:
          'Requested amount $300 exceeds available balance $250. ' +
          'Total earnings: $500, Total paid out: $100, Pending payouts: $150.',
        error: 'Bad Request',
      },
    },
  })
  async requestPartialPayout(
    @Req() req: RequestWithUser,
    @Body() dto: CreatePayoutRequestDto,
  ) {
    // Validate amount first
    await this.balanceService.validatePayoutAmount(
      req.user.userId,
      dto.amount,
    );

    // Reserve balance atomically
    const payoutId = await this.balanceService.reserveBalance(
      req.user.userId,
      dto.amount,
      dto.payoutMethodId,
      dto.walletId,
    );

    // Return created payout
    return this.payoutsService.getPayoutById(req.user.userId, payoutId);
  }

  @Post('request')
  @ApiOperation({
    summary: 'Request a payout with specified amount and method',
    description:
      'Initiates a creator payout. Requires JWT. The requested amount must meet ' +
      'the minimum payout threshold (default 5 USD equivalent, configurable via ' +
      'the MIN_STELLAR_PAYOUT environment variable); requests below the threshold ' +
      'are rejected with a 400 validation error.',
  })
  @ApiBody({
    type: CreatePayoutDto,
    examples: {
      stellar: {
        summary: 'Stellar payout request',
        value: { amount: 120, currency: 'USD', method: 'stellar' },
      },
      fiat: {
        summary: 'Bank transfer payout request',
        value: { amount: 250, currency: 'USD', method: 'fiat' },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Pending payout request created successfully',
    type: PayoutResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      'Request failed validation: malformed body, amount below the minimum or above the maximum payout, ' +
      'insufficient balance, or no Stellar wallet / default payout method configured.',
    content: {
      'application/json': {
        schema: validationErrorSchema,
        examples: {
          dtoValidation: {
            summary: 'Malformed body',
            value: {
              statusCode: 400,
              message: ['amount must be a valid number', 'method must be one of: fiat, stellar'],
              error: 'Bad Request',
            },
          },
          belowMinimum: {
            summary: 'Below minimum payout',
            ...payoutError(400, 'Bad Request', 'Minimum payout amount is 5 USD equivalent. Requested: 3 USD.'),
          },
          aboveMaximum: {
            summary: 'Above per-currency maximum',
            ...payoutError(400, 'Bad Request', 'Maximum payout for USD is 10000. Requested amount: 12000.'),
          },
          insufficientBalance: {
            summary: 'Insufficient balance',
            ...payoutError(400, 'Bad Request', 'Insufficient balance. Available: 80 USD'),
          },
          noWallet: {
            summary: 'No Stellar wallet connected',
            ...payoutError(400, 'Bad Request', 'No active Stellar wallet found. Please connect a wallet first.'),
          },
          noPayoutMethod: {
            summary: 'No default payout method',
            ...payoutError(400, 'Bad Request', 'No default payout method found. Please add a payout method first.'),
          },
        },
      },
    },
  })
  @ApiConflictResponse({
    description: 'The user already has an open payout (pending, pending_review, pending_approval, approved or processing)',
    content: {
      'application/json': {
        schema: validationErrorSchema,
        example: {
          statusCode: 409,
          message: 'A payout request is already pending for this user',
          error: 'Conflict',
        },
      },
    },
  })
  async requestPayout(
    @Req() req: RequestWithUser,
    @Body() dto: CreatePayoutDto,
  ) {
    return this.payoutsService.requestPayoutWithDetails(
      req.user.userId,
      dto.amount,
      dto.currency,
      dto.method,
      dto.destinations,
    );
  }

  @Post('split')
  @ApiOperation({
    summary: 'Request a split payout with fiat and crypto destinations',
    description:
      'Initiates a creator payout split between fiat (bank) and crypto (Stellar) wallets. ' +
      'The request amount is divided among specified destinations based on percentages. ' +
      'Each destination must have a percentage that sums to 100%.',
  })
  @ApiBody({
    type: CreatePayoutDto,
  })
  @ApiResponse({
    status: 201,
    description: 'Split payout requests created successfully',
    type: [PayoutResponseDto],
  })
  @ApiBadRequestResponse({
    description:
      'Invalid request, insufficient balance, percentages do not sum to 100, or minimum payout not met',
  })
  async requestSplitPayout(
    @Req() req: RequestWithUser,
    @Body() dto: CreatePayoutDto,
  ) {
    return this.payoutsService.requestPayoutWithDetails(
      req.user.userId,
      dto.amount,
      dto.currency,
      dto.method,
      dto.destinations,
    );
  }

  @Post('initiate-stellar')
  @ApiOperation({
    summary: 'Prepare an unsigned Stellar payout transaction',
    description:
      'Builds an unsigned Stellar XDR for client signing, stores tracking metadata, and leaves the payout in a pending state.',
  })
  @ApiBody({
    type: InitiateStellarPayoutDto,
    examples: {
      approvedPayout: {
        summary: 'Prepare a Stellar payout transaction',
        value: { payoutId: 101, amount: 100 },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Unsigned Stellar payout transaction prepared successfully',
    type: StellarPayoutInitiationResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      'Validation failed, payout is not ready, or the platform balance is insufficient',
    content: {
      'application/json': {
        schema: validationErrorSchema,
        examples: {
          wrongStatus: {
            summary: 'Payout not in an initiable status',
            ...payoutError(400, 'Bad Request', 'Payout must be approved or pending before Stellar initiation (current status: completed)'),
          },
          amountMismatch: {
            summary: 'Amount differs from the payout record',
            ...payoutError(400, 'Bad Request', 'Requested amount does not match payout amount'),
          },
          invalidDestination: {
            summary: 'Invalid destination address',
            ...payoutError(400, 'Bad Request', 'Invalid destination Stellar address'),
          },
          platformBalance: {
            summary: 'Platform wallet underfunded',
            ...payoutError(400, 'Bad Request', 'Insufficient platform balance. Available: 42 XLM'),
          },
        },
      },
    },
  })
  @ApiConflictResponse({
    description: 'An unsigned Stellar transaction has already been prepared for this payout',
    content: {
      'application/json': {
        schema: validationErrorSchema,
        example: {
          statusCode: 409,
          message: 'A Stellar payout transaction is already pending for this payout',
          error: 'Conflict',
        },
      },
    },
  })
  @ApiNotFoundResponse({ description: 'Payout not found' })
  async initiateStellarPayout(
    @Req() req: RequestWithUser,
    @Body() dto: InitiateStellarPayoutDto,
  ) {
    return this.payoutsService.initiateStellarPayout(
      req.user.userId,
      dto.payoutId,
      dto.amount,
    );
  }

  @Get()
  @ApiOperation({
    summary: 'List payouts for the authenticated user',
    description:
      'Returns payout history for the authenticated user. Results can be filtered by payout status.',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    description: `Filter by payout status.\n\n${PAYOUT_STATUS_SWAGGER_DESCRIPTION}`,
    enum: PAYOUT_STATUS_VALUES,
    example: 'completed',
  })
  @ApiResponse({
    status: 200,
    description: 'List of payouts including on-chain tracking fields (status, onChainTxHash, confirmedAt)',
    type: PayoutResponseDto,
    isArray: true,
  })
  async listPayouts(
    @Req() req: RequestWithUser,
    @Query('status') status?: string,
  ) {
    return this.payoutsService.getPayouts(req.user.userId, status);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a specific payout by ID',
    description:
      'Returns the current payout status and any stored Stellar transaction metadata.',
  })
  @ApiParam({ name: 'id', description: 'Payout ID', example: 1 })
  @ApiResponse({
    status: 200,
    description:
      'Payout details including current status, on-chain transaction hash, and confirmation timestamp',
    type: PayoutResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Payout not found' })
  async getPayout(
    @Req() req: RequestWithUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.payoutsService.getPayoutById(req.user.userId, id);
  }

  @Get(':id/on-chain-status')
  @ApiOperation({
    summary: 'Get real-time on-chain status for a Stellar payout',
    description:
      'Queries Horizon directly for the live on-chain confirmation status of a Stellar payout transaction. ' +
      'Returns the DB record enriched with real-time data from the Stellar network, including whether the ' +
      'transaction was found, succeeded, and when it was confirmed.',
  })
  @ApiParam({ name: 'id', description: 'Payout ID', example: 1 })
  @ApiResponse({
    status: 200,
    description:
      'Real-time on-chain status including found/successful/confirmedAt from Horizon',
    type: PayoutOnChainStatusResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Payout not found' })
  async getOnChainStatus(
    @Req() req: RequestWithUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.payoutsService.getOnChainStatus(req.user.userId, id);
  }

  @Post(':id/process')
  @ApiOperation({
    summary: 'Process a payout',
    description:
      'Submits the payout and verifies the resulting Stellar transaction.',
  })
  @ApiParam({ name: 'id', description: 'Payout ID', example: 1 })
  @ApiResponse({
    status: 200,
    description: 'Payout processed and verified',
    type: PayoutProcessResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Payout is not approved, is already completed, has no wallet, or is below the minimum',
    content: {
      'application/json': {
        schema: validationErrorSchema,
        examples: {
          notApproved: {
            summary: 'Payout not approved',
            ...payoutError(400, 'Bad Request', 'Payout must be approved before processing (current status: pending_review)'),
          },
          alreadyCompleted: {
            summary: 'Payout already completed',
            ...payoutError(400, 'Bad Request', 'Payout is already in completed status'),
          },
        },
      },
    },
  })
  @ApiInternalServerErrorResponse({
    description:
      'Stellar submission or on-chain verification failed. The payout is marked `failed` and a retry is scheduled with exponential backoff until MAX_PAYOUT_RETRIES is reached.',
    schema: validationErrorSchema,
  })
  @ApiNotFoundResponse({ description: 'Payout not found' })
  async processPayout(@Param('id', ParseIntPipe) id: number) {
    return this.payoutsService.processPayout(id);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel a pending payout request' })
  @ApiParam({ name: 'id', description: 'Payout ID', example: 1 })
  @ApiResponse({
    status: 200,
    description: 'Payout canceled successfully',
    type: PayoutResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Payout cannot be canceled' })
  @ApiNotFoundResponse({ description: 'Payout not found' })
  async cancelPayout(
    @Req() req: RequestWithUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.payoutsService.cancelPayout(req.user.userId, id);
  }

  @Get(':id/receipt')
  @ApiOperation({
    summary: 'Download payout receipt as PDF',
    description:
      'Downloads the payout receipt as a PDF file. Receipt must exist for the payout.',
  })
  @ApiParam({ name: 'id', description: 'Payout ID', example: 1 })
  @ApiResponse({
    status: 200,
    description: 'PDF receipt file',
    content: {
      'application/pdf': {
        schema: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiNotFoundResponse({ description: 'Payout or receipt not found' })
  @ApiBadRequestResponse({ description: 'Receipt generation failed' })
  async getPayoutReceipt(
    @Req() req: RequestWithUser,
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.payoutsService.getPayoutReceiptPdf(
      req.user.userId,
      id,
    );

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="payout-receipt-${id}.pdf"`,
    });

    res.send(file);
  }

  @Get(':id/receipt/metadata')
  @ApiOperation({
    summary: 'Get payout receipt metadata',
    description:
      'Retrieves receipt metadata including receipt ID, email status, and timestamps.',
  })
  @ApiParam({ name: 'id', description: 'Payout ID', example: 1 })
  @ApiResponse({
    status: 200,
    description: 'Receipt metadata',
    type: PayoutReceiptDto,
  })
  @ApiNotFoundResponse({ description: 'Receipt not found' })
  async getReceiptMetadata(
    @Req() req: RequestWithUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<PayoutReceiptDto> {
    return this.payoutsService.getReceiptMetadata(req.user.userId, id);
  }
}
