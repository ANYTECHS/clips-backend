import { BadRequestException } from '@nestjs/common';
import { PayoutValidationService } from './payout-validation.service';
import { PayoutLimitsService } from './payout-limits.service';

describe('PayoutValidationService.assertPayoutLimits', () => {
  const originalEnv = process.env;

  beforeEach(() => {
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

  function buildService(): PayoutValidationService {
    return new PayoutValidationService(
      { minStellarPayout: 5 } as any,
      { convert: jest.fn() } as any,
      new PayoutLimitsService(),
      {} as any,
    );
  }

  it('rejects amounts below the currency minimum', () => {
    const service = buildService();
    expect(() => service.assertPayoutLimits(3, 'USD')).toThrow(BadRequestException);
    expect(() => service.assertPayoutLimits(3, 'USD')).toThrow(
      /Minimum payout for USD is 5/,
    );
  });

  it('rejects amounts above the currency maximum', () => {
    const service = buildService();
    expect(() => service.assertPayoutLimits(15000, 'USD')).toThrow(
      BadRequestException,
    );
    expect(() => service.assertPayoutLimits(15000, 'USD')).toThrow(
      /Maximum payout for USD is 10000/,
    );
  });

  it('allows amounts within limits', () => {
    const service = buildService();
    expect(() => service.assertPayoutLimits(100, 'USD')).not.toThrow();
  });
});
