import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';
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
      providers: [NftService, { provide: NftConfig, useValue: makeConfig() }],
    }).compile();

    service = module.get<NftService>(NftService);
  });

  describe('buildRoyalties', () => {
    it('returns creator (1000 bps) and platform (100 bps) entries by default', () => {
      const royalties = service.buildRoyalties('CREATOR_WALLET');

      expect(royalties).toHaveLength(2);

      const creator = royalties.find((r) => r.label === 'creator');
      expect(creator).toMatchObject({ wallet: 'CREATOR_WALLET', bps: 1000 });

      const platform = royalties.find((r) => r.label === 'platform');
      expect(platform).toMatchObject({
        wallet: 'PLATFORM_WALLET_ADDR',
        bps: 100,
      });
    });

    it('creator receives configured percentage when creatorRoyaltyBps is specified', () => {
      const royalties = service.buildRoyalties('CREATOR_WALLET', 750);

      const creator = royalties.find((r) => r.label === 'creator');
      expect(creator).toMatchObject({ wallet: 'CREATOR_WALLET', bps: 750 });

      const platform = royalties.find((r) => r.label === 'platform');
      expect(platform).toMatchObject({
        wallet: 'PLATFORM_WALLET_ADDR',
        bps: 100,
      });
    });

    it('creator entry comes before platform entry', () => {
      const royalties = service.buildRoyalties('CREATOR_WALLET');
      expect(royalties[0].label).toBe('creator');
      expect(royalties[1].label).toBe('platform');
    });

    it('supports multiple recipients when additional recipients are provided', () => {
      const additional = [
        {
          wallet: 'CO_CREATOR_WALLET',
          bps: 500,
          label: 'co-creator',
        },
        {
          wallet: 'CHARITY_WALLET',
          bps: 200,
          label: 'charity',
        },
      ];

      const royalties = service.buildRoyalties('CREATOR_WALLET', 800, additional);

      expect(royalties).toHaveLength(4);
      expect(royalties[0]).toMatchObject({ wallet: 'CREATOR_WALLET', bps: 800, label: 'creator' });
      expect(royalties[1]).toMatchObject({ wallet: 'PLATFORM_WALLET_ADDR', bps: 100, label: 'platform' });
      expect(royalties[2]).toMatchObject({ wallet: 'CO_CREATOR_WALLET', bps: 500, label: 'co-creator' });
      expect(royalties[3]).toMatchObject({ wallet: 'CHARITY_WALLET', bps: 200, label: 'charity' });
    });

    it('validates total BPS and throws BadRequestException when total exceeds 10000', () => {
      // 9950 + 100 = 10050 > 10000
      expect(() => service.buildRoyalties('CREATOR_WALLET', 9950)).toThrow(BadRequestException);
    });

    it('validates each recipient BPS and throws BadRequestException for negative values', () => {
      expect(() => service.buildRoyalties('CREATOR_WALLET', -100)).toThrow(BadRequestException);
    });
  });

  describe('storePlatformBps & getPlatformRoyaltyBps', () => {
    it('stores and retrieves platform BPS globally', () => {
      expect(service.getPlatformRoyaltyBps()).toBe(100);

      service.storePlatformBps(250);
      expect(service.getPlatformRoyaltyBps()).toBe(250);
    });

    it('stores and retrieves platform BPS per token ID', () => {
      service.storePlatformBps(300, 'clip-42');
      expect(service.getPlatformRoyaltyBps('clip-42')).toBe(300);
      expect(service.getPlatformRoyaltyBps('clip-99')).toBe(100);
    });

    it('rejects invalid platform BPS values', () => {
      expect(() => service.storePlatformBps(-1)).toThrow(BadRequestException);
      expect(() => service.storePlatformBps(10001)).toThrow(BadRequestException);
    });
  });

  describe('mintClip', () => {
    it('returns a txHash and the full transaction payload with creator and platform percentages', async () => {
      const result = await service.mintClip({
        clipId: 'clip-123',
        creatorWallet: 'CREATOR_WALLET',
        metadataUri: 'https://ipfs.io/ipfs/Qm...',
        royaltyBps: 800,
      });

      expect(result.txHash).toMatch(/^sim_tx_clip-123_/);
      expect(result.transaction.clipId).toBe('clip-123');
      expect(result.transaction.royalties).toHaveLength(2);

      const creator = result.transaction.royalties.find((r) => r.label === 'creator');
      expect(creator?.bps).toBe(800);

      const platform = result.transaction.royalties.find((r) => r.label === 'platform');
      expect(platform?.bps).toBe(100);

      // Verify platform BPS was stored for this clip
      expect(service.getPlatformRoyaltyBps('clip-123')).toBe(100);
    });

    it('updates mint transaction with multiple recipients when configured', async () => {
      const result = await service.mintClip({
        clipId: 'clip-456',
        creatorWallet: 'CREATOR_WALLET',
        metadataUri: 'https://ipfs.io/ipfs/Qm...',
        royaltyBps: 600,
        platformRoyaltyBps: 150,
        recipients: [
          { wallet: 'COLLABORATOR_WALLET', bps: 250, label: 'collaborator' },
        ],
      });

      expect(result.transaction.royalties).toHaveLength(3);
      expect(result.transaction.royalties[0]).toMatchObject({
        wallet: 'CREATOR_WALLET',
        bps: 600,
        label: 'creator',
      });
      expect(result.transaction.royalties[1]).toMatchObject({
        wallet: 'PLATFORM_WALLET_ADDR',
        bps: 150,
        label: 'platform',
      });
      expect(result.transaction.royalties[2]).toMatchObject({
        wallet: 'COLLABORATOR_WALLET',
        bps: 250,
        label: 'collaborator',
      });
      expect(service.getPlatformRoyaltyBps('clip-456')).toBe(150);
    });

    it('validates total BPS during mintClip and throws BadRequestException if exceeded', async () => {
      await expect(
        service.mintClip({
          clipId: 'clip-789',
          creatorWallet: 'CREATOR_WALLET',
          royaltyBps: 9950, // 9950 + 100 > 10000
        }),
      ).rejects.toThrow(BadRequestException);
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

    it('returns mintAddress, mintedAt, and nftStatus on successful mint', async () => {
      const result = await service.mintClip({
        clipId: 'clip-101',
        creatorWallet: 'CREATOR_WALLET',
      });

      expect(result.mintAddress).toBeDefined();
      expect(result.mintAddress).toBe(result.txHash);
      expect(result.mintedAt).toBeInstanceOf(Date);
      expect(result.nftStatus).toBe('minted');

      const status = service.getClipMintStatus('clip-101');
      expect(status).toEqual({
        mintAddress: result.txHash,
        mintedAt: result.mintedAt,
        nftStatus: 'minted',
      });
    });

    it('prevents duplicate minting with ConflictException when clip is already minted', async () => {
      await service.mintClip({
        clipId: 'clip-102',
        creatorWallet: 'CREATOR_WALLET',
      });

      await expect(
        service.mintClip({
          clipId: 'clip-102',
          creatorWallet: 'CREATOR_WALLET',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('prevents duplicate minting with ConflictException when clip is currently minting', async () => {
      // Simulate an in-progress minting status
      (service as any).clipMintStatus.set('clip-103', { nftStatus: 'minting' });

      await expect(
        service.mintClip({
          clipId: 'clip-103',
          creatorWallet: 'CREATOR_WALLET',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });
});
