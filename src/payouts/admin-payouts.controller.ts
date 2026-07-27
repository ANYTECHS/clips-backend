import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
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
import { PayoutResponseDto, RejectPayoutDto } from './dto/payout-responses.dto';

@ApiTags('admin')
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
  @ApiParam({ name: 'id', description: 'Payout ID', example: 1 })
  @ApiResponse({
    status: 200,
    description: 'Payout approved',
    type: PayoutResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Payout not in pending status' })
  @ApiNotFoundResponse({ description: 'Payout not found' })
  approve(@Param('id') id: string) {
    return this.payoutsService.approvePayout(parseInt(id, 10));
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Reject a pending or approved payout' })
  @ApiParam({ name: 'id', description: 'Payout ID', example: 1 })
  @ApiBody({ type: RejectPayoutDto })
  @ApiResponse({
    status: 200,
    description: 'Payout rejected',
    type: PayoutResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Payout cannot be rejected in current status',
  })
  @ApiNotFoundResponse({ description: 'Payout not found' })
  reject(@Param('id') id: string, @Body() dto: RejectPayoutDto) {
    return this.payoutsService.rejectPayout(parseInt(id, 10), dto.reason);
  }
}
