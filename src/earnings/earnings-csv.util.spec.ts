import {
  buildCsvRow,
  buildEarningsCsv,
  escapeCsvField,
} from './earnings-csv.util';

describe('earnings-csv.util', () => {
  describe('escapeCsvField', () => {
    it('returns plain values unchanged', () => {
      expect(escapeCsvField('royalty')).toBe('royalty');
      expect(escapeCsvField(42.5)).toBe('42.5');
    });

    it('wraps fields containing commas in quotes', () => {
      expect(escapeCsvField('Clip, Part 2')).toBe('"Clip, Part 2"');
    });

    it('escapes double quotes', () => {
      expect(escapeCsvField('Say "hello"')).toBe('"Say ""hello"""');
    });

    it('wraps fields containing newlines', () => {
      expect(escapeCsvField('line1\nline2')).toBe('"line1\nline2"');
    });

    it('returns empty string for null and undefined', () => {
      expect(escapeCsvField(null)).toBe('');
      expect(escapeCsvField(undefined)).toBe('');
    });
  });

  describe('buildEarningsCsv', () => {
    it('includes header row and data rows', () => {
      const csv = buildEarningsCsv([
        [
          '2024-01-01T00:00:00.000Z',
          'My Clip',
          10,
          'USD',
          'royalty',
          '1',
        ],
      ]);

      expect(csv).toBe(
        'date,clip title,amount,currency,source,transactionId\n' +
          '2024-01-01T00:00:00.000Z,My Clip,10,USD,royalty,1',
      );
    });

    it('escapes special characters in clip titles', () => {
      const csv = buildEarningsCsv([
        ['2024-01-01T00:00:00.000Z', 'Clip, "A"', 1, 'USD', 'royalty', '2'],
      ]);

      expect(csv).toContain('"Clip, ""A"""');
    });
  });

  describe('buildCsvRow', () => {
    it('joins escaped fields with commas', () => {
      expect(buildCsvRow(['a', 'b,c', 3])).toBe('a,"b,c",3');
    });
  });
});
