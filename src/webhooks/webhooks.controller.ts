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
import { WebhooksService } from './webhooks.service';
import { Public } from '../auth/decorators/public.decorator';

@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(private readonly webhooksService: WebhooksService) {}

  @Public()
  @Post('tiktok')
  @HttpCode(HttpStatus.OK)
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
