import {
  maskAddress,
  formatCurrency,
  startOfUtcDay,
  previousUtcDay,
  validateAddressForChain,
  chainDisplayName,
  STELLAR_PUBLIC_KEY_REGEX,
  SOLANA_ADDRESS_REGEX,
  EVM_ADDRESS_REGEX,
  SupportedChain,
  SharedModule,
} from './index';

describe('shared utilities (@clipcash/shared)', () => {
  describe('maskAddress', () => {
    it('masks wallet addresses with the existing public format (4 start, 6 end)', () => {
      expect(
        maskAddress(
          'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
        ),
      ).toBe('GC6X...UHTZF3');
      expect(
        maskAddress(
          'GABF0000000000000000000000000000000000000000000000000KJ93XD',
        ),
      ).toBe('GABF...KJ93XD');
    });

    it('masks EVM address format properly', () => {
      expect(
        maskAddress('0x1234567890abcdef1234567890abcdef12345678'),
      ).toBe('0x12...345678');
    });

    it('leaves short addresses untouched (less than 10 characters)', () => {
      expect(maskAddress('GABC12')).toBe('GABC12');
      expect(maskAddress('123456789')).toBe('123456789');
    });

    it('handles exact 10-character boundary', () => {
      expect(maskAddress('1234567890')).toBe('1234...567890');
    });

    it('passes through empty and nullish values safely', () => {
      expect(maskAddress('')).toBe('');
      expect(maskAddress(null)).toBeNull();
      expect(maskAddress(undefined)).toBeUndefined();
    });
  });

  describe('formatCurrency', () => {
    it('formats currency using the expected locale and currency code', () => {
      expect(formatCurrency(12.5, 'USD', 'en-US')).toBe('$12.50');
      expect(formatCurrency('42', 'EUR', 'en-US')).toBe('€42.00');
      expect(formatCurrency(null, 'USD', 'en-US')).toBe('$0.00');
      expect(formatCurrency(undefined, 'USD', 'en-US')).toBe('$0.00');
    });

    it('handles invalid numeric strings gracefully by returning $0.00', () => {
      expect(formatCurrency('invalid-amount', 'USD', 'en-US')).toBe('$0.00');
      expect(formatCurrency(NaN, 'USD', 'en-US')).toBe('$0.00');
      expect(formatCurrency(Infinity, 'USD', 'en-US')).toBe('$0.00');
    });

    it('respects optional Intl.NumberFormatOptions', () => {
      expect(
        formatCurrency(100.5, 'USD', 'en-US', {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        }),
      ).toBe('$101');
    });
  });

  describe('date helpers', () => {
    it('truncates to midnight UTC using startOfUtcDay', () => {
      const instant = new Date('2026-03-15T18:45:00.123Z');
      const start = startOfUtcDay(instant);
      expect(start.toISOString()).toBe('2026-03-15T00:00:00.000Z');
      expect(start.getUTCHours()).toBe(0);
      expect(start.getUTCMinutes()).toBe(0);
      expect(start.getUTCSeconds()).toBe(0);
      expect(start.getUTCMilliseconds()).toBe(0);
    });

    it('returns preceding UTC midnight using previousUtcDay', () => {
      const instant = new Date('2026-03-15T18:45:00.000Z');
      expect(previousUtcDay(instant).toISOString()).toBe(
        '2026-03-14T00:00:00.000Z',
      );
    });

    it('crosses month and leap year boundaries properly in previousUtcDay', () => {
      const marchFirstLeap = new Date('2024-03-01T05:00:00.000Z');
      expect(previousUtcDay(marchFirstLeap).toISOString()).toBe(
        '2024-02-29T00:00:00.000Z',
      );

      const janFirst = new Date('2026-01-01T00:00:00.000Z');
      expect(previousUtcDay(janFirst).toISOString()).toBe(
        '2025-12-31T00:00:00.000Z',
      );
    });
  });

  describe('validation helpers and regexes', () => {
    it('validates Stellar addresses', () => {
      const validStellar =
        'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
      expect(validateAddressForChain(validStellar, 'stellar')).toBe(true);
      expect(STELLAR_PUBLIC_KEY_REGEX.test(validStellar)).toBe(true);

      // Wrong length
      expect(validateAddressForChain('GABC', 'stellar')).toBe(false);
      // Bad prefix
      expect(
        validateAddressForChain(
          'SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
          'stellar',
        ),
      ).toBe(false);
      // Non-base32 chars (0, 1, 8, 9)
      expect(
        validateAddressForChain(
          'G000000000000000000000000000000000000000000000000000000000000',
          'stellar',
        ),
      ).toBe(false);
    });

    it('validates Solana addresses', () => {
      const validSolana = '11111111111111111111111111111111';
      expect(validateAddressForChain(validSolana, 'solana')).toBe(true);
      expect(SOLANA_ADDRESS_REGEX.test(validSolana)).toBe(true);

      // Too short
      expect(validateAddressForChain('short', 'solana')).toBe(false);
      // Invalid base58 characters (0, O, I, l)
      expect(
        validateAddressForChain(
          '000000000000000000000000000000000000000000',
          'solana',
        ),
      ).toBe(false);
    });

    it('validates Base / EVM addresses', () => {
      const validEvm = '0x1111111111111111111111111111111111111111';
      expect(validateAddressForChain(validEvm, 'base')).toBe(true);
      expect(EVM_ADDRESS_REGEX.test(validEvm)).toBe(true);

      // Missing 0x prefix
      expect(
        validateAddressForChain(
          '1111111111111111111111111111111111111111',
          'base',
        ),
      ).toBe(false);
      // Invalid length (41 chars)
      expect(
        validateAddressForChain(
          '0x111111111111111111111111111111111111111',
          'base',
        ),
      ).toBe(false);
      // Invalid hex characters
      expect(
        validateAddressForChain(
          '0xZZZZ111111111111111111111111111111111111',
          'base',
        ),
      ).toBe(false);
    });

    it('returns false for unsupported chains', () => {
      expect(
        validateAddressForChain('any-address', 'unsupported' as SupportedChain),
      ).toBe(false);
    });

    it('exposes user-friendly chain display names with fallback', () => {
      expect(chainDisplayName('stellar')).toBe(
        'Stellar (G-prefix, Base32, 56 chars)',
      );
      expect(chainDisplayName('solana')).toBe('Solana (base58, 32–44 chars)');
      expect(chainDisplayName('base')).toBe('Base (0x-prefixed hex, 42 chars)');
      expect(chainDisplayName('polygon' as SupportedChain)).toBe('polygon');
    });
  });

  describe('SharedModule', () => {
    it('is exported and defined', () => {
      expect(SharedModule).toBeDefined();
    });
  });
});
