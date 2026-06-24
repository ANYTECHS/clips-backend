import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EarningsService } from '../earnings/earnings.service';
import { AppConfigService } from '../config/app-config.service';
import * as crypto from 'crypto';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  private readonly tiktokSecret: string | undefined;
  private readonly youtubeSecret: string | undefined;

  constructor(
    private prisma: PrismaService,
    private earningsService: EarningsService,
    appConfig: AppConfigService,
  ) {
    this.tiktokSecret = appConfig.tiktokWebhookSecret;
    this.youtubeSecret = appConfig.youtubeWebhookSecret;
  }

  async validateTikTokSignature(payload: any, signature: string): Promise<boolean> {
    if (!this.tiktokSecret) {
      this.logger.warn('TIKTOK_WEBHOOK_SECRET not configured, skipping validation');
      return true;
    }

    const hmac = crypto
      .createHmac('sha256', this.tiktokSecret)
      .update(JSON.stringify(payload))
      .digest('hex');

    return hmac === signature;
  }

  async validateYouTubeSignature(payload: any, signature: string): Promise<boolean> {
    if (!this.youtubeSecret) {
      this.logger.warn('YOUTUBE_WEBHOOK_SECRET not configured, skipping validation');
      return true;
    }

    const expectedSignature = `sha256=${crypto
      .createHmac('sha256', this.youtubeSecret)
      .update(JSON.stringify(payload))
      .digest('hex')}`;

    return signature === expectedSignature;
  }

  async processTikTokWebhook(payload: any): Promise<void> {
    try {
      await this.prisma.platformWebhookLog.create({
        data: {
          platform: 'tiktok',
          eventType: payload.event_type || 'unknown',
          payload: JSON.stringify(payload),
          signature: payload.signature,
          isValid: true,
        },
      });

      if (payload.event_type === 'video_earnings' && payload.data) {
        await this.createEarningFromWebhook(payload.data, 'tiktok');
      }

      this.logger.log('TikTok webhook processed successfully');
    } catch (error) {
      this.logger.error('Failed to process TikTok webhook:', error);

      await this.prisma.platformWebhookLog.create({
        data: {
          platform: 'tiktok',
          eventType: payload.event_type || 'unknown',
          payload: JSON.stringify(payload),
          signature: payload.signature,
          isValid: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });

      throw error;
    }
  }

  async processYouTubeWebhook(payload: any): Promise<void> {
    try {
      await this.prisma.platformWebhookLog.create({
        data: {
          platform: 'youtube',
          eventType: payload.type || 'unknown',
          payload: JSON.stringify(payload),
          signature: payload.signature,
          isValid: true,
        },
      });

      if (payload.type === 'video_earnings' && payload.data) {
        await this.createEarningFromWebhook(payload.data, 'youtube');
      }

      this.logger.log('YouTube webhook processed successfully');
    } catch (error) {
      this.logger.error('Failed to process YouTube webhook:', error);

      await this.prisma.platformWebhookLog.create({
        data: {
          platform: 'youtube',
          eventType: payload.type || 'unknown',
          payload: JSON.stringify(payload),
          signature: payload.signature,
          isValid: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });

      throw error;
    }
  }

  private async createEarningFromWebhook(data: any, platform: string): Promise<void> {
    const { clipId, amount, currency = 'USD', date } = data;

    if (!clipId || !amount || !date) {
      this.logger.warn(`Invalid earning data from ${platform} webhook: missing required fields`);
      return;
    }

    const clip = await this.prisma.clip.findUnique({
      where: { id: clipId },
      include: { video: true },
    });

    if (!clip) {
      this.logger.warn(`Clip ${clipId} not found for ${platform} earning`);
      return;
    }

    await this.prisma.earning.create({
      data: {
        clipId,
        amount: parseFloat(amount),
        currency,
        date: new Date(date),
        source: `${platform}_webhook`,
      },
    });

    // Invalidate earnings cache for the user
    await this.earningsService.invalidateUserEarningsCache(clip.video.userId);

    this.logger.log(`Created earning for clip ${clipId} from ${platform} webhook: $${amount} and invalidated user ${clip.video.userId} cache`);
  }
}
