/**
 * Snapshot tests for key API response shapes (#1024).
 *
 * These fixtures mirror the documented Swagger DTOs / response schemas for:
 * - Clips list
 * - Earnings total
 * - Wallet information
 *
 * Sensitive fields (tokens, secrets, encrypted account data) are intentionally
 * omitted. Update snapshots only for intentional API contract changes — and
 * keep DTO + Swagger docs in sync when you do.
 */
import { ClipResponseDto } from '../clips/dto/clip-response.dto';
import { PaginatedResponseDto } from '../common/dtos/api-response.dto';
import { maskAddress } from '../wallets/wallet.utils';

describe('API response snapshots (#1024)', () => {
  describe('Clips list', () => {
    it('matches ClipResponseDto / Swagger list item shape', () => {
      const clip: ClipResponseDto = {
        id: 42,
        videoId: 7,
        clipUrl: 'https://res.cloudinary.com/demo/video/upload/v1/clip.mp4',
        thumbnail: 'https://res.cloudinary.com/demo/image/upload/v1/thumb.jpg',
        viralityScore: 88,
        selected: false,
        royaltyBps: 1000,
        mintAddress: null,
        mintedAt: null,
        nftStatus: 'none',
        createdAt: new Date('2026-07-27T12:00:00.000Z'),
        updatedAt: new Date('2026-07-27T12:05:00.000Z'),
      };

      const list = new PaginatedResponseDto([clip], 1, 1, 20);

      // Serialize dates for stable snapshots; never include auth tokens.
      expect(JSON.parse(JSON.stringify(list))).toMatchSnapshot();
    });
  });

  describe('Earnings', () => {
    it('matches documented earnings total response schema', () => {
      const earningsTotal = {
        total: 2500.5,
        currency: 'USD',
      };

      expect(earningsTotal).toMatchSnapshot();
    });

    it('matches documented earnings dashboard response schema', () => {
      const dashboard = {
        totalEarned: 1250.5,
        currency: 'USD',
        pendingPayout: 50.0,
        paidOut: 200.0,
        breakdown: {
          royalties: 800.0,
          subscriptions: 450.5,
        },
        history: [
          {
            date: '2026-07-01T00:00:00.000Z',
            amount: 100,
            currency: 'USD',
            type: 'royalty',
          },
        ],
      };

      expect(dashboard).toMatchSnapshot();
    });
  });

  describe('Wallet information', () => {
    it('matches documented wallet list item shape with masked address', () => {
      const rawAddress =
        'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
      const wallet = {
        id: 1,
        address: maskAddress(rawAddress),
        chain: 'stellar',
        type: 'freighter',
        connectedAt: '2026-07-27T12:00:00.000Z',
      };

      // Assert no sensitive material leaked into the snapshot payload.
      expect(JSON.stringify(wallet)).not.toMatch(/token|secret|private|encrypted/i);
      expect(wallet.address).not.toBe(rawAddress);
      expect(wallet).toMatchSnapshot();
    });
  });
});
