import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
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

export interface ValidatedEarningPayload {
  clipId: number;
  amount: number;
  currency: string;
  date: Date;
  transactionId?: string;
}

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

  getSecretForPlatform(platform: WebhookPlatform): string | undefined {
    switch (platform) {
      case 'tiktok':
        return this.tiktokSecret;
      case 'youtube':
        return this.youtubeSecret;
      case 'instagram':
        return this.instagramSecret;
      default:
        return undefined;
    }
  }

  /**
   * Validates the webhook signature for a platform.
   * When a secret is configured, a missing/invalid signature is rejected.
   * When no secret is configured (local/dev), validation is skipped with a warning.
   */
  assertValidSignature(
    platform: WebhookPlatform,
    payload: unknown,
    signature: string | undefined,
  ): void {
    const secret = this.getSecretForPlatform(platform);
    if (!secret) {
      this.logger.warn(
        `${platform.toUpperCase()}_WEBHOOK_SECRET not configured, skipping signature validation`,
      );
      return;
    }

    if (!signature) {
      throw new UnauthorizedException('Missing webhook signature');
    }

    const isValid = this.validateSignature(platform, payload, signature);
    if (!isValid) {
      throw new UnauthorizedException('Invalid webhook signature');
    }
  }

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
      return true;
    }

    const hmac = crypto
      .createHmac('sha256', this.tiktokSecret)
      .update(JSON.stringify(payload))
      .digest('hex');

    return this.signaturesMatch(hmac, signature);
  }

  validateYouTubeSignature(payload: any, signature: string): boolean {
    if (!this.youtubeSecret) {
      return true;
    }

    const expectedSignature = `sha256=${crypto
      .createHmac('sha256', this.youtubeSecret)
      .update(JSON.stringify(payload))
      .digest('hex')}`;

    return this.signaturesMatch(signature, expectedSignature);
  }

  validateInstagramSignature(payload: any, signature: string): boolean {
    if (!this.instagramSecret) {
      return true;
    }

    const expectedSignature = `sha256=${crypto
      .createHmac('sha256', this.instagramSecret)
      .update(JSON.stringify(payload))
      .digest('hex')}`;

    return this.signaturesMatch(signature, expectedSignature);
  }

  private signaturesMatch(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) {
      return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
  }

  // ── Payload validation ───────────────────────────────────────────────────

  validateEarningPayload(data: any): ValidatedEarningPayload {
    if (!data || typeof data !== 'object') {
      throw new BadRequestException('Webhook payload data is required');
    }

    const clipId = Number(data.clipId);
    const amount = Number(data.amount);

    if (!Number.isFinite(clipId) || clipId <= 0) {
      throw new BadRequestException('Invalid or missing clipId');
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Invalid or missing amount');
    }
    if (!data.date) {
      throw new BadRequestException('Invalid or missing date');
    }

    const date = new Date(data.date);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Invalid date value');
    }

    return {
      clipId,
      amount,
      currency: (data.currency || 'USD').toString().toUpperCase(),
      date,
      transactionId: data.transactionId?.toString(),
    };
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
  ): Promise<{ received: boolean; duplicate?: boolean; earningId?: number }> {
    const eventType = payload.event_type || payload.type || 'unknown';
    const eventId =
      payload.event_id || payload.id || payload.transactionId || undefined;

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

    if (isEarningEvent) {
      const validated = this.validateEarningPayload(payload.data);
      const earningId = await this.createEarningFromPayload(
        platform,
        eventType,
        validated,
        eventId,
        signature,
      );
      this.logger.log(`Webhook processed: ${platform}/${eventType}`);
      return { received: true, duplicate: false, earningId };
    }

    await this.logWebhookEvent(
      this.prisma,
      platform,
      eventType,
      payload,
      eventId,
      signature,
      true,
    );

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

  async processInstagramWebhook(payload: any): Promise<void> {
    await this.processWebhook('instagram', payload);
  }

  // ── Internal helpers ─────────────────────────────────────────────────────

  private async createEarningFromPayload(
    platform: WebhookPlatform,
    eventType: string,
    data: ValidatedEarningPayload,
    eventId?: string,
    signature?: string,
  ): Promise<number> {
    try {
      const clip = await this.prisma.clip.findUnique({
        where: { id: data.clipId },
        include: { video: { select: { userId: true } } },
      });

      if (!clip) {
        throw new BadRequestException(
          `Clip ${data.clipId} not found for ${platform} earning`,
        );
      }

      let earningId = 0;

      await this.prisma.withTransaction(async (tx) => {
        await this.logWebhookEvent(
          tx,
          platform,
          eventType,
          { event_id: eventId, data },
          eventId,
          signature,
          true,
        );

        const earning = await tx.earning.create({
          data: {
            clipId: data.clipId,
            amount: data.amount,
            currency: data.currency,
            amountInBaseCurrency: data.amount,
            exchangeRate: 1,
            date: data.date,
            source: `${platform}_webhook`,
          },
        });
        earningId = earning.id;
      });

      const userId = clip.video?.userId;
      if (userId) {
        await this.earningsService.invalidateUserEarningsCache(userId);

        this.eventEmitter.emit('earning.created', {
          id: earningId,
          clipId: data.clipId,
          amount: data.amount,
          currency: data.currency,
          date: data.date,
          source: `${platform}_webhook`,
          platform,
          userId,
        } satisfies EarningCreatedEvent);

        this.eventEmitter.emit('earnings.updated', {
          userId,
          earningId,
          amount: data.amount,
        });
      }

      this.logger.log(
        `Created earning #${earningId} for clip ${data.clipId} from ${platform} webhook: $${data.amount}`,
      );

      return earningId;
    } catch (error) {
      this.logger.error(
        `Failed to process ${platform} earning webhook:`,
        error,
      );

      if (
        !(error instanceof BadRequestException) &&
        !(error instanceof UnauthorizedException)
      ) {
        await this.logWebhookEvent(
          this.prisma,
          platform,
          eventType,
          { event_id: eventId, data },
          eventId,
          signature,
          false,
          error instanceof Error ? error.message : 'Unknown error',
        );
      }

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
}
