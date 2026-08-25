import { Controller, Get, Post, Patch, Param, Body, HttpCode, HttpStatus, Req } from '@nestjs/common';
import { Request } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiBadRequestResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
} from '@nestjs/swagger';
import { Auth } from '../auth/decorators/auth.decorator';
import { Admin } from '../auth/decorators/admin.decorator';
import { PayoutsService } from './payouts.service';
import { ApprovePayoutDto, RejectPayoutDto } from './dto/payout-review.dto';
import { PayoutResponseDto } from './dto/payout-responses.dto';

interface BatchApproveDto {
  payoutIds: number[];
}

@ApiTags('admin')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Unauthorized' })
@ApiForbiddenResponse({ description: 'Forbidden — admin access required' })
@ApiInternalServerErrorResponse({ description: 'Internal server error' })
@Controller('admin/payouts')
@Auth()
@Admin()
export class AdminPayoutsController {
  constructor(private readonly payoutsService: PayoutsService) {}

  @Get('pending-review')
  @ApiOperation({ summary: 'List payouts pending manual review' })
  @ApiResponse({
    status: 200,
    description: 'List of payouts awaiting admin review',
    type: PayoutResponseDto,
    isArray: true,
  })
  listPendingReview() {
    return this.payoutsService.listPendingReviewPayouts();
  }

  @Post('batch-approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Batch approve payouts',
    description: 'Approves multiple payouts at once (admin only)',
  })
  @ApiResponse({ status: 200, description: 'Payouts batch processed' })
  @ApiBadRequestResponse({ description: 'Invalid payout IDs' })
  async batchApprove(@Body() body: BatchApproveDto) {
    return this.payoutsService.batchProcessPayouts(body.payoutIds);
  }

  @Patch(':id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve a pending or pending_review payout' })
  @ApiResponse({
    status: 200,
    description: 'Payout approved',
    type: PayoutResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Payout not in approvable status' })
  @ApiNotFoundResponse({ description: 'Payout not found' })
  approve(
    @Param('id') id: string,
    @Body() dto: ApprovePayoutDto,
    @Req() req: Request,
  ) {
    const adminUserId = (req as any).user?.userId;
    return this.payoutsService.approvePayout(
      parseInt(id, 10),
      adminUserId,
      dto.note,
    );
  }

  @Patch(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject a pending or approved payout' })
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
