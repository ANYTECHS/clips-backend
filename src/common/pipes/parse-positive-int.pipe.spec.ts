import { BadRequestException } from '@nestjs/common';
import { ParsePositiveIntPipe } from './parse-positive-int.pipe';

describe('ParsePositiveIntPipe', () => {
  const pipe = new ParsePositiveIntPipe();

  describe('valid inputs', () => {
    it('parses "1"', () => expect(pipe.transform('1')).toBe(1));
    it('parses "42"', () => expect(pipe.transform('42')).toBe(42));
    it('parses a large integer', () => expect(pipe.transform('999999')).toBe(999999));
    it('trims surrounding whitespace', () => expect(pipe.transform('  7  ')).toBe(7));
  });

  describe('invalid inputs', () => {
    const cases: Array<[string, string]> = [
      ['0', 'zero'],
      ['-1', 'negative'],
      ['1.5', 'float'],
      ['abc', 'non-numeric'],
      ['', 'empty string'],
      ['1e2', 'exponential notation'],
      ['0x1A', 'hex notation'],
      ['1 2', 'integer with space'],
      ['null', 'null string'],
    ];

    for (const [input, label] of cases) {
      it(`rejects ${label} ("${input}")`, () => {
        expect(() => pipe.transform(input)).toThrow(BadRequestException);
      });
    }

    it('returns HTTP 400 with the standard error body', () => {
      try {
        pipe.transform('abc');
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
