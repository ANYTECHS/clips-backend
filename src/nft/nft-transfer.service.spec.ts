import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { NftService } from './nft.service';
import { NftConfig } from './nft.config';
import { PrepareTransferDto } from './dto/prepare-transfer.dto';

function makeConfig(overrides: Partial<NftConfig> = {}): NftConfig {
  return {
    creatorRoyaltyBps: 1000, // 10%
    platformRoyaltyBps: 100, // 1%
    platformWallet: 'GDPLATFORMWALLETADDRESS123456789012345678901234567890123456',
    nftMintWalletCooldownSeconds: 60,
    ...overrides,
  } as unknown as NftConfig;
}

describe('NftService - Transfer with Royalty Enforcement (#1164)', () => {
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

  describe('calculateTransferRoyalties', () => {
    it('calculates creator (10%) and platform (1%) royalty amounts and net seller proceeds', () => {
      const salePrice = 100000000n; // 10 XLM in stroops
      const creatorWallet = 'GCREATORWALLETADDRESS1234567890123456789012345678901234';

      const result = service.calculateTransferRoyalties(salePrice, creatorWallet, 1000);

      expect(result.creatorRoyaltyBps).toBe(1000);
      expect(result.creatorRoyaltyAmount).toBe('10000000'); // 10% = 1 XLM
      expect(result.platformRoyaltyBps).toBe(100);
      expect(result.platformRoyaltyAmount).toBe('1000000'); // 1% = 0.1 XLM
      expect(result.totalRoyaltyAmount).toBe('11000000'); // 1.1 XLM
      expect(result.sellerProceeds).toBe('89000000'); // 8.9 XLM
    });

    it('handles zero sale price without rounding error', () => {
      const result = service.calculateTransferRoyalties(0n, 'GCREATOR');
      expect(result.creatorRoyaltyAmount).toBe('0');
      expect(result.platformRoyaltyAmount).toBe('0');
      expect(result.totalRoyaltyAmount).toBe('0');
      expect(result.sellerProceeds).toBe('0');
    });
  });

  describe('prepareTransferWithRoyalty', () => {
    const validDto: PrepareTransferDto = {
      tokenId: '101',
      fromAddress: 'GSELLERWALLET12345678901234567890123456789012345678901234',
      toAddress: 'GBUYERWALLET12345678901234567890123456789012345678901234',
      salePrice: '50000000', // 5 XLM
    };

    it('prepares transfer transaction, deducts royalties, and emits RoyaltyPaid event', async () => {
      const result = await service.prepareTransferWithRoyalty(validDto);

      expect(result.tokenId).toBe('101');
      expect(result.from).toBe(validDto.fromAddress);
      expect(result.to).toBe(validDto.toAddress);
      expect(result.salePrice).toBe('50000000');
      expect(result.sellerProceeds).toBe('44500000'); // 50000000 - 5000000 - 500000

      // Royalty Breakdown
      expect(result.royaltyBreakdown.creatorRoyaltyAmount).toBe('5000000');
      expect(result.royaltyBreakdown.platformRoyaltyAmount).toBe('500000');
      expect(result.royaltyBreakdown.totalRoyaltyAmount).toBe('5500000');

      // RoyaltyPaid event
      expect(result.event).toBeDefined();
      expect(result.event.name).toBe('RoyaltyPaid');
      expect(result.event.data).toMatchObject({
        tokenId: '101',
        from: validDto.fromAddress,
        to: validDto.toAddress,
        creator: validDto.fromAddress,
        creatorRoyalty: '5000000',
        platformRoyalty: '500000',
        salePrice: '50000000',
      });

      // XDR payload
      expect(typeof result.xdr).toBe('string');
      expect(result.xdr.length).toBeGreaterThan(0);
    });

    it('rejects negative sale price', async () => {
      await expect(
        service.prepareTransferWithRoyalty({
          ...validDto,
          salePrice: '-100',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
