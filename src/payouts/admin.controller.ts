import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Auth } from '../auth/decorators/auth.decorator';
import { Admin } from '../auth/decorators/admin.decorator';
import { PayoutsService } from './payouts.service';

interface BatchApproveDto {
  payoutIds: number[];
}

@Controller('admin/payouts')
@Auth()
@Admin()
export class AdminPayoutsController {
  constructor(private readonly payoutsService: PayoutsService) {}

  @Post('batch-approve')
  @HttpCode(HttpStatus.OK)
  async batchApprove(@Body() body: BatchApproveDto) {
    return this.payoutsService.batchProcessPayouts(body.payoutIds);
  }
}
