import {
  Controller,
  Post,
  Get,
  Param,
  Query,
  Body,
  Req,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
  ApiBody,
  ApiUnauthorizedResponse,
  ApiInternalServerErrorResponse,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiNotFoundResponse,
} from '@nestjs/swagger';
import { Auth } from '../auth/decorators/auth.decorator';
import { PayoutsService } from './payouts.service';
import { CreatePayoutDto } from './dto/request-payout.dto';
import { InitiateStellarPayoutDto } from './dto/initiate-stellar-payout.dto';
import {
  PayoutProcessResponseDto,
  PayoutResponseDto,
  StellarPayoutInitiationResponseDto,
} from './dto/payout-responses.dto';
import { Request } from 'express';

interface RequestWithUser extends Request {
  user: { userId: number };
}

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
    description: 'Initiates a creator payout. Requires JWT.',
  })
  @ApiBody({ type: CreatePayoutDto })
  @ApiResponse({
    status: 201,
    description: 'Payout request created',
    type: PayoutResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid request or insufficient balance',
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
    description: 'Builds Stellar XDR for client signing. Requires JWT.',
  })
  @ApiBody({ type: InitiateStellarPayoutDto })
  @ApiResponse({
    status: 201,
    description: 'Unsigned Stellar payout XDR returned; payout marked pending',
    type: StellarPayoutInitiationResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid payout request or insufficient balance',
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
  @ApiOperation({ summary: 'List payouts for the authenticated user' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by payout status (pending, processing, completed, failed, approved, pending_approval)' })
  @ApiResponse({
    status: 200,
    description: 'List of payouts including on-chain tracking fields',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'number' },
          amount: { type: 'number' },
          currency: { type: 'string' },
          method: { type: 'string' },
          status: {
            type: 'string',
            enum: ['pending', 'pending_approval', 'approved', 'processing', 'completed', 'failed'],
          },
          onChainTxHash: {
            type: 'string',
            nullable: true,
            description: 'Stellar transaction hash once submitted on-chain',
          },
          confirmedAt: {
            type: 'string',
            format: 'date-time',
            nullable: true,
            description: 'Timestamp when the transaction was confirmed on Horizon',
          },
          retryCount: {
            type: 'number',
            description: 'Number of on-chain confirmation poll attempts',
          },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
    },
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
    description: 'List of payouts',
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
    description: 'Returns payout status and details. Requires JWT.',
  })
  @ApiParam({ name: 'id', description: 'Payout ID', example: 1 })
  @ApiResponse({
    status: 200,
    description: 'Payout details including current status',
    type: PayoutResponseDto,
  })
  @ApiOperation({ summary: 'Get a specific payout by ID' })
  @ApiParam({ name: 'id', description: 'Payout ID' })
  @ApiResponse({
    status: 200,
    description: 'Payout details including on-chain status tracking',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'number' },
        amount: { type: 'number' },
        currency: { type: 'string' },
        method: { type: 'string' },
        status: {
          type: 'string',
          enum: ['pending', 'pending_approval', 'approved', 'processing', 'completed', 'failed'],
        },
        onChainTxHash: {
          type: 'string',
          nullable: true,
          description: 'Stellar transaction hash once submitted on-chain',
        },
        confirmedAt: {
          type: 'string',
          format: 'date-time',
          nullable: true,
          description: 'Timestamp when the transaction was confirmed on Horizon',
        },
        retryCount: {
          type: 'number',
          description: 'Number of on-chain confirmation poll attempts made so far',
        },
        stellarXdr: {
          type: 'string',
          nullable: true,
          description: 'Unsigned XDR envelope (present while awaiting signature)',
        },
        createdAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Payout not found' })
  @ApiResponse({ status: 200, description: 'Payout details' })
  @ApiNotFoundResponse({ description: 'Payout not found' })
  async getPayout(
    @Req() req: RequestWithUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.payoutsService.getPayoutById(req.user.userId, id);
  }

  @Post(':id/process')
  @ApiOperation({
    summary: 'Process a payout (trigger Stellar transfer)',
    description:
      'Submits the Stellar transfer and verifies the on-chain transaction.',
  })
  @ApiParam({ name: 'id', description: 'Payout ID', example: 1 })
  @ApiResponse({
    status: 200,
    description: 'Payout processed and verified on-chain',
    type: PayoutProcessResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Payout not approved or verification failed',
  })
  @ApiNotFoundResponse({ description: 'Payout not found' })
  async processPayout(@Param('id') id: string) {
    return this.payoutsService.processPayout(parseInt(id, 10));
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
