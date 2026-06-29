import {
  Controller,
  Post,
  Headers,
  UnauthorizedException,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags, ApiHeader } from '@nestjs/swagger';
import { StellarWebhookService } from './stellar-webhook.service';
import { RawBody } from './decorators/raw-body.decorator';

@ApiTags('webhooks')
@Controller('webhooks/stellar')
export class StellarWebhookController {
  constructor(private readonly stellarWebhookService: StellarWebhookService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Receive Stellar payment webhook',
    description: 'Endpoint for receiving Stellar payment webhooks with signature verification',
  })
  @ApiHeader({
    name: 'X-Webhook-Signature',
    description: 'HMAC-SHA256 signature of the raw body (hex encoded)',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Webhook processed successfully or duplicate detected',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid or missing webhook signature',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid webhook payload or processing error',
  })
  async receiveWebhook(
    @RawBody() rawBody: Buffer,
    @Headers('x-webhook-signature') signature: string,
  ): Promise<{ success: boolean; message: string }> {
    // Validate signature header presence
    if (!signature) {
      throw new UnauthorizedException('Missing X-Webhook-Signature header');
    }

    // Validate body presence
    if (!rawBody || rawBody.length === 0) {
      throw new BadRequestException('Missing request body');
    }

    // Process webhook with verification and idempotency
    return this.stellarWebhookService.processWebhook(rawBody, signature);
  }
}
