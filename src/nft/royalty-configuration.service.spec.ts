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
    expect(() => service.getCreatorRoyaltyBps(2000)).toThrow(BadRequestException);
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
