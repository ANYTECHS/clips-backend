import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { NftController } from './nft.controller';
import { NftOwnershipService } from './nft-ownership.service';
import { NftService } from './nft.service';
import { NftMintService } from '../clips/nft-mint.service';
import { NftMetadataService } from './nft-metadata.service';
import { IpfsUploadService } from './ipfs-upload.service';
import { RoyaltyQueryService } from './royalty-query.service';
import { NftOwnershipVerificationService } from './nft-ownership-verification.service';
import { PrismaService } from '../prisma/prisma.service';
import { RoyaltyConfigurationService } from './royalty-configuration.service';
import { MintSignatureVerificationService } from './mint-signature-verification.service';
import { AdminContractService } from './admin-contract.service';
import { GasMetricsService } from './gas-metrics.service';
import { NftTransferService } from './nft-transfer.service';
import { NftTransferHistoryService } from './nft-transfer-history.service';
import { NftMetadataRefreshService } from './nft-metadata-refresh.service';

const VALID_ADDRESS = 'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3';

async function makeController(ownershipService: Partial<NftOwnershipService>) {
  const module: TestingModule = await Test.createTestingModule({
    controllers: [NftController],
    providers: [
      { provide: NftService, useValue: {} },
      { provide: NftMintService, useValue: {} },
      { provide: NftMetadataService, useValue: {} },
      { provide: IpfsUploadService, useValue: {} },
      { provide: RoyaltyQueryService, useValue: {} },
      { provide: NftOwnershipVerificationService, useValue: {} },
      { provide: NftOwnershipService, useValue: ownershipService },
      { provide: PrismaService, useValue: {} },
      { provide: RoyaltyConfigurationService, useValue: {} },
      { provide: MintSignatureVerificationService, useValue: {} },
      { provide: AdminContractService, useValue: {} },
      { provide: GasMetricsService, useValue: {} },
      { provide: NftTransferService, useValue: { prepareTransferTx: jest.fn() } },
      { provide: NftTransferHistoryService, useValue: { getTransfers: jest.fn() } },
      { provide: NftMetadataRefreshService, useValue: { prepareRefreshWithCooldown: jest.fn() } },
    ],
  }).compile();

  return module.get<NftController>(NftController);
}

describe('NftController - Paginated User Tokens (Issue #704)', () => {
  describe('GET /nfts/wallets/:address/nfts', () => {
    it('returns first page with default limit and cursor', async () => {
      const ownershipService = {
        getUserTokensPaginated: jest.fn().mockResolvedValue({
          tokenIds: [1, 2, 3],
          nextCursor: 3,
          total: 10,
        }),
      };
      const controller = await makeController(ownershipService);

      const result = await controller.getWalletNfts(VALID_ADDRESS, {});

      expect(result.address).toBe(VALID_ADDRESS);
      expect(result.tokenIds).toEqual([1, 2, 3]);
      expect(result.nextCursor).toBe(3);
      expect(result.total).toBe(10);
      expect(result.limit).toBe(20);
      expect(result.cursor).toBe(0);
      expect(ownershipService.getUserTokensPaginated).toHaveBeenCalledWith(
        VALID_ADDRESS,
        20,
        0,
      );
    });

    it('passes custom limit and cursor', async () => {
      const ownershipService = {
        getUserTokensPaginated: jest.fn().mockResolvedValue({
          tokenIds: [10, 11],
          nextCursor: 12,
          total: 50,
        }),
      };
      const controller = await makeController(ownershipService);

      const result = await controller.getWalletNfts(VALID_ADDRESS, {
        limit: 5,
        cursor: 10,
      });

      expect(result.limit).toBe(5);
      expect(result.cursor).toBe(10);
      expect(result.tokenIds).toEqual([10, 11]);
      expect(result.nextCursor).toBe(12);
      expect(ownershipService.getUserTokensPaginated).toHaveBeenCalledWith(
        VALID_ADDRESS,
        5,
        10,
      );
    });

    it('returns null nextCursor on last page', async () => {
      const ownershipService = {
        getUserTokensPaginated: jest.fn().mockResolvedValue({
          tokenIds: [41, 42],
          nextCursor: null,
          total: 42,
        }),
      };
      const controller = await makeController(ownershipService);

      const result = await controller.getWalletNfts(VALID_ADDRESS, {
        limit: 20,
        cursor: 40,
      });

      expect(result.nextCursor).toBeNull();
      expect(result.tokenIds).toEqual([41, 42]);
    });

    it('throws BadRequestException for invalid wallet address', async () => {
      const ownershipService = {
        getUserTokensPaginated: jest.fn(),
      };
      const controller = await makeController(ownershipService);

      await expect(
        controller.getWalletNfts('INVALID', {}),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for address not starting with G', async () => {
      const ownershipService = {
        getUserTokensPaginated: jest.fn(),
      };
      const controller = await makeController(ownershipService);

      await expect(
        controller.getWalletNfts('A'.repeat(56), {}),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for address wrong length', async () => {
      const ownershipService = {
        getUserTokensPaginated: jest.fn(),
      };
      const controller = await makeController(ownershipService);

      await expect(
        controller.getWalletNfts('GABC', {}),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for limit > 100', async () => {
      const ownershipService = {
        getUserTokensPaginated: jest.fn(),
      };
      const controller = await makeController(ownershipService);

      await expect(
        controller.getWalletNfts(VALID_ADDRESS, { limit: 101 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for limit < 1', async () => {
      const ownershipService = {
        getUserTokensPaginated: jest.fn(),
      };
      const controller = await makeController(ownershipService);

      await expect(
        controller.getWalletNfts(VALID_ADDRESS, { limit: 0 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for negative cursor', async () => {
      const ownershipService = {
        getUserTokensPaginated: jest.fn(),
      };
      const controller = await makeController(ownershipService);

      await expect(
        controller.getWalletNfts(VALID_ADDRESS, { cursor: -1 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('returns empty tokenIds for wallet with no tokens', async () => {
      const ownershipService = {
        getUserTokensPaginated: jest.fn().mockResolvedValue({
          tokenIds: [],
          nextCursor: null,
          total: 0,
        }),
      };
      const controller = await makeController(ownershipService);

      const result = await controller.getWalletNfts(VALID_ADDRESS, {});

      expect(result.tokenIds).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.nextCursor).toBeNull();
    });

    it('handles large collection pagination across multiple pages', async () => {
      const ownershipService = {
        getUserTokensPaginated: jest.fn()
          .mockResolvedValueOnce({
            tokenIds: Array.from({ length: 20 }, (_, i) => i + 1),
            nextCursor: 20,
            total: 100,
          })
          .mockResolvedValueOnce({
            tokenIds: Array.from({ length: 20 }, (_, i) => i + 21),
            nextCursor: 40,
            total: 100,
          })
          .mockResolvedValueOnce({
            tokenIds: Array.from({ length: 20 }, (_, i) => i + 41),
            nextCursor: 60,
            total: 100,
          }),
      };
      const controller = await makeController(ownershipService);

      const page1 = await controller.getWalletNfts(VALID_ADDRESS, { limit: 20, cursor: 0 });
      expect(page1.tokenIds).toHaveLength(20);
      expect(page1.nextCursor).toBe(20);

      const page2 = await controller.getWalletNfts(VALID_ADDRESS, { limit: 20, cursor: 20 });
      expect(page2.tokenIds).toHaveLength(20);
      expect(page2.nextCursor).toBe(40);

      const page3 = await controller.getWalletNfts(VALID_ADDRESS, { limit: 20, cursor: 40 });
      expect(page3.tokenIds).toHaveLength(20);
      expect(page3.nextCursor).toBe(60);
    });
  });
});
