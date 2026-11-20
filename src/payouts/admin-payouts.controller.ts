import { Controller, Get, Post, Patch, Param, Body, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiHeader,
  ApiBody,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
} from '@nestjs/swagger';
import { AdminGuard } from '../common/guards/admin.guard';
import { PayoutsService } from './payouts.service';
import { PayoutResponseDto } from './dto/payout-responses.dto';
import { RejectPayoutDto } from './dto/payout-review.dto';
import { ParsePositiveIntPipe } from '../common/pipes';

@ApiTags('Admin')
@ApiHeader({
  name: 'x-admin-secret',
  description: 'Admin secret key',
  required: true,
})
@ApiUnauthorizedResponse({ description: 'Unauthorized' })
@ApiForbiddenResponse({ description: 'Forbidden — invalid admin secret' })
@ApiInternalServerErrorResponse({ description: 'Internal server error' })
@UseGuards(AdminGuard)
@Controller('admin/payouts')
export class AdminPayoutsController {
  constructor(private readonly payoutsService: PayoutsService) {}

  @Get()
  @ApiOperation({ summary: 'List pending/approved payouts awaiting action' })
  @ApiResponse({
    status: 200,
    description: 'List of payouts',
    type: PayoutResponseDto,
    isArray: true,
  })
  listPending() {
    return this.payoutsService.listPendingPayouts();
  }

  @Post(':id/approve')
  @ApiOperation({ summary: 'Approve a pending payout' })
  @ApiParam({ name: 'id', description: 'Positive integer payout ID', type: Number, example: 1 })
  @ApiResponse({
    status: 200,
    description: 'Payout approved',
    type: PayoutResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid payout ID or payout not in pending status' })
  @ApiNotFoundResponse({ description: 'Payout not found' })
  approve(@Param('id', ParsePositiveIntPipe) id: number) {
    return this.payoutsService.approvePayout(id);
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Reject a pending or approved payout' })
  @ApiParam({ name: 'id', description: 'Positive integer payout ID', type: Number, example: 1 })
  @ApiBody({ type: RejectPayoutDto })
  @ApiResponse({
    status: 200,
    description: 'Payout rejected',
    type: PayoutResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid payout ID or payout cannot be rejected in current status',
  })
  @ApiNotFoundResponse({ description: 'Payout not found' })
  reject(@Param('id', ParsePositiveIntPipe) id: number, @Body() dto: RejectPayoutDto) {
    return this.payoutsService.rejectPayout(id, dto.reason);
  }
}
