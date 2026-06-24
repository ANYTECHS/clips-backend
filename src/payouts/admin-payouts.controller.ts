import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiHeader } from '@nestjs/swagger';
import { AdminGuard } from '../common/guards/admin.guard';
import { PayoutsService } from './payouts.service';

class RejectPayoutDto {
  reason?: string;
}

@ApiTags('admin/payouts')
@ApiHeader({ name: 'x-admin-secret', description: 'Admin secret key', required: true })
@UseGuards(AdminGuard)
@Controller('admin/payouts')
export class AdminPayoutsController {
  constructor(private readonly payoutsService: PayoutsService) {}

  @Get()
  @ApiOperation({ summary: 'List pending/approved payouts awaiting action' })
  @ApiResponse({ status: 200, description: 'List of payouts' })
  listPending() {
    return this.payoutsService.listPendingPayouts();
  }

  @Post(':id/approve')
  @ApiOperation({ summary: 'Approve a pending payout' })
  @ApiParam({ name: 'id', description: 'Payout ID' })
  @ApiResponse({ status: 200, description: 'Payout approved' })
  @ApiResponse({ status: 400, description: 'Payout not in pending status' })
  @ApiResponse({ status: 404, description: 'Payout not found' })
  approve(@Param('id') id: string) {
    return this.payoutsService.approvePayout(parseInt(id, 10));
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Reject a pending or approved payout' })
  @ApiParam({ name: 'id', description: 'Payout ID' })
  @ApiResponse({ status: 200, description: 'Payout rejected' })
  @ApiResponse({ status: 400, description: 'Payout cannot be rejected in current status' })
  @ApiResponse({ status: 404, description: 'Payout not found' })
  reject(@Param('id') id: string, @Body() dto: RejectPayoutDto) {
    return this.payoutsService.rejectPayout(parseInt(id, 10), dto.reason);
  }
}
