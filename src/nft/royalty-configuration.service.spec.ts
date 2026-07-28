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
