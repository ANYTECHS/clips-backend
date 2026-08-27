import { maskAddress } from './wallet.utils';

describe('maskAddress (Issue #763)', () => {
  const STELLAR_ADDRESS =
    'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3';

  it('keeps the first 4 and last 6 characters and masks the middle', () => {
    expect(maskAddress(STELLAR_ADDRESS)).toBe('GC6X********UHTZF3');
  });

  it('never leaks the middle of the address', () => {
    const masked = maskAddress(STELLAR_ADDRESS);
    expect(masked).not.toContain(STELLAR_ADDRESS.slice(4, -6));
  });

  it('leaves short addresses untouched', () => {
    expect(maskAddress('GABC12')).toBe('GABC12');
    expect(maskAddress('123456789')).toBe('123456789');
  });

  it('masks an address exactly at the 10-character boundary', () => {
    expect(maskAddress('1234567890')).toBe('1234********567890');
  });

  it('passes through empty and nullish values without throwing', () => {
    expect(maskAddress('')).toBe('');
    expect(maskAddress(undefined as unknown as string)).toBeUndefined();
    expect(maskAddress(null as unknown as string)).toBeNull();
  });
});
