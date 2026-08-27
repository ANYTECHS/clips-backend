import {
  Controller,
  Post,
  Body,
  Param,
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
  ApiParam,
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
  @Post('earnings/:platform')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Receive earnings webhook from any supported platform',
    description:
      'Generic endpoint for receiving earnings webhooks. Validates platform, signature, checks for duplicates, creates earning, and emits WebSocket event.',
  })
  @ApiParam({
    name: 'platform',
    description: 'Platform identifier (tiktok, youtube, instagram)',
    enum: ['tiktok', 'youtube', 'instagram'],
  })
  @ApiHeader({
    name: 'x-webhook-signature',
    description: 'Platform-specific webhook signature',
    required: false,
  })
  @ApiHeader({
    name: 'x-tiktok-signature',
    description: 'TikTok-specific webhook signature',
    required: false,
  })
  @ApiHeader({
    name: 'x-hub-signature-256',
    description: 'YouTube/Instagram HMAC-SHA256 signature',
    required: false,
  })
  @ApiResponse({ status: 200, description: 'Webhook processed successfully' })
  @ApiBadRequestResponse({
    description: 'Invalid platform, signature, or payload',
  })
  async handleEarningsWebhook(
    @Param('platform') platform: string,
    @Body() body: any,
    @Headers('x-webhook-signature') genericSignature: string,
    @Headers('x-tiktok-signature') tiktokSignature: string,
    @Headers('x-hub-signature-256') hubSignature: string,
  ) {
    const normalizedPlatform = platform.toLowerCase();

    if (!this.webhooksService.isSupportedWebhookPlatform(normalizedPlatform)) {
      throw new BadRequestException(
        `Unsupported platform: "${platform}". Supported platforms: tiktok, youtube, instagram`,
      );
    }

    const typedPlatform = normalizedPlatform;

    const signature = genericSignature || tiktokSignature || hubSignature;

    if (signature) {
      const isValid = this.webhooksService.validateSignature(
        typedPlatform,
        body,
        signature,
      );

      if (!isValid) {
        throw new BadRequestException('Invalid webhook signature');
      }
    }

    this.logger.log(`Received earnings webhook from ${typedPlatform}`);

    const result = await this.webhooksService.processWebhook(
      typedPlatform,
      body,
      signature,
    );

    return { received: true, duplicate: result.duplicate ?? false };
  }

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

    const isValid = this.webhooksService.validateTikTokSignature(
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

    const isValid = this.webhooksService.validateYouTubeSignature(
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
