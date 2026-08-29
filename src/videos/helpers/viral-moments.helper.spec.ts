import { normalizeMoments, fallbackFixedChunks, computeAverageClipDuration, safeParseJson, parseClaudeResponse } from './viral-moments.helper';

describe('viral-moments.helper', () => {
  describe('normalizeMoments', () => {
    it('clamps to duration and removes overlaps', () => {
      const result = normalizeMoments(
        [
          { start: -5, end: 20, reason: 'a' },
          { start: 15, end: 40, reason: 'b' },
          { start: 50, end: 200, reason: 'c' },
        ],
        100,
      );

      expect(result).toEqual([
        { start: 0, end: 20, reason: 'a' },
        { start: 20, end: 40, reason: 'b' },
        { start: 50, end: 100, reason: 'c' },
      ]);
    });
  });

  describe('fallbackFixedChunks', () => {
    it('creates 30-second non-overlapping chunks', () => {
      const chunks = fallbackFixedChunks(90);
      expect(chunks).toHaveLength(3);
      expect(chunks[0]).toEqual({
        start: 0,
        end: 30,
        reason: 'fallback-fixed-chunk',
      });
      expect(chunks[2]).toEqual({
        start: 60,
        end: 90,
        reason: 'fallback-fixed-chunk',
      });
    });
  });

  describe('computeAverageClipDuration', () => {
    it('returns 0 for empty input', () => {
      expect(computeAverageClipDuration([])).toBe(0);
    });

    it('averages clip lengths', () => {
      expect(
        computeAverageClipDuration([
          { start: 0, end: 10, reason: 'a' },
          { start: 10, end: 30, reason: 'b' },
        ]),
      ).toBe(15);
    });
  });

  describe('safeParseJson', () => {
    it('parses embedded JSON objects', () => {
      expect(safeParseJson('prefix {"clips":[]} suffix')).toEqual({ clips: [] });
    });

    it('returns null for invalid JSON', () => {
      expect(safeParseJson('not-json')).toBeNull();
    });
  });

  describe('parseClaudeResponse', () => {
    it('returns moments when clip count meets minimum', () => {
      const clips = Array.from({ length: 10 }, (_, i) => ({
        start: i * 10,
        end: i * 10 + 5,
        reason: `r${i}`,
      }));
      const result = parseClaudeResponse(
        { content: [{ text: JSON.stringify({ clips }) }] },
        30,
        10,
      );
      expect(result).toHaveLength(10);
    });

    it('returns null when too few valid clips', () => {
      const result = parseClaudeResponse(
        { content: [{ text: JSON.stringify({ clips: [{ start: 0, end: 5 }] }) }] },
        30,
        10,
      );
      expect(result).toBeNull();
    });
  });
});
