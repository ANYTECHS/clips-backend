import { Controller, Post, Body, Req, ValidationPipe, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Auth } from '../auth/decorators/auth.decorator';
import { TransactionsService } from './transactions.service';
import { CreateTransactionDto } from './dto/send-transaction.dto';

@ApiTags('transactions')
@ApiBearerAuth('access-token')
@Controller('transactions')
@Auth()
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post('send')
  @Throttle({ transactionSend: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    summary: "Send XLM from the user's custodial wallet",
    description:
      'Backend builds, signs, and submits the Stellar transaction. ' +
      'Frontend only provides amount + destination. ' +
      'Supply an Idempotency-Key header to safely retry without double-spending.',
  })
  @ApiResponse({ status: 200, description: 'Transaction submitted, returns hash' })
  @ApiResponse({ status: 400, description: 'Invalid destination or amount / self-send attempt' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'No custodial wallet found' })
  @ApiResponse({ status: 422, description: 'Daily volume limit reached' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async send(
    @Req() req: any,
    @Headers('Idempotency-Key') idempotencyKey: string | undefined,
    @Body(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
    dto: CreateTransactionDto,
  ) {
    return this.transactionsService.send(req.user.userId, dto, idempotencyKey?.trim() || undefined);
  }
}

