import { Test } from '@nestjs/testing';
import { PayoutRetryStrategyService } from './payout-retry-strategy.service';

describe('PayoutRetryStrategyService', () => {
  const envKeys = [
    'PAYOUT_MAX_RETRIES',
    'PAYOUT_RETRY_BASE_DELAY_MS',
    'PAYOUT_MAX_BACKOFF_MS',
  ] as const;

  const original = new Map(envKeys.map((k) => [k, process.env[k]]));

  afterEach(() => {
    for (const key of envKeys) {
      const value = original.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  /** The service reads its configuration in the constructor, so it must be
   * rebuilt whenever the relevant environment variables change. */
  const build = async (): Promise<PayoutRetryStrategyService> => {
    const moduleRef = await Test.createTestingModule({
      providers: [PayoutRetryStrategyService],
    }).compile();
    return moduleRef.get(PayoutRetryStrategyService);
  };

  let svc: PayoutRetryStrategyService;

  beforeEach(async () => {
    svc = await build();
  });

  describe('getRetryStrategy', () => {
    it('makes the first attempt immediate', () => {
      const strategy = svc.getRetryStrategy(1);

      expect(strategy).toEqual({
        attempt: 1,
        delayMs: 0,
        delayFormatted: 'immediate',
      });
    });

    it('throws for attempt numbers below 1', () => {
      expect(() => svc.getRetryStrategy(0)).toThrow(
        'Attempt number must be >= 1',
      );
      expect(() => svc.getRetryStrategy(-3)).toThrow(
        'Attempt number must be >= 1',
      );
    });

    it('doubles the base delay on every subsequent attempt', async () => {
      process.env.PAYOUT_RETRY_BASE_DELAY_MS = '1000';
      svc = await build();

      expect(svc.getRetryStrategy(2).delayMs).toBe(1000);
      expect(svc.getRetryStrategy(3).delayMs).toBe(2000);
      expect(svc.getRetryStrategy(4).delayMs).toBe(4000);
      expect(svc.getRetryStrategy(5).delayMs).toBe(8000);
    });

    it('formats sub-minute delays in seconds', async () => {
      process.env.PAYOUT_RETRY_BASE_DELAY_MS = '30000';
      svc = await build();

      expect(svc.getRetryStrategy(2).delayFormatted).toBe('30s');
      expect(svc.getRetryStrategy(3).delayFormatted).toBe('1m 0s');
    });

    it('formats hour-scale delays', async () => {
      process.env.PAYOUT_RETRY_BASE_DELAY_MS = '3600000';
      svc = await build();

      expect(svc.getRetryStrategy(2).delayFormatted).toBe('1h 0m');
      expect(svc.getRetryStrategy(4).delayFormatted).toBe('4h 0m');
    });

    it('caps the delay at PAYOUT_MAX_BACKOFF_MS', async () => {
      process.env.PAYOUT_RETRY_BASE_DELAY_MS = '60000';
      process.env.PAYOUT_MAX_BACKOFF_MS = '90000';
      svc = await build();

      expect(svc.getRetryStrategy(2).delayMs).toBe(60000);
      expect(svc.getRetryStrategy(3).delayMs).toBe(90000);
      expect(svc.getRetryStrategy(10).delayMs).toBe(90000);
    });

    it('defaults the base delay to one minute', async () => {
      delete process.env.PAYOUT_RETRY_BASE_DELAY_MS;
      svc = await build();

      expect(svc.getRetryStrategy(2).delayMs).toBe(60000);
      expect(svc.getRetryStrategy(3).delayMs).toBe(120000);
    });

    it('echoes the attempt number back', () => {
      expect(svc.getRetryStrategy(6).attempt).toBe(6);
    });
  });

  describe('getNextRetryTime', () => {
    it('returns the current time for the immediate first attempt', () => {
      const before = Date.now();

      const next = svc.getNextRetryTime(1);

      expect(next.getTime()).toBeGreaterThanOrEqual(before);
      expect(next.getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('offsets by the configured backoff', async () => {
      process.env.PAYOUT_RETRY_BASE_DELAY_MS = '5000';
      svc = await build();

      const before = Date.now();
      const next = svc.getNextRetryTime(2);

      expect(next.getTime()).toBeGreaterThanOrEqual(before + 5000);
      expect(next.getTime()).toBeLessThanOrEqual(Date.now() + 5000);
    });

    it('propagates the invalid-attempt error', () => {
      expect(() => svc.getNextRetryTime(0)).toThrow();
    });
  });

  describe('shouldRetry / getMaxRetries', () => {
    it('defaults to three retries', async () => {
      delete process.env.PAYOUT_MAX_RETRIES;
      svc = await build();

      expect(svc.getMaxRetries()).toBe(3);
      expect(svc.shouldRetry(1)).toBe(true);
      expect(svc.shouldRetry(3)).toBe(true);
      expect(svc.shouldRetry(4)).toBe(false);
    });

    it('honours PAYOUT_MAX_RETRIES', async () => {
      process.env.PAYOUT_MAX_RETRIES = '5';
      svc = await build();

      expect(svc.getMaxRetries()).toBe(5);
      expect(svc.shouldRetry(5)).toBe(true);
      expect(svc.shouldRetry(6)).toBe(false);
    });
  });

  describe('createRetryLog', () => {
    it('schedules the next attempt while retries remain', async () => {
      delete process.env.PAYOUT_MAX_RETRIES;
      process.env.PAYOUT_RETRY_BASE_DELAY_MS = '1000';
      svc = await build();

      const before = Date.now();
      const log = svc.createRetryLog(7, 1, 'stellar timeout');

      expect(log.payoutId).toBe(7);
      expect(log.attempt).toBe(1);
      expect(log.error).toBe('stellar timeout');
      expect(log.shouldRetry).toBe(true);
      expect(log.nextRetry).toBeInstanceOf(Date);
      expect(log.nextRetry!.getTime()).toBeGreaterThanOrEqual(before + 1000);
    });

    it('returns a null nextRetry once the budget is exhausted', async () => {
      process.env.PAYOUT_MAX_RETRIES = '2';
      svc = await build();

      const log = svc.createRetryLog(7, 2, 'still failing');

      expect(log.shouldRetry).toBe(false);
      expect(log.nextRetry).toBeNull();
    });

    it('schedules the second attempt one base delay out', async () => {
      process.env.PAYOUT_RETRY_BASE_DELAY_MS = '60000';
      svc = await build();

      const before = Date.now();
      const log = svc.createRetryLog(1, 1, 'boom');

      // createRetryLog(1) schedules attempt 2, which is one base delay away.
      expect(log.nextRetry!.getTime()).toBeGreaterThanOrEqual(before + 60000);
      expect(log.nextRetry!.getTime()).toBeLessThanOrEqual(Date.now() + 60000);
    });
  });
});
