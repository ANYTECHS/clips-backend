import {
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import * as crypto from 'crypto';

describe('WebhooksService', () => {
  let service: WebhooksService;
  let prisma: any;
  let earningsService: any;
  let eventEmitter: any;

  const earningPayload = {
    event_type: 'video_earnings',
    event_id: 'evt_1',
    data: {
      clipId: 10,
      amount: 25.5,
      currency: 'USD',
      date: '2026-03-01T00:00:00.000Z',
    },
  };

  beforeEach(() => {
    process.env.TIKTOK_WEBHOOK_SECRET = 'tiktok-secret';
    process.env.YOUTUBE_WEBHOOK_SECRET = 'youtube-secret';
    process.env.INSTAGRAM_WEBHOOK_SECRET = 'instagram-secret';

    prisma = {
      platformWebhookLog: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      clip: {
        findUnique: jest.fn().mockResolvedValue({
          id: 10,
          video: { userId: 7 },
        }),
      },
      withTransaction: jest.fn(async (fn: any) =>
        fn({
          platformWebhookLog: { create: jest.fn() },
          earning: {
            create: jest.fn().mockResolvedValue({ id: 99 }),
          },
        }),
      ),
    };
    earningsService = {
      invalidateUserEarningsCache: jest.fn(),
    };
    eventEmitter = { emit: jest.fn() };

    service = new WebhooksService(prisma, earningsService, eventEmitter);
  });

  afterEach(() => {
    delete process.env.TIKTOK_WEBHOOK_SECRET;
    delete process.env.YOUTUBE_WEBHOOK_SECRET;
    delete process.env.INSTAGRAM_WEBHOOK_SECRET;
  });

  describe('signature validation', () => {
    it('accepts a valid TikTok signature', () => {
      const sig = crypto
        .createHmac('sha256', 'tiktok-secret')
        .update(JSON.stringify(earningPayload))
        .digest('hex');

      expect(() =>
        service.assertValidSignature('tiktok', earningPayload, sig),
      ).not.toThrow();
    });

    it('rejects an invalid signature', () => {
      expect(() =>
        service.assertValidSignature('tiktok', earningPayload, 'bad'),
      ).toThrow(UnauthorizedException);
    });

    it('rejects a missing signature when secret is configured', () => {
      expect(() =>
        service.assertValidSignature('youtube', earningPayload, undefined),
      ).toThrow(UnauthorizedException);
    });
  });

  describe('payload validation', () => {
    it('accepts a valid earning payload', () => {
      const result = service.validateEarningPayload(earningPayload.data);
      expect(result.clipId).toBe(10);
      expect(result.amount).toBe(25.5);
    });

    it('rejects missing amount', () => {
      expect(() =>
        service.validateEarningPayload({ clipId: 1, date: '2026-01-01' }),
      ).toThrow(BadRequestException);
    });
  });

  describe('processWebhook', () => {
    it('creates an earning, invalidates cache, and emits events', async () => {
      const result = await service.processWebhook('tiktok', earningPayload);

      expect(result).toEqual({
        received: true,
        duplicate: false,
        earningId: 99,
      });
      expect(earningsService.invalidateUserEarningsCache).toHaveBeenCalledWith(
        7,
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'earning.created',
        expect.objectContaining({ userId: 7, clipId: 10 }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'earnings.updated',
        expect.objectContaining({ userId: 7, earningId: 99 }),
      );
    });

    it('does not create duplicate earnings for the same event_id', async () => {
      prisma.platformWebhookLog.findUnique.mockResolvedValue({ id: 1 });

      const result = await service.processWebhook('tiktok', earningPayload);

      expect(result).toEqual({ received: true, duplicate: true });
      expect(prisma.withTransaction).not.toHaveBeenCalled();
      expect(earningsService.invalidateUserEarningsCache).not.toHaveBeenCalled();
    });
  });
});
