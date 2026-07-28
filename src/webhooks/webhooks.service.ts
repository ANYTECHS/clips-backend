import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EarningsService } from '../earnings/earnings.service';
import * as crypto from 'crypto';

type PrismaTx = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  private readonly tiktokSecret = process.env.TIKTOK_WEBHOOK_SECRET;
  private readonly youtubeSecret = process.env.YOUTUBE_WEBHOOK_SECRET;

  constructor(
    private prisma: PrismaService,
    private earningsService: EarningsService,
  ) {}

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
      await this.prisma.withTransaction(async (tx) => {
        await tx.platformWebhookLog.create({
          data: {
            platform: 'tiktok',
            eventType: payload.event_type || 'unknown',
            payload: JSON.stringify(payload),
            signature: payload.signature,
            isValid: true,
          },
        });

        if (payload.event_type === 'video_earnings' && payload.data) {
          await this.createEarningInTransaction(tx, payload.data, 'tiktok');
        }
      });

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
      await this.prisma.withTransaction(async (tx) => {
        await tx.platformWebhookLog.create({
          data: {
            platform: 'youtube',
            eventType: payload.type || 'unknown',
            payload: JSON.stringify(payload),
            signature: payload.signature,
            isValid: true,
          },
        });

        if (payload.type === 'video_earnings' && payload.data) {
          await this.createEarningInTransaction(tx, payload.data, 'youtube');
        }
      });

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

  private async createEarningInTransaction(
    tx: PrismaTx,
    data: any,
    platform: string,
  ): Promise<void> {
    const { clipId, amount, currency = 'USD', date } = data;

    if (!clipId || !amount || !date) {
      this.logger.warn(`Invalid earning data from ${platform} webhook: missing required fields`);
      return;
    }

    const clip = await tx.clip.findUnique({
      where: { id: clipId },
      include: { video: true },
    });

    if (!clip) {
      this.logger.warn(`Clip ${clipId} not found for ${platform} earning`);
      return;
    }

    await tx.earning.create({
      data: {
        clipId,
        amount: parseFloat(amount),
        currency,
        date: new Date(date),
        source: `${platform}_webhook`,
      },
    });

    this.logger.log(`Created earning for clip ${clipId} from ${platform} webhook: $${amount}`);

    // Invalidate cache after transaction commits (fire-and-forget, not part of transaction)
    void this.earningsService.invalidateUserEarningsCache(clip.video.userId);
  }
}
