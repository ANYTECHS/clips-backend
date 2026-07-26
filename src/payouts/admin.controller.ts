import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiBadRequestResponse,
  ApiInternalServerErrorResponse,
} from '@nestjs/swagger';
import { Auth } from '../auth/decorators/auth.decorator';
import { Admin } from '../auth/decorators/admin.decorator';
import { PayoutsService } from './payouts.service';

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
}
