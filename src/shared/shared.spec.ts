import { maskAddress } from './address';
import { formatCurrency } from './currency';
import { previousUtcDay, startOfUtcDay } from './date';
import { chainDisplayName, validateAddressForChain } from './validation';

describe('shared utilities', () => {
  it('masks wallet addresses with the existing public format', () => {
    expect(maskAddress('GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3')).toBe(
      'GC6X********UHTZF3',
    );
    expect(maskAddress('GABC12')).toBe('GABC12');
    expect(maskAddress('')).toBe('');
  });

  it('formats currency using the expected locale and currency code', () => {
    expect(formatCurrency(12.5, 'USD', 'en-US')).toBe('$12.50');
    expect(formatCurrency('42', 'EUR', 'en-US')).toBe('€42.00');
    expect(formatCurrency(null, 'USD', 'en-US')).toBe('$0.00');
  });

  it('keeps UTC day boundary helpers consistent', () => {
    const instant = new Date('2026-03-15T18:45:00Z');
    expect(startOfUtcDay(instant).toISOString()).toBe('2026-03-15T00:00:00.000Z');
    expect(previousUtcDay(instant).toISOString()).toBe('2026-03-14T00:00:00.000Z');
  });

  it('validates addresses by chain and exposes chain labels', () => {
    expect(validateAddressForChain('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF', 'stellar')).toBe(true);
    expect(validateAddressForChain('11111111111111111111111111111111', 'solana')).toBe(true);
    expect(validateAddressForChain('0x1111111111111111111111111111111111111111', 'base')).toBe(true);
    expect(validateAddressForChain('bad-value', 'base')).toBe(false);
    expect(chainDisplayName('stellar')).toContain('Stellar');
  });
});
