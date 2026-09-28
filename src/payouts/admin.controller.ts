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
  ApiParam,
} from '@nestjs/swagger';
import { Auth } from '../auth/decorators/auth.decorator';
import { PayoutsService } from './payouts.service';
import { ApprovePayoutDto, RejectPayoutDto } from './dto/payout-review.dto';
import { PayoutResponseDto } from './dto/payout-responses.dto';
import { API_ERROR_SCHEMA } from '../common/dtos';

interface BatchApproveDto {
  payoutIds: number[];
}

interface RequestWithAdmin extends Request {
  user: { userId: number; role?: string };
}

/**
 * Admin payout approval workflow (#988).
 *
 * Lifecycle:
 *   pending → under_review → approved | rejected → processing → completed | failed
 */
@ApiTags('admin')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({
  description: 'Unauthorized — JWT token required',
  schema: API_ERROR_SCHEMA,
})
@ApiForbiddenResponse({
  description: 'unauthorized-admin — caller is not an admin',
  schema: {
    example: {
      statusCode: 403,
      errorCode: 'UNAUTHORIZED_ADMIN',
      message: 'unauthorized-admin',
      reason: 'Required roles: admin',
    },
  },
})
@ApiInternalServerErrorResponse({ description: 'Internal server error' })
@Controller('admin/payouts')
@Auth('admin')
export class AdminPayoutsController {
  constructor(private readonly payoutsService: PayoutsService) {}

  @Get('pending-review')
  @ApiOperation({
    summary: 'List payouts under review',
    description:
      'Returns payouts in `under_review` (or legacy `pending_review`) awaiting admin action.',
  })
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
    summary: 'Batch process approved payouts',
    description: 'Processes multiple already-approved payouts (admin only)',
  })
  @ApiResponse({ status: 200, description: 'Payouts batch processed' })
  @ApiBadRequestResponse({ description: 'Invalid payout IDs' })
  async batchApprove(@Body() body: BatchApproveDto) {
    return this.payoutsService.batchProcessPayouts(body.payoutIds);
  }

  @Patch(':id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Approve a payout under review',
    description:
      'Transitions: under_review → approved. Records the approving admin and notifies the user.',
  })
  @ApiParam({ name: 'id', description: 'Payout ID', example: 1 })
  @ApiBody({ type: ApprovePayoutDto })
  @ApiResponse({
    status: 200,
    description: 'Payout approved — status is now `approved`',
    type: PayoutResponseDto,
    content: {
      'application/json': {
        examples: {
          approved: {
            summary: 'Approved payout',
            value: {
              id: 42,
              status: 'approved',
              approvedAt: '2026-09-27T12:00:00.000Z',
              approvedBy: 7,
            },
          },
        },
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Payout not in approvable status' })
  @ApiNotFoundResponse({ description: 'Payout not found' })
  approve(
    @Param('id') id: string,
    @Body() dto: ApprovePayoutDto,
    @Req() req: RequestWithAdmin,
  ) {
    return this.payoutsService.approvePayout(
      parseInt(id, 10),
      req.user.userId,
      dto.note,
    );
  }

  @Patch(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reject a payout under review',
    description:
      'Transitions: under_review → rejected. Requires a rejection reason, records the admin, and notifies the user.',
  })
  @ApiParam({ name: 'id', description: 'Payout ID', example: 1 })
  @ApiBody({
    type: RejectPayoutDto,
    examples: {
      docs: {
        summary: 'Rejection with reason',
        value: { reason: 'Insufficient documentation' },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Payout rejected — status is now `rejected`',
    type: PayoutResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Payout cannot be rejected in current status, or reason missing',
  })
  @ApiNotFoundResponse({ description: 'Payout not found' })
  reject(
    @Param('id') id: string,
    @Body() dto: RejectPayoutDto,
    @Req() req: RequestWithAdmin,
  ) {
    return this.payoutsService.rejectPayout(
      parseInt(id, 10),
      dto.reason,
      req.user.userId,
    );
  }
}
