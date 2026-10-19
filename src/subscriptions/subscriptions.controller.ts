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
  ApiExtraModels,
  getSchemaPath,
} from '@nestjs/swagger';
import { ApiStandardErrors } from '../common/decorators/api-standard-errors.decorator';

import type { Request } from 'express';
import { StellarPaymentService } from './stellar-payment.service';
import {
  CreateStellarSubscriptionDto,
  StellarPaymentIntentDto,
} from './dto/create-stellar-subscription.dto';
import { Auth } from '../auth/decorators/auth.decorator';

@ApiTags('subscriptions', 'payments')
@ApiExtraModels(StellarPaymentIntentDto)
@ApiBearerAuth('access-token')
@ApiStandardErrors()
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
    schema: {
      allOf: [{ $ref: getSchemaPath(StellarPaymentIntentDto) }],
      example: {
        id: 'pi_01HXYZ',
        amount: 10,
        asset: 'xlm',
        destination: 'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
        memo: 'sub-pro-2026-07',
        expiresAt: '2026-07-26T13:00:00.000Z',
        status: 'pending',
        assetIssuer: null,
      },
    },
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
    schema: {
      allOf: [{ $ref: getSchemaPath(StellarPaymentIntentDto) }],
      example: {
        id: 'pi_01HXYZ',
        amount: 10,
        asset: 'xlm',
        destination: 'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
        memo: 'sub-pro-2026-07',
        expiresAt: '2026-07-26T13:00:00.000Z',
        status: 'pending',
        assetIssuer: null,
      },
    },
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
      'Returns unexpired pending payment intents for the authenticated user. The status describes each payment intent, not the user\'s subscription.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of pending payment intents (Pending response)',
    schema: {
      type: 'array',
      items: { $ref: getSchemaPath(StellarPaymentIntentDto) },
      example: [
        {
          id: 'pi_01HXYZ',
          amount: 10,
          asset: 'xlm',
          destination:
            'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
          memo: 'sub-pro-2026-07',
          expiresAt: '2026-07-26T13:00:00.000Z',
          status: 'pending',
          assetIssuer: null,
        },
      ],
    },
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
      example: { verified: true },
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
