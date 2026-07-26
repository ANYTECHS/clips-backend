import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  Query,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiQuery,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiInternalServerErrorResponse,
} from '@nestjs/swagger';

import type { Request } from 'express';
import { StellarPaymentService } from './stellar-payment.service';
import { CreateStellarSubscriptionDto } from './dto/create-stellar-subscription.dto';
import { LoginGuard } from '../auth/guards/login.guard';

@ApiTags('subscriptions')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Unauthorized' })
@ApiInternalServerErrorResponse({ description: 'Internal server error' })
@UseGuards(LoginGuard)
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly stellarPaymentService: StellarPaymentService) {}

  @Post('create-stellar')
  @ApiOperation({
    summary:
      'Create Stellar payment intent for subscription (XLM, USDC, or custom asset)',
    description:
      'Creates a payment intent for a Stellar-based subscription. Supports XLM, USDC, and custom assets.',
  })
  @ApiResponse({
    status: 201,
    description: 'Payment intent created successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Payment intent ID' },
        amount: { type: 'number', example: 10 },
        asset: { type: 'string', example: 'xlm' },
        destination: {
          type: 'string',
          description: 'Stellar destination address',
        },
        memo: { type: 'string', description: 'Payment memo' },
        expiresAt: { type: 'string', format: 'date-time' },
        status: { type: 'string', example: 'pending' },
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Invalid input or unsupported asset' })
  async createStellarPaymentIntent(
    @Body() dto: CreateStellarSubscriptionDto,
    @Req() req: Request,
  ) {
    const userId = Number((req as any).user?.id ?? 0);
    return this.stellarPaymentService.createPaymentIntent(userId, dto);
  }

  @Post('create-intent')
  @ApiOperation({
    summary: 'Create Stellar payment intent for subscription',
    description: 'Alias for create-stellar endpoint',
  })
  @ApiResponse({
    status: 201,
    description: 'Payment intent created successfully',
  })
  @ApiBadRequestResponse({ description: 'Invalid input or unsupported asset' })
  async createPaymentIntent(
    @Body() dto: CreateStellarSubscriptionDto,
    @Req() req: Request,
  ) {
    const userId = Number((req as any).user?.id ?? 0);
    return this.stellarPaymentService.createPaymentIntent(userId, dto);
  }

  @Get('stellar/pending')
  @ApiOperation({
    summary: 'Get pending Stellar payment intents',
    description:
      'Returns all pending payment intents for the authenticated user',
  })
  @ApiResponse({
    status: 200,
    description: 'List of pending payment intents',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          amount: { type: 'number' },
          asset: { type: 'string' },
          status: { type: 'string' },
          expiresAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  })
  async getPendingPaymentIntents(@Req() req: Request) {
    const userId = Number((req as any).user?.id ?? 0);
    return this.stellarPaymentService.getPendingPaymentIntents(userId);
  }

  @Post('stellar/verify')
  @ApiOperation({
    summary: 'Verify Stellar payment and activate subscription on success',
    description:
      'Verifies a Stellar payment by transaction hash and activates the subscription if the payment is confirmed.',
  })
  @ApiQuery({
    name: 'paymentIntentId',
    description: 'Payment intent ID',
    required: true,
  })
  @ApiQuery({
    name: 'transactionHash',
    description: 'Stellar transaction hash',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Payment verification result',
    schema: {
      type: 'object',
      properties: {
        verified: {
          type: 'boolean',
          description:
            'verified=true activates the subscription; verified=false leaves it inactive.',
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Missing paymentIntentId or transactionHash',
  })
  @ApiNotFoundResponse({ description: 'Payment intent not found' })
  @HttpCode(HttpStatus.OK)
  async verifyStellarPayment(
    @Query('paymentIntentId') paymentIntentId: string,
    @Query('transactionHash') transactionHash: string,
  ) {
    const verified = await this.stellarPaymentService.verifyPayment(
      paymentIntentId,
      transactionHash,
    );
    return { verified };
  }
}
