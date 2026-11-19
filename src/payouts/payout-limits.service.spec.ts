import { BadRequestException } from '@nestjs/common';
import { PayoutLimitsService } from './payout-limits.service';

describe('PayoutLimitsService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.PAYOUT_LIMITS;
    delete process.env.MIN_PAYOUT_USD;
    delete process.env.MAX_PAYOUT_USD;
    delete process.env.MIN_STELLAR_PAYOUT;
    delete process.env.MAX_PAYOUT;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('loads default USD limits when no config is set', () => {
    const service = new PayoutLimitsService();

    expect(service.getLimits('USD')).toEqual({ min: 5, max: 10000 });
  });

  it('loads limits from PAYOUT_LIMITS JSON', () => {
    process.env.PAYOUT_LIMITS = JSON.stringify({
      USD: { min: 10, max: 5000 },
      EUR: { min: 8, max: 3000 },
    });

    const service = new PayoutLimitsService();

    expect(service.getLimits('usd')).toEqual({ min: 10, max: 5000 });
    expect(service.getLimits('EUR')).toEqual({ min: 8, max: 3000 });
  });

  it('loads limits from MIN_PAYOUT_* and MAX_PAYOUT_* env vars', () => {
    process.env.MIN_PAYOUT_USD = '15';
    process.env.MAX_PAYOUT_USD = '8000';

    const service = new PayoutLimitsService();

    expect(service.getLimits('USD')).toEqual({ min: 15, max: 8000 });
  });

  describe('resolvePayoutAmount', () => {
    it('throws when balance is below minimum', () => {
      const service = new PayoutLimitsService();

      expect(() => service.resolvePayoutAmount(3, 'USD')).toThrow(
        BadRequestException,
      );
      expect(() => service.resolvePayoutAmount(3, 'USD')).toThrow(
        /Minimum payout for USD is 5/,
      );
    });

    it('returns full balance when within limits', () => {
      const service = new PayoutLimitsService();

      expect(service.resolvePayoutAmount(100, 'USD')).toBe(100);
    });

    it('caps amount at maximum when balance exceeds it', () => {
      process.env.PAYOUT_LIMITS = JSON.stringify({
        USD: { min: 5, max: 1000 },
      });
      const service = new PayoutLimitsService();

      expect(service.resolvePayoutAmount(5000, 'USD')).toBe(1000);
    });

    it('throws for unconfigured currency', () => {
      const service = new PayoutLimitsService();

      expect(() => service.resolvePayoutAmount(100, 'GBP')).toThrow(
        BadRequestException,
      );
    });
  });
});
