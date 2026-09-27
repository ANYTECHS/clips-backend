import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
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
  ApiBody,
} from '@nestjs/swagger';
import { Auth } from '../auth/decorators/auth.decorator';
import { Admin } from '../auth/decorators/admin.decorator';
import { PayoutsService } from './payouts.service';
import { ApprovePayoutDto, RejectPayoutDto } from './dto/payout-review.dto';
import { PayoutResponseDto } from './dto/payout-responses.dto';
import {
  BulkProcessPayoutsDto,
  BulkProcessPayoutsResponseDto,
} from './dto/bulk-process-payouts.dto';
import { MAX_BULK_PAYOUT_BATCH_SIZE } from './payouts.constants';

@ApiTags('admin')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Unauthorized — missing or invalid access token' })
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

  @Post('bulk-process')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Bulk process approved payouts',
    description:
      'Processes multiple approved payouts in one request (admin only). ' +
      `Each payout is validated and processed within its own transaction. ` +
      `Maximum batch size: ${MAX_BULK_PAYOUT_BATCH_SIZE}. ` +
      'Partial failures are returned per item without aborting the whole batch. ' +
      'Audit logs are recorded for each successful or failed verification.',
  })
  @ApiBody({ type: BulkProcessPayoutsDto })
  @ApiResponse({
    status: 200,
    description:
      'Bulk processing completed. Check `results` for per-item success/failure details.',
    type: BulkProcessPayoutsResponseDto,
  })
  @ApiBadRequestResponse({
    description: `Invalid request — empty list, non-integer IDs, or batch exceeds ${MAX_BULK_PAYOUT_BATCH_SIZE}`,
  })
  @ApiUnauthorizedResponse({ description: 'Unauthorized — missing or invalid access token' })
  @ApiForbiddenResponse({ description: 'Forbidden — admin access required' })
  async bulkProcess(
    @Body() body: BulkProcessPayoutsDto,
  ): Promise<BulkProcessPayoutsResponseDto> {
    return this.payoutsService.batchProcessPayouts(body.payoutIds);
  }

  @Post('batch-approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Batch process payouts (legacy alias)',
    description:
      `Alias of POST /admin/payouts/bulk-process. Maximum batch size: ${MAX_BULK_PAYOUT_BATCH_SIZE}.`,
    deprecated: true,
  })
  @ApiBody({ type: BulkProcessPayoutsDto })
  @ApiResponse({
    status: 200,
    description: 'Payouts batch processed',
    type: BulkProcessPayoutsResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid payout IDs or batch too large' })
  async batchApprove(@Body() body: BulkProcessPayoutsDto) {
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
