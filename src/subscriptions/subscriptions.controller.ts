import {
  Controller,
  Post,
  Get,
  Body,
  Req,
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
  ApiBody,
} from '@nestjs/swagger';

import type { Request } from 'express';
import { StellarPaymentService } from './stellar-payment.service';
import {
  CreateStellarSubscriptionDto,
  StellarPaymentIntentDto,
} from './dto/create-stellar-subscription.dto';
import { Auth } from '../auth/decorators/auth.decorator';

@ApiTags('subscriptions')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Unauthorized' })
@ApiInternalServerErrorResponse({ description: 'Internal server error' })
@Auth()
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
  @ApiBody({ type: CreateStellarSubscriptionDto })
  @ApiResponse({
    status: 201,
    description: 'Payment intent created successfully (Success response)',
    type: StellarPaymentIntentDto,
  })
  @ApiResponse({
    status: 202,
    description: 'Payment intent pending confirmation (Pending response)',
    type: StellarPaymentIntentDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid input or unsupported asset (Failure response)',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
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
  @ApiBody({ type: CreateStellarSubscriptionDto })
  @ApiResponse({
    status: 201,
    description: 'Payment intent created successfully (Success response)',
    type: StellarPaymentIntentDto,
  })
  @ApiResponse({
    status: 202,
    description: 'Payment intent pending confirmation (Pending response)',
    type: StellarPaymentIntentDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid input or unsupported asset (Failure response)',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
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
    description: 'List of pending payment intents (Pending response)',
    type: [StellarPaymentIntentDto],
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiBadRequestResponse({ description: 'Invalid request (Failure response)' })
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
    description: 'Payment verification successful (Success response)',
    schema: {
      type: 'object',
      properties: {
        verified: {
          type: 'boolean',
          description:
            'verified=true activates the subscription; verified=false leaves it inactive.',
          example: true,
        },
      },
    },
  })
  @ApiResponse({
    status: 202,
    description: 'Payment verification pending (Pending response)',
    schema: {
      type: 'object',
      properties: {
        verified: {
          type: 'boolean',
          example: false,
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description:
      'Missing paymentIntentId or transactionHash (Failure response)',
  })
  @ApiNotFoundResponse({
    description: 'Payment intent not found (Failure response)',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
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
