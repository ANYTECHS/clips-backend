import { BadRequestException } from '@nestjs/common';
import StellarSdk from '@stellar/stellar-sdk';
import { RoyaltyConfigurationService } from './royalty-configuration.service';
import { ConfigService } from '../config/config.service';

describe('RoyaltyConfigurationService', () => {
  const config = {
    creatorRoyaltyBps: 1000,
    platformRoyaltyBps: 100,
    platformWallet: 'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
  } as ConfigService;

  let service: RoyaltyConfigurationService;

  beforeEach(() => {
    service = new RoyaltyConfigurationService(config);
  });

  it('returns default creator royalty when clip override is absent', () => {
    expect(service.getCreatorRoyaltyBps()).toBe(1000);
    expect(service.getCreatorRoyaltyBps(null)).toBe(1000);
  });

  it('uses clip royalty override when provided', () => {
    expect(service.getCreatorRoyaltyBps(750)).toBe(750);
  });

  it('validates royalty bounds', () => {
    expect(() => service.validateRoyaltyBps(1501)).toThrow(BadRequestException);
    expect(() => service.getCreatorRoyaltyBps(2000)).toThrow(
      BadRequestException,
    );
  });

  it('throws when combined creator + platform BPS exceeds protocol max', () => {
    // ROYALTY_PROTOCOL_MAX_BPS = 10000; use values that exceed it
    const highBpsConfig = {
      ...config,
      creatorRoyaltyBps: 9900,
      platformRoyaltyBps: 200,
    } as ConfigService;
    const svc = new RoyaltyConfigurationService(highBpsConfig);
    expect(() =>
      svc.buildRoyaltyMap(
        'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
      ),
    ).toThrow(BadRequestException);
  });

  it('validateCombinedRoyaltyBps throws when total exceeds max', () => {
    // 9800 + 300 = 10100 > 10000 (ROYALTY_PROTOCOL_MAX_BPS)
    expect(() => service.validateCombinedRoyaltyBps(9800, 300)).toThrow(
      BadRequestException,
    );
  });

  it('validateCombinedRoyaltyBps passes when total is within limit', () => {
    expect(() => service.validateCombinedRoyaltyBps(1000, 200)).not.toThrow();
  });

  it('builds Soroban royalty map entries for creator and platform', () => {
    const map = service.buildRoyaltyMap(
      'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
      1200,
    );

    expect(map).toHaveLength(2);
    expect(StellarSdk.scValToNative(map[0].value)).toBe(1200);
    expect(StellarSdk.scValToNative(map[1].value)).toBe(100);
  });

  it('includes default label and description in royalty map entries', () => {
    const map = service.buildRoyaltyMap(
      'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
      1000,
    );

    expect(map[0].label).toBe('Creator');
    expect(map[1].label).toBe('Platform');
    expect(map[0].description).toContain('%');
    expect(map[1].description).toContain('%');
  });

  it('uses custom creatorLabel when provided', () => {
    const map = service.buildRoyaltyMap(
      'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
      500,
      { creatorLabel: 'Original Artist' },
    );

    expect(map[0].label).toBe('Original Artist');
  });

  it('uses custom royaltyDescription when provided', () => {
    const description = 'Custom split: 5% creator + 1% platform';
    const map = service.buildRoyaltyMap(
      'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
      500,
      { royaltyDescription: description },
    );

    expect(map[0].description).toBe(description);
  });

  describe('calculateRoyalty', () => {
    it('computes 10% royalty on a sale price', () => {
      expect(service.calculateRoyalty(100_000_000, 1000)).toBe(10_000_000);
    });

    it('returns 0 for a zero sale price', () => {
      expect(service.calculateRoyalty(0, 1000)).toBe(0);
    });

    it('returns 0 for zero royalty bps', () => {
      expect(service.calculateRoyalty(1_000_000, 0)).toBe(0);
    });

    it('rounds down fractional stroops', () => {
      // 101 * 250 / 10_000 = 2.525 -> floors to 2
      expect(service.calculateRoyalty(101, 250)).toBe(2);
    });

    it('matches the on-chain calculate_royalty helper for the same inputs', () => {
      // Mirrors contracts/nft-contract/src/test.rs::test_calculate_royalty_ten_percent
      expect(service.calculateRoyalty(500, 1000)).toBe(50);
    });

    it('rejects royaltyBps above the allowed maximum', () => {
      expect(() => service.calculateRoyalty(1000, 1501)).toThrow(
        BadRequestException,
      );
    });

    it('rejects a negative sale price', () => {
      expect(() => service.calculateRoyalty(-1, 1000)).toThrow(
        BadRequestException,
      );
    });

    it('rejects a non-integer sale price', () => {
      expect(() => service.calculateRoyalty(1.5, 1000)).toThrow(
        BadRequestException,
      );
    });

    // ── Extreme / boundary value tests ──────────────────────────────────────

    it('handles a very large safe sale price correctly (900 000 XLM at 1500 bps)', () => {
      // 9_000_000_000_000 stroops × 1500 bps / 10_000 = 1_350_000_000_000
      // Both salePrice and result are well within Number.MAX_SAFE_INTEGER.
      const salePrice = 9_000_000_000_000;
      const royaltyBps = 1500;
      const expected = Math.floor((salePrice * royaltyBps) / 10_000);
      // Verify expected is safe (i.e. the test assumption is correct)
      expect(expected).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER);
      expect(service.calculateRoyalty(salePrice, royaltyBps)).toBe(expected);
    });

    it('returns 0 for any salePrice when royaltyBps is 0', () => {
      expect(service.calculateRoyalty(Number.MAX_SAFE_INTEGER, 0)).toBe(0);
    });

    it('returns 0 for salePrice of 0 regardless of royaltyBps', () => {
      expect(service.calculateRoyalty(0, 1500)).toBe(0);
    });

    it('correctly computes royalty for salePrice = 1 and royaltyBps = 1 (floors to 0)', () => {
      // 1 * 1 / 10_000 = 0.0001 -> floors to 0
      expect(service.calculateRoyalty(1, 1)).toBe(0);
    });

    it('correctly computes royalty for minimum non-zero result (salePrice=10000, bps=1)', () => {
      // 10_000 * 1 / 10_000 = 1
      expect(service.calculateRoyalty(10_000, 1)).toBe(1);
    });

    it('throws BadRequestException when computed royalty would exceed Number.MAX_SAFE_INTEGER', () => {
      // salePrice = Number.MAX_SAFE_INTEGER (9_007_199_254_740_991),
      // royaltyBps = 1500 → product = 1.35 × 10^19 >> Number.MAX_SAFE_INTEGER (9 × 10^15)
      // checkedRoyaltyAmount must reject this rather than silently corrupt it.
      expect(() =>
        service.calculateRoyalty(Number.MAX_SAFE_INTEGER, 1500),
      ).toThrow(BadRequestException);
    });

    it('throws BadRequestException for salePrice just above the safe threshold', () => {
      // 10^16 * 1500 / 10_000 = 1.5 × 10^15 which IS safe; increase bps to push result over.
      // Number.MAX_SAFE_INTEGER / 10_000 ≈ 900_719_925_474 -> use salePrice slightly above
      const highPrice = Math.floor(Number.MAX_SAFE_INTEGER / 1500) + 1; // result would overflow
      expect(() =>
        service.calculateRoyalty(highPrice, 1500),
      ).toThrow(BadRequestException);
    });
  });

  it('throws when platform wallet is missing', () => {
    const missingWalletConfig = {
      ...config,
      platformWallet: '',
    } as ConfigService;
    const svc = new RoyaltyConfigurationService(missingWalletConfig);

    expect(() =>
      svc.buildRoyaltyMap(
        'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
      ),
    ).toThrow('PLATFORM_WALLET_ADDRESS is not configured');
  });
});
