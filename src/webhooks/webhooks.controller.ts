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
  ApiBody,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiInternalServerErrorResponse,
} from '@nestjs/swagger';
import { WebhooksService } from './webhooks.service';
import { Public } from '../auth/decorators/public.decorator';
import { ProcessWebhookDto } from './dto/process-webhook.dto';

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
    summary: 'Receive earnings webhook from a social platform',
    description:
      'Accepts earnings events from TikTok, YouTube, or Instagram. ' +
      'Validates the platform-specific signature header, validates the payload, ' +
      'deduplicates by event_id, creates an Earning record, invalidates earnings cache, ' +
      'and emits earnings events for downstream processing.\n\n' +
      '**Signature validation:** HMAC-SHA256 over the JSON body using the platform secret ' +
      '(TIKTOK_WEBHOOK_SECRET / YOUTUBE_WEBHOOK_SECRET / INSTAGRAM_WEBHOOK_SECRET). ' +
      'YouTube/Instagram signatures use the `sha256=<hex>` form.\n\n' +
      '**Duplicate behavior:** If the same platform + event_id was already processed, ' +
      'the endpoint returns HTTP 200 with `{ received: true, duplicate: true }` and ' +
      'does not create another earning.',
  })
  @ApiParam({
    name: 'platform',
    description: 'Platform identifier',
    enum: ['tiktok', 'youtube', 'instagram'],
  })
  @ApiHeader({
    name: 'x-webhook-signature',
    description: 'Generic webhook signature (any platform)',
    required: false,
  })
  @ApiHeader({
    name: 'x-tiktok-signature',
    description: 'TikTok HMAC-SHA256 hex digest',
    required: false,
  })
  @ApiHeader({
    name: 'x-hub-signature-256',
    description: 'YouTube/Instagram signature (`sha256=<hex>`)',
    required: false,
  })
  @ApiBody({ type: ProcessWebhookDto })
  @ApiResponse({
    status: 200,
    description:
      'Webhook acknowledged. `duplicate: true` means the event was already processed.',
    schema: {
      examples: {
        created: {
          value: { received: true, duplicate: false, earningId: 42 },
        },
        duplicate: {
          value: { received: true, duplicate: true },
        },
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid webhook signature',
    schema: {
      example: {
        statusCode: 401,
        message: 'Invalid webhook signature',
        error: 'Unauthorized',
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Unsupported platform or invalid payload',
  })
  async handleEarningsWebhook(
    @Param('platform') platform: string,
    @Body() body: ProcessWebhookDto,
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

    const signature = genericSignature || tiktokSignature || hubSignature;
    this.webhooksService.assertValidSignature(
      normalizedPlatform,
      body,
      signature,
    );

    this.logger.log(`Received earnings webhook from ${normalizedPlatform}`);

    const result = await this.webhooksService.processWebhook(
      normalizedPlatform,
      body,
      signature,
    );

    return {
      received: true,
      duplicate: result.duplicate ?? false,
      ...(result.earningId != null ? { earningId: result.earningId } : {}),
    };
  }

  @Public()
  @Post('tiktok')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Receive TikTok earnings webhook',
    description:
      'Platform-specific TikTok handler with `x-tiktok-signature` verification.',
  })
  @ApiHeader({
    name: 'x-tiktok-signature',
    description: 'TikTok webhook signature (HMAC-SHA256 hex)',
    required: true,
  })
  @ApiBody({ type: ProcessWebhookDto })
  @ApiResponse({
    status: 200,
    description: 'Webhook acknowledged',
    schema: { example: { received: true } },
  })
  @ApiUnauthorizedResponse({ description: 'Invalid signature' })
  @ApiBadRequestResponse({ description: 'Invalid payload' })
  async handleTikTokWebhook(
    @Body() body: ProcessWebhookDto,
    @Headers('x-tiktok-signature') signature: string,
  ) {
    this.logger.log('Received TikTok webhook');
    this.webhooksService.assertValidSignature('tiktok', body, signature);
    await this.webhooksService.processTikTokWebhook(body);
    return { received: true };
  }

  @Public()
  @Post('youtube')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Receive YouTube earnings webhook',
    description:
      'Platform-specific YouTube handler with `x-hub-signature-256` verification.',
  })
  @ApiHeader({
    name: 'x-hub-signature-256',
    description: 'YouTube webhook HMAC-SHA256 signature (`sha256=<hex>`)',
    required: true,
  })
  @ApiBody({ type: ProcessWebhookDto })
  @ApiResponse({
    status: 200,
    description: 'Webhook acknowledged',
    schema: { example: { received: true } },
  })
  @ApiUnauthorizedResponse({ description: 'Invalid signature' })
  @ApiBadRequestResponse({ description: 'Invalid payload' })
  async handleYouTubeWebhook(
    @Body() body: ProcessWebhookDto,
    @Headers('x-hub-signature-256') signature: string,
  ) {
    this.logger.log('Received YouTube webhook');
    this.webhooksService.assertValidSignature('youtube', body, signature);
    await this.webhooksService.processYouTubeWebhook(body);
    return { received: true };
  }

  @Public()
  @Post('instagram')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Receive Instagram earnings webhook',
    description:
      'Platform-specific Instagram handler with `x-hub-signature-256` verification.',
  })
  @ApiHeader({
    name: 'x-hub-signature-256',
    description: 'Instagram webhook HMAC-SHA256 signature (`sha256=<hex>`)',
    required: true,
  })
  @ApiBody({ type: ProcessWebhookDto })
  @ApiResponse({
    status: 200,
    description: 'Webhook acknowledged',
    schema: { example: { received: true } },
  })
  @ApiUnauthorizedResponse({ description: 'Invalid signature' })
  @ApiBadRequestResponse({ description: 'Invalid payload' })
  async handleInstagramWebhook(
    @Body() body: ProcessWebhookDto,
    @Headers('x-hub-signature-256') signature: string,
  ) {
    this.logger.log('Received Instagram webhook');
    this.webhooksService.assertValidSignature('instagram', body, signature);
    await this.webhooksService.processInstagramWebhook(body);
    return { received: true };
  }
}
