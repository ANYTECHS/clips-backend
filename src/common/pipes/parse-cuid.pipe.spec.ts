import { BadRequestException } from '@nestjs/common';
import { ParseCuidPipe } from './parse-cuid.pipe';

describe('ParseCuidPipe', () => {
  const pipe = new ParseCuidPipe();

  describe('valid inputs', () => {
    it('accepts a well-formed CUID', () =>
      expect(pipe.transform('cjld2cyuq0000t3rmniod1foy')).toBe('cjld2cyuq0000t3rmniod1foy'));

    it('accepts another well-formed CUID', () =>
      expect(pipe.transform('cjld2cye60000t3rmniod2foy')).toBe('cjld2cye60000t3rmniod2foy'));

    it('trims surrounding whitespace', () =>
      expect(pipe.transform('  cjld2cyuq0000t3rmniod1foy  ')).toBe('cjld2cyuq0000t3rmniod1foy'));
  });

  describe('invalid inputs', () => {
    const cases: Array<[string, string]> = [
      ['', 'empty string'],
      ['abc', 'too short'],
      ['550e8400-e29b-41d4-a716-446655440000', 'UUID v4'],
      ['CJLD2CYUQ0000T3RMNIOD1FOY', 'uppercase CUID'],
      ['djld2cyuq0000t3rmniod1foy', 'wrong prefix (d instead of c)'],
      ['cjld2cyuq0000t3rmniod1fo', 'one char short (24 chars total)'],
      ['cjld2cyuq0000t3rmniod1foyz', 'one char too long (26 chars total)'],
      ['cjld2cyuq0000t3rmniod1fo!', 'non-alphanumeric character'],
    ];

    for (const [input, label] of cases) {
      it(`rejects ${label}`, () => {
        expect(() => pipe.transform(input)).toThrow(BadRequestException);
      });
    }

    it('returns HTTP 400 with the standard error body', () => {
      try {
        pipe.transform('not-a-cuid');
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
