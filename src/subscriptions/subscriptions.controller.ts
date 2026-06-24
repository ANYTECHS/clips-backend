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
import { ApiOperation, ApiResponse, ApiTags, ApiQuery } from '@nestjs/swagger';

import type { Request } from 'express';
import { StellarPaymentService } from './stellar-payment.service';
import { CreateStellarSubscriptionDto } from './dto/create-stellar-subscription.dto';
import { LoginGuard } from '../auth/guards/login.guard';

@ApiTags('subscriptions')
@UseGuards(LoginGuard)
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly stellarPaymentService: StellarPaymentService) {}

  @Post('create-stellar')
  @ApiOperation({ summary: 'Create Stellar payment intent for subscription' })
  @ApiResponse({
    status: 201,
    description: 'Payment intent created successfully',
  })
  async createStellarPaymentIntent(
    @Body() dto: CreateStellarSubscriptionDto,
    @Req() req: Request,
  ) {
    const userId = Number((req as any).user?.id ?? 0);
    return this.stellarPaymentService.createPaymentIntent(userId, dto);
  }

  @Post('create-intent')
  @ApiOperation({ summary: 'Create Stellar payment intent for subscription' })
  @ApiResponse({
    status: 201,
    description: 'Payment intent created successfully',
  })
  async createPaymentIntent(
    @Body() dto: CreateStellarSubscriptionDto,
    @Req() req: Request,
  ) {
    const userId = Number((req as any).user?.id ?? 0);
    return this.stellarPaymentService.createPaymentIntent(userId, dto);
  }

  @Get('stellar/pending')
  @ApiOperation({ summary: 'Get pending Stellar payment intents' })
  @ApiResponse({
    status: 200,
    description: 'List of pending payment intents',
  })
  async getPendingPaymentIntents(@Req() req: Request) {
    const userId = Number((req as any).user?.id ?? 0);
    return this.stellarPaymentService.getPendingPaymentIntents(userId);
  }

  @Post('stellar/verify')
  @ApiOperation({ summary: 'Verify Stellar payment transaction' })
  @ApiQuery({ name: 'paymentIntentId', description: 'Payment intent ID' })
  @ApiQuery({ name: 'transactionHash', description: 'Stellar transaction hash' })
  @ApiResponse({
    status: 200,
    description: 'Payment verification result',
  })
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
