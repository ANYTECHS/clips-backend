import { BadRequestException } from '@nestjs/common';
import { ParseStellarAddressPipe } from './parse-stellar-address.pipe';

const VALID_ADDRESS = 'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3';

describe('ParseStellarAddressPipe', () => {
  const pipe = new ParseStellarAddressPipe();

  describe('valid inputs', () => {
    it('accepts a well-formed Stellar address', () =>
      expect(pipe.transform(VALID_ADDRESS)).toBe(VALID_ADDRESS));

    it('accepts another well-formed address', () =>
      expect(pipe.transform('GABF3GSMTDXOQ5RQLKJ3VYGJ6DX2J5YINOSPKO27YKTUUHTZF3XOTK6L')).toBe(
        'GABF3GSMTDXOQ5RQLKJ3VYGJ6DX2J5YINOSPKO27YKTUUHTZF3XOTK6L',
      ));

    it('trims surrounding whitespace', () =>
      expect(pipe.transform(`  ${VALID_ADDRESS}  `)).toBe(VALID_ADDRESS));
  });

  describe('invalid inputs', () => {
    const cases: Array<[string, string]> = [
      ['', 'empty string'],
      ['abc', 'too short'],
      [VALID_ADDRESS + 'A', '57 chars (too long)'],
      [VALID_ADDRESS.slice(0, 55), '55 chars (too short)'],
      ['A' + VALID_ADDRESS.slice(1), 'does not start with G'],
      ['G' + VALID_ADDRESS.slice(1, 55) + '8', 'invalid base32 character (8)'],
      ['G' + VALID_ADDRESS.slice(1, 55) + '1', 'invalid base32 character (1)'],
      ['g' + VALID_ADDRESS.slice(1), 'lowercase g prefix'],
      [VALID_ADDRESS.slice(0, 28) + ' ' + VALID_ADDRESS.slice(29), 'space in middle'],
    ];

    for (const [input, label] of cases) {
      it(`rejects ${label}`, () => {
        expect(() => pipe.transform(input)).toThrow(BadRequestException);
      });
    }

    it('returns HTTP 400 with the standard error body', () => {
      try {
        pipe.transform('not-an-address');
        fail('expected exception');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(BadRequestException);
        const response = (err as BadRequestException).getResponse() as Record<string, unknown>;
        expect(response.statusCode).toBe(400);
        expect(response.error).toBe('Bad Request');
        expect(typeof response.message).toBe('string');
      }
    });
  });
});
