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
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery, ApiParam } from '@nestjs/swagger';
import { Auth } from '../auth/decorators/auth.decorator';
import { PayoutsService } from './payouts.service';
import { CreatePayoutDto } from './dto/request-payout.dto';
import { InitiateStellarPayoutDto } from './dto/initiate-stellar-payout.dto';
import { Request } from 'express';

interface RequestWithUser extends Request {
  user: { userId: number };
}

@ApiTags('payout')
@ApiBearerAuth('access-token')
@Controller('payouts')
@Auth()
export class PayoutsController {
  constructor(private readonly payoutsService: PayoutsService) {}

  @Post('request')
  @ApiOperation({ summary: 'Request a payout with specified amount and method' })
  @ApiResponse({ status: 201, description: 'Payout request created' })
  @ApiResponse({ status: 400, description: 'Invalid request or insufficient balance' })
  @ApiResponse({ status: 409, description: 'Pending payout already exists' })
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
  @ApiOperation({ summary: 'Prepare a Stellar payout transaction' })
  @ApiResponse({ status: 201, description: 'Stellar payout transaction prepared' })
  @ApiResponse({ status: 400, description: 'Invalid payout request or insufficient balance' })
  @ApiResponse({ status: 404, description: 'Payout not found' })
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
  @ApiOperation({ summary: 'List payouts for the authenticated user' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by payout status' })
  @ApiResponse({ status: 200, description: 'List of payouts' })
  async listPayouts(
    @Req() req: RequestWithUser,
    @Query('status') status?: string,
  ) {
    return this.payoutsService.getPayouts(req.user.userId, status);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific payout by ID' })
  @ApiParam({ name: 'id', description: 'Payout ID' })
  @ApiResponse({ status: 200, description: 'Payout details' })
  @ApiResponse({ status: 404, description: 'Payout not found' })
  async getPayout(
    @Req() req: RequestWithUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.payoutsService.getPayoutById(req.user.userId, id);
  }

  @Post(':id/process')
  @ApiOperation({ summary: 'Process a payout (trigger Stellar transfer)' })
  @ApiParam({ name: 'id', description: 'Payout ID' })
  @ApiResponse({ status: 200, description: 'Payout processed' })
  async processPayout(@Param('id') id: string) {
    return this.payoutsService.processPayout(parseInt(id, 10));
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel a pending payout request' })
  @ApiParam({ name: 'id', description: 'Payout ID' })
  @ApiResponse({ status: 200, description: 'Payout canceled successfully' })
  @ApiResponse({ status: 400, description: 'Payout cannot be canceled' })
  @ApiResponse({ status: 404, description: 'Payout not found' })
  async cancelPayout(
    @Req() req: RequestWithUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.payoutsService.cancelPayout(req.user.userId, id);
  }
}
