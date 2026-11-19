import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { WalletsController } from './wallets.controller';
import { WalletsService } from './wallets.service';
import { WalletBalanceService } from './wallet-balance.service';
import { NftOwnershipService } from '../nft/nft-ownership.service';
import { WalletOwnershipGuard } from './guards/wallet-ownership.guard';
import { PrismaService } from '../prisma/prisma.service';

const VALID_ADDRESS = 'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3';

describe('WalletsController – GET /wallets/:address/nfts (Issue #673)', () => {
  let controller: WalletsController;
  let nftOwnershipService: jest.Mocked<NftOwnershipService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WalletsController],
      providers: [
        {
          provide: WalletsService,
          useValue: {},
        },
        {
          provide: WalletBalanceService,
          useValue: {},
        },
        {
          provide: NftOwnershipService,
          useValue: {
            getWalletTokenIds: jest.fn(),
          },
        },
        {
          provide: PrismaService,
          useValue: {},
        },
      ],
    })
      .overrideGuard(WalletOwnershipGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<WalletsController>(WalletsController);
    nftOwnershipService = module.get(NftOwnershipService);
  });

  describe('getWalletNfts', () => {
    it('returns paginated token IDs for a valid address', async () => {
      nftOwnershipService.getWalletTokenIds.mockResolvedValue([1, 2, 3, 4, 5]);

      const result = await controller.getWalletNfts(VALID_ADDRESS, {
        page: 1,
        limit: 3,
      });

      expect(result).toEqual({
        address: VALID_ADDRESS,
        tokenIds: [1, 2, 3],
        total: 5,
        page: 1,
        limit: 3,
        hasNextPage: true,
      });
    });

    it('returns correct second page', async () => {
      nftOwnershipService.getWalletTokenIds.mockResolvedValue([1, 2, 3, 4, 5]);

      const result = await controller.getWalletNfts(VALID_ADDRESS, {
        page: 2,
        limit: 3,
      });

      expect(result).toEqual({
        address: VALID_ADDRESS,
        tokenIds: [4, 5],
        total: 5,
        page: 2,
        limit: 3,
        hasNextPage: false,
      });
    });

    it('sets hasNextPage=false when on the last page', async () => {
      nftOwnershipService.getWalletTokenIds.mockResolvedValue([10, 20]);

      const result = await controller.getWalletNfts(VALID_ADDRESS, {
        page: 1,
        limit: 20,
      });

      expect(result.hasNextPage).toBe(false);
      expect(result.total).toBe(2);
    });

    it('returns empty tokenIds and total=0 for wallet with no NFTs', async () => {
      nftOwnershipService.getWalletTokenIds.mockResolvedValue([]);

      const result = await controller.getWalletNfts(VALID_ADDRESS, {});

      expect(result.tokenIds).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.hasNextPage).toBe(false);
    });

    it('throws BadRequestException for an address that is too short', async () => {
      await expect(
        controller.getWalletNfts('GSHORT', {}),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for an address that does not start with G', async () => {
      const invalidAddress = 'X' + VALID_ADDRESS.slice(1);
      await expect(
        controller.getWalletNfts(invalidAddress, {}),
      ).rejects.toThrow(BadRequestException);
    });

    it('uses default page=1 and limit=20 when query params are omitted', async () => {
      const tokens = Array.from({ length: 25 }, (_, i) => i + 1);
      nftOwnershipService.getWalletTokenIds.mockResolvedValue(tokens);

      const result = await controller.getWalletNfts(VALID_ADDRESS, {});

      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.tokenIds).toHaveLength(20);
      expect(result.hasNextPage).toBe(true);
    });
  });
});
