import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { NftService } from './nft.service';
import { GasMetricsService } from './gas-metrics.service';
import { NftConfig } from './nft.config';

describe('Soroban NFT Enhancements (#672, #686, #684, #683)', () => {
  let nftService: NftService;
  let gasMetricsService: GasMetricsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NftService,
        GasMetricsService,
        {
          provide: NftConfig,
          useValue: {
            platformWallet: 'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
            creatorRoyaltyBps: 1000,
            platformRoyaltyBps: 100,
          },
        },
      ],
    }).compile();

    nftService = module.get<NftService>(NftService);
    gasMetricsService = module.get<GasMetricsService>(GasMetricsService);
  });

  describe('Issue #672: Update Royalty Recipient', () => {
    it('allows updating royalty recipient and stores new address', async () => {
      const tokenId = '42';
      const newRecipient = 'GBVP7D2V6X3L2K4J5H6G7F8E9D0C1B2A3Z4Y5X6W7V8U9T8R7Q6P5O4N';

      const res = await nftService.updateRoyaltyRecipient(tokenId, newRecipient);

      expect(res.tokenId).toBe(tokenId);
      expect(res.newRecipient).toBe(newRecipient);
      expect(res.updated).toBe(true);

      const stored = await nftService.getRoyaltyRecipient(tokenId);
      expect(stored).toBe(newRecipient);
    });

    it('rejects unauthorized update attempt when current recipient does not match', async () => {
      const tokenId = '43';
      const originalRecipient = 'GBVP7D2V6X3L2K4J5H6G7F8E9D0C1B2A3Z4Y5X6W7V8U9T8R7Q6P5O4N';
      const intruderAttempt = 'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3';

      await nftService.updateRoyaltyRecipient(tokenId, originalRecipient);

      await expect(
        nftService.updateRoyaltyRecipient(tokenId, intruderAttempt, 'WRONG_RECIPIENT'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Issue #684: Gas Usage Monitoring', () => {
    it('records benchmarks and computes average gas metrics', () => {
      gasMetricsService.recordBenchmark('mint', 1300000, 48000, 16000);
      gasMetricsService.recordBenchmark('transfer', 900000, 33000, 12000);

      const stats = gasMetricsService.getStats();

      expect(stats.averageMintGas).toBeGreaterThan(0);
      expect(stats.averageTransferGas).toBeGreaterThan(0);
      expect(stats.mintOperationsCount).toBeGreaterThanOrEqual(1);
      expect(stats.transferOperationsCount).toBeGreaterThanOrEqual(1);
      expect(stats.benchmarks.length).toBeGreaterThan(0);
    });

    it('logs gas metrics when minting a clip', async () => {
      const mintRes = await nftService.mintClip({
        clipId: '101',
        creatorWallet: 'GBVP7D2V6X3L2K4J5H6G7F8E9D0C1B2A3Z4Y5X6W7V8U9T8R7Q6P5O4N',
      });

      expect(mintRes.txHash).toBeDefined();

      const stats = gasMetricsService.getStats();
      expect(stats.mintOperationsCount).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Issue #683: Limited Metadata Update', () => {
    it('allows a one-time metadata update for an NFT owner', async () => {
      const tokenId = '201';
      const initialRes = await nftService.updateMetadata(tokenId, {
        contentUri: 'ipfs://QmFirstUpdateHash',
      });

      expect(initialRes.tokenId).toBe(tokenId);
      expect(initialRes.contentUri).toBe('ipfs://QmFirstUpdateHash');
      expect(initialRes.updated).toBe(true);

      const updatedUri = await nftService.getTokenUri(tokenId);
      expect(updatedUri).toBe('ipfs://QmFirstUpdateHash');
    });

    it('rejects a second metadata update attempt with one-time limit error', async () => {
      const tokenId = '202';

      await nftService.updateMetadata(tokenId, {
        contentUri: 'ipfs://QmFirstUpdateHash',
      });

      await expect(
        nftService.updateMetadata(tokenId, {
          contentUri: 'ipfs://QmSecondUpdateHash',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
