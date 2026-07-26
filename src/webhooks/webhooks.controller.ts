import {
  Controller,
  Post,
  Body,
  Headers,
  BadRequestException,
  Logger,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiHeader,
  ApiBadRequestResponse,
  ApiInternalServerErrorResponse,
} from '@nestjs/swagger';
import { WebhooksService } from './webhooks.service';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('webhooks')
@ApiInternalServerErrorResponse({ description: 'Internal server error' })
@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(private readonly webhooksService: WebhooksService) {}

  @Public()
  @Post('tiktok')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Receive TikTok webhook',
    description:
      'Handles incoming TikTok webhook events with signature verification',
  })
  @ApiHeader({
    name: 'x-tiktok-signature',
    description: 'TikTok webhook signature',
    required: true,
  })
  @ApiResponse({ status: 200, description: 'Webhook processed successfully' })
  @ApiBadRequestResponse({ description: 'Invalid signature or payload' })
  async handleTikTokWebhook(
    @Body() body: any,
    @Headers('x-tiktok-signature') signature: string,
  ) {
    this.logger.log('Received TikTok webhook');

    const isValid = await this.webhooksService.validateTikTokSignature(
      body,
      signature,
    );

    if (!isValid) {
      throw new BadRequestException('Invalid signature');
    }

    await this.webhooksService.processTikTokWebhook(body);

    return { received: true };
  }

  @Public()
  @Post('youtube')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Receive YouTube webhook',
    description:
      'Handles incoming YouTube PubSub webhook events with signature verification',
  })
  @ApiHeader({
    name: 'x-hub-signature-256',
    description: 'YouTube webhook HMAC-SHA256 signature',
    required: true,
  })
  @ApiResponse({ status: 200, description: 'Webhook processed successfully' })
  @ApiBadRequestResponse({ description: 'Invalid signature or payload' })
  async handleYouTubeWebhook(
    @Body() body: any,
    @Headers('x-hub-signature-256') signature: string,
  ) {
    this.logger.log('Received YouTube webhook');

    const isValid = await this.webhooksService.validateYouTubeSignature(
      body,
      signature,
    );

    if (!isValid) {
      throw new BadRequestException('Invalid signature');
    }

    await this.webhooksService.processYouTubeWebhook(body);

    return { received: true };
  }
}
