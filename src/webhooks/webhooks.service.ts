import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EarningsService } from '../earnings/earnings.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EarningCreatedEvent } from './webhooks.gateway';
import * as crypto from 'crypto';

type PrismaTx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

export const WEBHOOK_SUPPORTED_PLATFORMS = [
  'tiktok',
  'youtube',
  'instagram',
] as const;
export type WebhookPlatform = (typeof WEBHOOK_SUPPORTED_PLATFORMS)[number];

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  private readonly tiktokSecret = process.env.TIKTOK_WEBHOOK_SECRET;
  private readonly youtubeSecret = process.env.YOUTUBE_WEBHOOK_SECRET;
  private readonly instagramSecret = process.env.INSTAGRAM_WEBHOOK_SECRET;

  constructor(
    private prisma: PrismaService,
    private earningsService: EarningsService,
    private eventEmitter: EventEmitter2,
  ) {}

  isSupportedWebhookPlatform(platform: string): platform is WebhookPlatform {
    return WEBHOOK_SUPPORTED_PLATFORMS.includes(
      platform.toLowerCase() as WebhookPlatform,
    );
  }

  normalizePlatform(platform: string): WebhookPlatform {
    return platform.toLowerCase() as WebhookPlatform;
  }

  // ── Signature validation ─────────────────────────────────────────────────

  validateSignature(
    platform: WebhookPlatform,
    payload: any,
    signature: string,
  ): boolean {
    switch (platform) {
      case 'tiktok':
        return this.validateTikTokSignature(payload, signature);
      case 'youtube':
        return this.validateYouTubeSignature(payload, signature);
      case 'instagram':
        return this.validateInstagramSignature(payload, signature);
      default:
        this.logger.warn(
          `No signature validation strategy for platform: ${platform as string}`,
        );
        return false;
    }
  }

  validateTikTokSignature(payload: any, signature: string): boolean {
    if (!this.tiktokSecret) {
      this.logger.warn(
        'TIKTOK_WEBHOOK_SECRET not configured, skipping validation',
      );
      return true;
    }

    const hmac = crypto
      .createHmac('sha256', this.tiktokSecret)
      .update(JSON.stringify(payload))
      .digest('hex');

    return hmac === signature;
  }

  validateYouTubeSignature(payload: any, signature: string): boolean {
    if (!this.youtubeSecret) {
      this.logger.warn(
        'YOUTUBE_WEBHOOK_SECRET not configured, skipping validation',
      );
      return true;
    }

    const expectedSignature = `sha256=${crypto
      .createHmac('sha256', this.youtubeSecret)
      .update(JSON.stringify(payload))
      .digest('hex')}`;

    return signature === expectedSignature;
  }

  validateInstagramSignature(payload: any, signature: string): boolean {
    if (!this.instagramSecret) {
      this.logger.warn(
        'INSTAGRAM_WEBHOOK_SECRET not configured, skipping validation',
      );
      return true;
    }

    const expectedSignature = `sha256=${crypto
      .createHmac('sha256', this.instagramSecret)
      .update(JSON.stringify(payload))
      .digest('hex')}`;

    return signature === expectedSignature;
  }

  // ── Duplicate detection ──────────────────────────────────────────────────

  async isDuplicateEvent(
    platform: WebhookPlatform,
    eventId: string | undefined,
  ): Promise<boolean> {
    if (!eventId) return false;

    const existing = await this.prisma.platformWebhookLog.findUnique({
      where: {
        platform_eventId: {
          platform,
          eventId,
        },
      },
    });

    return !!existing;
  }

  // ── Generic webhook processing ───────────────────────────────────────────

  async processWebhook(
    platform: WebhookPlatform,
    payload: any,
    signature?: string,
  ): Promise<{ received: boolean; duplicate?: boolean }> {
    const eventType = payload.event_type || payload.type || 'unknown';
    const eventId = payload.event_id || payload.id || payload.transactionId;

    if (await this.isDuplicateEvent(platform, eventId)) {
      this.logger.log(
        `Duplicate webhook ignored: ${platform}/${eventType} (event_id: ${eventId})`,
      );
      return { received: true, duplicate: true };
    }

    const isEarningEvent =
      eventType === 'video_earnings' ||
      eventType === 'payout' ||
      eventType === 'creator_reward';

    if (isEarningEvent && payload.data) {
      await this.createEarningFromPayload(
        platform,
        eventType,
        payload.data,
        eventId,
        signature,
      );
    } else {
      await this.logWebhookEvent(
        platform,
        eventType,
        payload,
        eventId,
        signature,
        true,
      );
    }

    this.logger.log(`Webhook processed: ${platform}/${eventType}`);
    return { received: true, duplicate: false };
  }

  // ── Platform-specific process methods (kept for backward compat) ─────────

  async processTikTokWebhook(payload: any): Promise<void> {
    await this.processWebhook('tiktok', payload);
  }

  async processYouTubeWebhook(payload: any): Promise<void> {
    await this.processWebhook('youtube', payload);
  }

  // ── Internal helpers ─────────────────────────────────────────────────────

  private async createEarningFromPayload(
    platform: WebhookPlatform,
    eventType: string,
    data: any,
    eventId?: string,
    signature?: string,
  ): Promise<void> {
    try {
      await this.prisma.withTransaction(async (tx) => {
        await this.logWebhookEvent(
          tx,
          platform,
          eventType,
          { event_id: eventId, data } as any,
          eventId,
          signature,
          true,
        );

        await this.createEarningInTransaction(tx, data, platform);
      });

      const { clipId, amount, currency, date } = data;

      const clip = await this.prisma.clip.findUnique({
        where: { id: clipId },
        include: { video: { select: { userId: true } } },
      });

      if (clip?.video?.userId) {
        this.eventEmitter.emit('earning.created', {
          id: 0,
          clipId,
          amount: parseFloat(amount),
          currency: currency || 'USD',
          date: new Date(date),
          source: `${platform}_webhook`,
          platform,
          userId: clip.video.userId,
        } satisfies EarningCreatedEvent);
      }

      void this.earningsService.invalidateUserEarningsCache(
        clip?.video?.userId ?? 0,
      );
    } catch (error) {
      this.logger.error(
        `Failed to process ${platform} earning webhook:`,
        error,
      );

      await this.logWebhookEvent(
        platform,
        eventType,
        { event_id: eventId, data } as any,
        eventId,
        signature,
        false,
        error instanceof Error ? error.message : 'Unknown error',
      );

      throw error;
    }
  }

  private async logWebhookEvent(
    txOrPrisma: PrismaTx | PrismaService,
    platform: string,
    eventType: string,
    payload: any,
    eventId?: string,
    signature?: string,
    isValid = true,
    error?: string,
  ): Promise<void> {
    await txOrPrisma.platformWebhookLog.create({
      data: {
        platform,
        eventType,
        eventId: eventId || null,
        payload: JSON.stringify(payload),
        signature: signature || null,
        isValid,
        error: error || null,
      },
    });
  }

  private async createEarningInTransaction(
    tx: PrismaTx,
    data: any,
    platform: string,
  ): Promise<void> {
    const { clipId, amount, currency = 'USD', date } = data;

    if (!clipId || !amount || !date) {
      this.logger.warn(
        `Invalid earning data from ${platform} webhook: missing required fields`,
      );
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

    this.logger.log(
      `Created earning for clip ${clipId} from ${platform} webhook: $${amount}`,
    );
  }
}
