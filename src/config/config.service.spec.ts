import { ConfigService } from './config.service';

describe('ConfigService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset env to known defaults before each test
    process.env = { ...originalEnv };
    delete process.env.MIN_STELLAR_PAYOUT;
    delete process.env.MIN_PAYOUT_USD;
    delete process.env.MAX_PAYOUT_USD;
    delete process.env.CREATOR_ROYALTY_BPS;
    delete process.env.PLATFORM_ROYALTY_BPS;
    delete process.env.NODE_ENV;
    delete process.env.ENCRYPTION_SECRET;
    delete process.env.JWT_SECRET;
    delete process.env.SOROBAN_NFT_CONTRACT_ID;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('minStellarPayout', () => {
    it('defaults to 5 when MIN_STELLAR_PAYOUT is not set', () => {
      delete process.env.MIN_STELLAR_PAYOUT;
      const service = new ConfigService();
      expect(service.minStellarPayout).toBe(5);
    });

    it('parses a valid positive integer', () => {
      process.env.MIN_STELLAR_PAYOUT = '10';
      const service = new ConfigService();
      expect(service.minStellarPayout).toBe(10);
    });

    it('parses a valid positive decimal', () => {
      process.env.MIN_STELLAR_PAYOUT = '2.5';
      const service = new ConfigService();
      expect(service.minStellarPayout).toBe(2.5);
    });

    it('throws at startup when MIN_STELLAR_PAYOUT is a non-numeric string', () => {
      process.env.MIN_STELLAR_PAYOUT = 'five';
      expect(() => new ConfigService()).toThrow(/Invalid MIN_STELLAR_PAYOUT/);
    });

    it('throws at startup when MIN_STELLAR_PAYOUT is zero', () => {
      process.env.MIN_STELLAR_PAYOUT = '0';
      expect(() => new ConfigService()).toThrow(/Invalid MIN_STELLAR_PAYOUT/);
    });

    it('throws at startup when MIN_STELLAR_PAYOUT is negative', () => {
      process.env.MIN_STELLAR_PAYOUT = '-5';
      expect(() => new ConfigService()).toThrow(/Invalid MIN_STELLAR_PAYOUT/);
    });

    it('throws at startup when MIN_STELLAR_PAYOUT is empty string', () => {
      process.env.MIN_STELLAR_PAYOUT = '';
      expect(() => new ConfigService()).toThrow(/Invalid MIN_STELLAR_PAYOUT/);
    });

    it('error message includes the invalid value', () => {
      process.env.MIN_STELLAR_PAYOUT = 'abc';
      expect(() => new ConfigService()).toThrow('"abc"');
    });
  });

  describe('payout limits validation (Issue #856)', () => {
    it('defaults to min=5 and max=10000', () => {
      const service = new ConfigService();
      expect(service.minPayoutUsd).toBe(5);
      expect(service.maxPayoutUsd).toBe(10000);
    });

    it('throws when MIN_PAYOUT_USD > MAX_PAYOUT_USD', () => {
      process.env.MIN_PAYOUT_USD = '500';
      process.env.MAX_PAYOUT_USD = '100';
      expect(() => new ConfigService()).toThrow(/MIN_PAYOUT_USD.*must not exceed MAX_PAYOUT_USD/);
    });

    it('throws when MAX_PAYOUT_USD is zero', () => {
      process.env.MAX_PAYOUT_USD = '0';
      expect(() => new ConfigService()).toThrow(/Invalid MAX_PAYOUT_USD/);
    });
  });

  describe('royalty BPS validation (Issue #856)', () => {
    it('defaults to creatorRoyaltyBps=1000 and platformRoyaltyBps=100', () => {
      const service = new ConfigService();
      expect(service.creatorRoyaltyBps).toBe(1000);
      expect(service.platformRoyaltyBps).toBe(100);
    });

    it('throws when CREATOR_ROYALTY_BPS exceeds maxRoyaltyBps (1500)', () => {
      process.env.CREATOR_ROYALTY_BPS = '2000';
      expect(() => new ConfigService()).toThrow(/Invalid CREATOR_ROYALTY_BPS/);
    });

    it('throws when PLATFORM_ROYALTY_BPS is negative', () => {
      process.env.PLATFORM_ROYALTY_BPS = '-1';
      expect(() => new ConfigService()).toThrow(/Invalid PLATFORM_ROYALTY_BPS/);
    });

    it('accepts valid royalty BPS within range', () => {
      process.env.CREATOR_ROYALTY_BPS = '500';
      process.env.PLATFORM_ROYALTY_BPS = '50';
      const service = new ConfigService();
      expect(service.creatorRoyaltyBps).toBe(500);
      expect(service.platformRoyaltyBps).toBe(50);
    });
  });

  describe('production secrets validation (Issue #856)', () => {
    it('throws in production when ENCRYPTION_SECRET is missing', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.ENCRYPTION_SECRET;
      expect(() => new ConfigService()).toThrow(/ENCRYPTION_SECRET is required/);
    });

    it('throws in production when JWT_SECRET is missing', () => {
      process.env.NODE_ENV = 'production';
      process.env.ENCRYPTION_SECRET = 'a'.repeat(32);
      delete process.env.JWT_SECRET;
      expect(() => new ConfigService()).toThrow(/JWT_SECRET is required/);
    });

    it('throws in production when SOROBAN_NFT_CONTRACT_ID is missing', () => {
      process.env.NODE_ENV = 'production';
      process.env.ENCRYPTION_SECRET = 'a'.repeat(32);
      process.env.JWT_SECRET = 'test-secret';
      delete process.env.SOROBAN_NFT_CONTRACT_ID;
      expect(() => new ConfigService()).toThrow(/SOROBAN_NFT_CONTRACT_ID is required/);
    });

    it('does NOT throw in development even without secrets', () => {
      process.env.NODE_ENV = 'development';
      expect(() => new ConfigService()).not.toThrow();
    });
  });

  describe('supportedPlatforms (Issue #856)', () => {
    it('returns the full list of 7+ platforms', () => {
      const service = new ConfigService();
      expect(service.supportedPlatforms).toContain('tiktok');
      expect(service.supportedPlatforms).toContain('instagram');
      expect(service.supportedPlatforms).toContain('youtube');
      expect(service.supportedPlatforms.length).toBeGreaterThanOrEqual(7);
    });
  });
});
