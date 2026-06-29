import { ConfigService } from './config.service';

describe('ConfigService', () => {
  afterEach(() => {
    delete process.env.MIN_STELLAR_PAYOUT;
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
      expect(() => new ConfigService()).toThrow(
        /Invalid MIN_STELLAR_PAYOUT/,
      );
    });

    it('throws at startup when MIN_STELLAR_PAYOUT is zero', () => {
      process.env.MIN_STELLAR_PAYOUT = '0';
      expect(() => new ConfigService()).toThrow(
        /Invalid MIN_STELLAR_PAYOUT/,
      );
    });

    it('throws at startup when MIN_STELLAR_PAYOUT is negative', () => {
      process.env.MIN_STELLAR_PAYOUT = '-5';
      expect(() => new ConfigService()).toThrow(
        /Invalid MIN_STELLAR_PAYOUT/,
      );
    });

    it('throws at startup when MIN_STELLAR_PAYOUT is empty string', () => {
      process.env.MIN_STELLAR_PAYOUT = '';
      expect(() => new ConfigService()).toThrow(
        /Invalid MIN_STELLAR_PAYOUT/,
      );
    });

    it('error message includes the invalid value', () => {
      process.env.MIN_STELLAR_PAYOUT = 'abc';
      expect(() => new ConfigService()).toThrow('"abc"');
    });
  });
});
