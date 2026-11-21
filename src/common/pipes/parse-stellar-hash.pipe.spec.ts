import { BadRequestException } from '@nestjs/common';
import { ParseStellarHashPipe } from './parse-stellar-hash.pipe';

const VALID_HASH = 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456';

describe('ParseStellarHashPipe', () => {
  const pipe = new ParseStellarHashPipe();

  describe('valid inputs', () => {
    it('accepts a 64-char lowercase hex hash', () =>
      expect(pipe.transform(VALID_HASH)).toBe(VALID_HASH));

    it('normalises uppercase to lowercase', () =>
      expect(pipe.transform(VALID_HASH.toUpperCase())).toBe(VALID_HASH));

    it('trims surrounding whitespace', () =>
      expect(pipe.transform(`  ${VALID_HASH}  `)).toBe(VALID_HASH));
  });

  describe('invalid inputs', () => {
    const cases: Array<[string, string]> = [
      ['', 'empty string'],
      ['abc', 'too short'],
      [VALID_HASH + '00', '66 chars (too long)'],
      [VALID_HASH.slice(0, 63), '63 chars (too short)'],
      ['g' + VALID_HASH.slice(1), 'non-hex character (g)'],
      ['550e8400-e29b-41d4-a716-446655440000', 'UUID format'],
      [VALID_HASH.slice(0, 32) + ' ' + VALID_HASH.slice(33), 'space in middle'],
    ];

    for (const [input, label] of cases) {
      it(`rejects ${label}`, () => {
        expect(() => pipe.transform(input)).toThrow(BadRequestException);
      });
    }

    it('returns HTTP 400 with the standard error body', () => {
      try {
        pipe.transform('not-a-hash');
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
