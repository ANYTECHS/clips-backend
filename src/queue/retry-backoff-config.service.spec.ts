import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  RetryBackoffConfigService,
  RetryConfig,
} from './retry-backoff-config.service';

describe('RetryBackoffConfigService', () => {
  const envKeys = [
    'RETRY_BACKOFF_CLIP_GENERATION_ATTEMPTS',
    'RETRY_BACKOFF_CLIP_GENERATION_DELAY_MS',
    'RETRY_BACKOFF_CLIP_GENERATION_MULTIPLIER',
    'RETRY_BACKOFF_NFT_MINT_ATTEMPTS',
    'RETRY_BACKOFF_NFT_MINT_DELAY_MS',
    'RETRY_BACKOFF_NFT_MINT_MULTIPLIER',
    'RETRY_BACKOFF_EMAIL_DELIVERY_ATTEMPTS',
    'RETRY_BACKOFF_UNKNOWN_QUEUE_ATTEMPTS',
    'RETRY_BACKOFF_UNKNOWN_QUEUE_DELAY_MS',
    'RETRY_BACKOFF_UNKNOWN_QUEUE_MULTIPLIER',
    'RETRY_BACKOFF_ANOMALY_DETECTION_ATTEMPTS',
  ] as const;

  let env: Record<string, string | undefined>;
  let configValues: Record<string, string | undefined>;
  let service: RetryBackoffConfigService;

  beforeEach(async () => {
    env = {};
    for (const key of envKeys) {
      env[key] = process.env[key];
      delete process.env[key];
    }

    configValues = {};
    const configService = {
      get: jest.fn((key: string) => configValues[key]),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        RetryBackoffConfigService,
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = moduleRef.get(RetryBackoffConfigService);
  });

  afterEach(() => {
    for (const key of envKeys) {
      const value = env[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  describe('getRetryConfig defaults', () => {
    it('defaults clip-generation to 3 attempts with a 1s exponential backoff', () => {
      expect(service.getRetryConfig('clip-generation')).toEqual({
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000, multiplier: 2 },
      });
    });

    it('defaults nft-mint to 3 attempts with a 1s exponential backoff', () => {
      expect(service.getRetryConfig('nft-mint')).toEqual({
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000, multiplier: 2 },
      });
    });

    it('defaults clip-posting to 4 attempts with a 1.5s backoff', () => {
      expect(service.getRetryConfig('clip-posting')).toEqual({
        attempts: 4,
        backoff: { type: 'exponential', delay: 1500, multiplier: 2 },
      });
    });

    it('defaults email-delivery to 3 attempts with a 1s backoff', () => {
      expect(service.getRetryConfig('email-delivery')).toEqual({
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000, multiplier: 2 },
      });
    });

    it('defaults anomaly-detection to 3 attempts with a 2s backoff', () => {
      expect(service.getRetryConfig('anomaly-detection')).toEqual({
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000, multiplier: 2 },
      });
    });

    it('falls back to safe minimums for an unknown queue', () => {
      expect(service.getRetryConfig('does-not-exist')).toEqual({
        attempts: 1,
        backoff: { type: 'exponential', delay: 0, multiplier: 2 },
      });
    });
  });

  describe('getRetryConfig environment overrides', () => {
    it('reads attempts, delay and multiplier from config', () => {
      configValues['RETRY_BACKOFF_CLIP_GENERATION_ATTEMPTS'] = '7';
      configValues['RETRY_BACKOFF_CLIP_GENERATION_DELAY_MS'] = '250';
      configValues['RETRY_BACKOFF_CLIP_GENERATION_MULTIPLIER'] = '3';

      expect(service.getRetryConfig('clip-generation')).toEqual({
        attempts: 7,
        backoff: { type: 'exponential', delay: 250, multiplier: 3 },
      });
    });

    it('normalises dashes to underscores in the env prefix', () => {
      configValues['RETRY_BACKOFF_CLIP_GENERATION_ATTEMPTS'] = '9';
      expect(service.getRetryConfig('clip-generation').attempts).toBe(9);

      configValues['RETRY_BACKOFF_ANOMALY_DETECTION_ATTEMPTS'] = '6';
      expect(service.getRetryConfig('anomaly-detection').attempts).toBe(6);
    });

    it('applies overrides per queue independently', () => {
      configValues['RETRY_BACKOFF_NFT_MINT_ATTEMPTS'] = '10';
      configValues['RETRY_BACKOFF_NFT_MINT_DELAY_MS'] = '5000';
      configValues['RETRY_BACKOFF_NFT_MINT_MULTIPLIER'] = '4';

      expect(service.getRetryConfig('nft-mint')).toEqual({
        attempts: 10,
        backoff: { type: 'exponential', delay: 5000, multiplier: 4 },
      });
      expect(service.getRetryConfig('clip-generation').attempts).toBe(3);
    });

    it('ignores non-integer overrides and keeps the default', () => {
      configValues['RETRY_BACKOFF_EMAIL_DELIVERY_ATTEMPTS'] = 'three';
      expect(service.getRetryConfig('email-delivery').attempts).toBe(3);
    });

    it('ignores fractional overrides and keeps the default', () => {
      configValues['RETRY_BACKOFF_EMAIL_DELIVERY_ATTEMPTS'] = '2.5';
      expect(service.getRetryConfig('email-delivery').attempts).toBe(3);
    });

    it('clamps attempts to a minimum of 1', () => {
      configValues['RETRY_BACKOFF_EMAIL_DELIVERY_ATTEMPTS'] = '0';
      expect(service.getRetryConfig('email-delivery').attempts).toBe(3);

      configValues['RETRY_BACKOFF_UNKNOWN_QUEUE_ATTEMPTS'] = '0';
      expect(service.getRetryConfig('does-not-exist').attempts).toBe(1);
    });

    it('clamps the delay to a minimum of 0', () => {
      configValues['RETRY_BACKOFF_NFT_MINT_DELAY_MS'] = '-100';
      expect(service.getRetryConfig('nft-mint').backoff.delay).toBe(1000);

      configValues['RETRY_BACKOFF_UNKNOWN_QUEUE_DELAY_MS'] = '-1';
      expect(service.getRetryConfig('does-not-exist').backoff.delay).toBe(0);
    });

    it('clamps the multiplier to a minimum of 1', () => {
      configValues['RETRY_BACKOFF_NFT_MINT_MULTIPLIER'] = '0';
      expect(service.getRetryConfig('nft-mint').backoff.multiplier).toBe(2);

      configValues['RETRY_BACKOFF_UNKNOWN_QUEUE_MULTIPLIER'] = '-3';
      expect(service.getRetryConfig('does-not-exist').backoff.multiplier).toBe(
        2,
      );
    });

    it('treats an empty override as unset', () => {
      configValues['RETRY_BACKOFF_CLIP_GENERATION_ATTEMPTS'] = '';
      expect(service.getRetryConfig('clip-generation').attempts).toBe(3);
    });
  });

  describe('getBullMQRetryConfig', () => {
    it('produces the BullMQ job-options shape', () => {
      expect(service.getBullMQRetryConfig('clip-generation')).toEqual({
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      });
    });

    it('does not leak the multiplier into BullMQ job options', () => {
      configValues['RETRY_BACKOFF_CLIP_GENERATION_MULTIPLIER'] = '5';
      expect(service.getBullMQRetryConfig('clip-generation').backoff).toEqual({
        type: 'exponential',
        delay: 1000,
      });
    });

    it('reflects environment overrides', () => {
      configValues['RETRY_BACKOFF_CLIP_GENERATION_ATTEMPTS'] = '8';
      configValues['RETRY_BACKOFF_CLIP_GENERATION_DELAY_MS'] = '2500';
      expect(service.getBullMQRetryConfig('clip-generation')).toEqual({
        attempts: 8,
        backoff: { type: 'exponential', delay: 2500 },
      });
    });
  });

  describe('getAllRetryConfigs', () => {
    it('returns an entry for every known queue', () => {
      const configs = service.getAllRetryConfigs();

      expect(Object.keys(configs).sort()).toEqual([
        'anomaly-detection',
        'clip-generation',
        'clip-posting',
        'email-delivery',
        'nft-mint',
      ]);
    });

    it('returns fully resolved RetryConfig objects', () => {
      const configs: Record<string, RetryConfig> = service.getAllRetryConfigs();

      for (const config of Object.values(configs)) {
        expect(config.backoff.type).toBe('exponential');
        expect(config.attempts).toBeGreaterThanOrEqual(1);
        expect(config.backoff.delay).toBeGreaterThanOrEqual(0);
      }
    });

    it('honours overrides applied to one queue', () => {
      configValues['RETRY_BACKOFF_NFT_MINT_ATTEMPTS'] = '12';
      const configs = service.getAllRetryConfigs();

      expect(configs['nft-mint'].attempts).toBe(12);
      expect(configs['clip-generation'].attempts).toBe(3);
    });

    it('returns a fresh object each call so callers cannot corrupt the state', () => {
      const first = service.getAllRetryConfigs();
      first['clip-generation'].attempts = 999;

      expect(service.getAllRetryConfigs()['clip-generation'].attempts).toBe(3);
    });
  });

  describe('getMaxTotalJobTimeMs', () => {
    it('sums the exponential delays for the default clip-generation config', () => {
      // 1000 + 2000 = 3000
      expect(service.getMaxTotalJobTimeMs('clip-generation')).toBe(3000);
    });

    it('sums three delays for clip-posting (4 attempts)', () => {
      // 1500 + 3000 + 6000 = 10500
      expect(service.getMaxTotalJobTimeMs('clip-posting')).toBe(10500);
    });

    it('returns 0 when only one attempt is configured', () => {
      expect(service.getMaxTotalJobTimeMs('does-not-exist')).toBe(0);
    });

    it('uses the configured multiplier', () => {
      configValues['RETRY_BACKOFF_CLIP_GENERATION_MULTIPLIER'] = '3';
      // 1000 + 3000 = 4000
      expect(service.getMaxTotalJobTimeMs('clip-generation')).toBe(4000);
    });

    it('grows with an increased attempt count', () => {
      configValues['RETRY_BACKOFF_CLIP_GENERATION_ATTEMPTS'] = '4';
      // 1000 + 2000 + 4000 = 7000
      expect(service.getMaxTotalJobTimeMs('clip-generation')).toBe(7000);
    });
  });

  describe('getRetryInfo', () => {
    it('reports the per-attempt delay ladder', () => {
      expect(service.getRetryInfo('clip-generation').delayPerAttemptMs).toEqual(
        [1000, 2000],
      );
    });

    it('reports the resolved config alongside the totals', () => {
      const info = service.getRetryInfo('clip-generation');

      expect(info.queue).toBe('clip-generation');
      expect(info.maxAttempts).toBe(3);
      expect(info.backoffType).toBe('exponential');
      expect(info.initialDelayMs).toBe(1000);
      expect(info.multiplier).toBe(2);
      expect(info.totalBackoffTimeMs).toBe(3000);
    });

    it('builds a human-readable description with the total in minutes', () => {
      const info = service.getRetryInfo('clip-generation');

      expect(info.description).toContain('retried up to 3 times');
      expect(info.description).toContain(
        'exponential backoff starting at 1000ms',
      );
      expect(info.description).toContain('3000ms (0.1m)');
    });

    it('produces an empty ladder for a single-attempt queue', () => {
      const info = service.getRetryInfo('does-not-exist');

      expect(info.delayPerAttemptMs).toEqual([]);
      expect(info.totalBackoffTimeMs).toBe(0);
      expect(info.maxAttempts).toBe(1);
    });

    it('respects a configured multiplier in the ladder', () => {
      configValues['RETRY_BACKOFF_CLIP_GENERATION_MULTIPLIER'] = '3';
      expect(service.getRetryInfo('clip-generation').delayPerAttemptMs).toEqual(
        [1000, 3000],
      );
    });
  });
});
