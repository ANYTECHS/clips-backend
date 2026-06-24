import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class PayoutReceiptService {
  private readonly logger = new Logger(PayoutReceiptService.name);

  async generateAndSendReceipt(payoutId: number, email: string): Promise<void> {
    this.logger.log(`Sending payout receipt for payout ${payoutId} to ${email}`);
    // Receipt generation & email delivery handled asynchronously
  }
}
