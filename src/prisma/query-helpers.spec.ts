import {
  buildPaginationArgs,
  clipListSelect,
  normalizePagination,
  paginateQuery,
  payoutDetailSelect,
  payoutListSelect,
  userEarningsWhere,
} from './query-helpers';

describe('query-helpers (Issue #1237)', () => {
  describe('normalizePagination / buildPaginationArgs', () => {
    it('defaults to page 1 / limit 20', () => {
      expect(normalizePagination(undefined, undefined)).toEqual({ page: 1, limit: 20 });
      expect(buildPaginationArgs(undefined, undefined)).toMatchObject({ page: 1, limit: 20, skip: 0, take: 20 });
    });

    it('bounds limit to maxLimit and computes skip', () => {
      expect(buildPaginationArgs(3, 500)).toMatchObject({ page: 3, limit: 100, skip: 200, take: 100 });
      expect(buildPaginationArgs(2, 10)).toMatchObject({ skip: 10, take: 10 });
    });
  });

  describe('paginateQuery', () => {
    it('returns standardized pagination metadata without altering contracts', async () => {
      const result = await paginateQuery(
        async ({ skip, take }) => Array.from({ length: take }, (_, i) => skip + i + 1),
        async () => 45,
        2,
        20,
      );
      expect(result).toMatchObject({ items: expect.any(Array), total: 45, page: 2, limit: 20, totalPages: 3 });
      expect(result.hasNextPage).toBe(true);
      expect(result.hasPreviousPage).toBe(true);
      expect(result.items[0]).toBe(21);
    });

    it('handles empty sets with zero total pages', async () => {
      const result = await paginateQuery(async () => [], async () => 0, 1, 20);
      expect(result.totalPages).toBe(0);
      expect(result.hasNextPage).toBe(false);
    });
  });

  describe('shared filters / selects', () => {
    it('builds the canonical user earnings filter', () => {
      expect(userEarningsWhere(7)).toEqual({
        clip: { video: { userId: 7 } },
        deletedAt: null,
      });
    });

    it('keeps payout selects consistent (detail extends list)', () => {
      for (const key of Object.keys(payoutListSelect)) {
        expect(payoutDetailSelect).toHaveProperty(key);
      }
      expect(payoutDetailSelect).toHaveProperty('approvedBy');
    });

    it('exposes a clip list select without broad includes', () => {
      expect(clipListSelect).toHaveProperty('id');
      expect(clipListSelect).not.toHaveProperty('video');
    });
  });
});
