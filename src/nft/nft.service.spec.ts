import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { NftService } from './nft.service';
import { NftConfig } from './nft.config';

function makeConfig(overrides: Partial<NftConfig> = {}): NftConfig {
  const cfg = new NftConfig();
  return Object.assign(cfg, {
    creatorRoyaltyBps: 1000,
    platformRoyaltyBps: 100,
    platformWallet: 'PLATFORM_WALLET_ADDR',
    ...overrides,
  });
}

describe('NftService', () => {
  let service: NftService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NftService,
        { provide: NftConfig, useValue: makeConfig() },
      ],
    }).compile();

    service = module.get<NftService>(NftService);
  });

  describe('buildRoyalties', () => {
    it('returns creator (1000 bps) and platform (100 bps) entries', () => {
      const royalties = service.buildRoyalties('CREATOR_WALLET');

      expect(royalties).toHaveLength(2);

      const creator = royalties.find((r) => r.label === 'creator');
      expect(creator).toMatchObject({ wallet: 'CREATOR_WALLET', bps: 1000 });

      const platform = royalties.find((r) => r.label === 'platform');
      expect(platform).toMatchObject({ wallet: 'PLATFORM_WALLET_ADDR', bps: 100 });
    });

    it('creator entry comes before platform entry', () => {
      const royalties = service.buildRoyalties('CREATOR_WALLET');
      expect(royalties[0].label).toBe('creator');
      expect(royalties[1].label).toBe('platform');
    });
  });

  describe('mintClip', () => {
    it('returns a txHash and the full transaction payload', async () => {
      const result = await service.mintClip({
        clipId: 'clip-123',
        creatorWallet: 'CREATOR_WALLET',
        metadataUri: 'https://ipfs.io/ipfs/Qm...',
      });

      expect(result.txHash).toMatch(/^sim_tx_clip-123_/);
      expect(result.transaction.clipId).toBe('clip-123');
      expect(result.transaction.royalties).toHaveLength(2);
    });

    it('throws BadRequestException when platform wallet is not configured', async () => {
      const module = await Test.createTestingModule({
        providers: [
          NftService,
          { provide: NftConfig, useValue: makeConfig({ platformWallet: '' }) },
        ],
      }).compile();

      const svc = module.get<NftService>(NftService);
      await expect(
        svc.mintClip({ clipId: 'clip-1', creatorWallet: 'WALLET' }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
