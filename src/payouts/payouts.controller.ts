import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
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
import { Request } from 'express';
import { Auth } from '../auth/decorators/auth.decorator';
import { CreatePayoutDto } from './dto/request-payout.dto';
import { InitiateStellarPayoutDto } from './dto/initiate-stellar-payout.dto';
import {
  PayoutProcessResponseDto,
  PayoutResponseDto,
  StellarPayoutInitiationResponseDto,
} from './dto/payout-responses.dto';
import { PayoutsService } from './payouts.service';

interface RequestWithUser extends Request {
  user: { userId: number };
}

const validationErrorSchema = {
  type: 'object',
  properties: {
    message: {
      type: 'array',
      items: { type: 'string' },
      example: [
        'property unexpected should not exist',
        'amount must not be less than 0.01',
      ],
    },
    error: { type: 'string', example: 'Bad Request' },
    statusCode: { type: 'number', example: 400 },
  },
};

@ApiTags('payout')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Unauthorized' })
@ApiInternalServerErrorResponse({ description: 'Internal server error' })
@Controller('payouts')
@Auth()
export class PayoutsController {
  constructor(private readonly payoutsService: PayoutsService) {}

  @Post('request')
  @ApiOperation({
    summary: 'Request a payout with specified amount and method',
    description:
      'Initiates a creator payout. Requires JWT. The requested amount must meet ' +
      'the minimum payout threshold (default 5 USD equivalent, configurable via ' +
      'the MIN_STELLAR_PAYOUT environment variable); requests below the threshold ' +
      'are rejected with a 400 validation error.',
      'Creates a payout request and returns the pending payout record for the authenticated creator.',
  })
  @ApiBody({
    type: CreatePayoutDto,
    examples: {
      stellar: {
        summary: 'Stellar payout request',
        value: { amount: 120, currency: 'USD', method: 'stellar' },
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
      'Invalid request, insufficient balance, or amount below the minimum payout threshold',
    schema: {
      example: {
        statusCode: 400,
        message: 'Minimum payout amount is 5 USD equivalent.',
        error: 'Bad Request',
      },
    },
      'Invalid request payload, minimum threshold failure, or insufficient balance',
    schema: validationErrorSchema,
  })
  @ApiConflictResponse({ description: 'Pending payout already exists' })
  async requestPayout(
    @Req() req: RequestWithUser,
    @Body() dto: CreatePayoutDto,
  ) {
    return this.payoutsService.requestPayoutWithDetails(
      req.user.userId,
      dto.amount,
      dto.currency,
      dto.method,
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
    schema: validationErrorSchema,
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
    description: 'Payout history. Optionally filter by status. Requires JWT.',
    description:
      'Returns payout history for the authenticated user. Results can be filtered by payout status.',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Filter by payout status',
    enum: [
      'pending',
      'pending_approval',
      'approved',
      'processing',
      'completed',
      'failed',
      'rejected',
      'canceled',
    ],
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
    description: 'Returns payout status and on-chain tracking details. Requires JWT.',
    description:
      'Returns the current payout status and any stored Stellar transaction metadata.',
  })
  @ApiParam({ name: 'id', description: 'Payout ID', example: 1 })
  @ApiResponse({
    status: 200,
    description:
      'Payout details including current status, on-chain transaction hash, and confirmation timestamp',
    description: 'Payout details',
    type: PayoutResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Payout not found' })
  async getPayout(
    @Req() req: RequestWithUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.payoutsService.getPayoutById(req.user.userId, id);
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
    description: 'Payout is not approved or on-chain verification failed',
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
}
