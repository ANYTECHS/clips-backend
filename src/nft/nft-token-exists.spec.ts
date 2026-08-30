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
import { NftMintGuard } from './guards/nft-mint.guard';
import { LoginGuard } from '../auth/guards/login.guard';

describe('NftController – GET /nfts/:id/exists (Issue #688)', () => {
  let controller: NftController;
  let nftOwnershipService: jest.Mocked<NftOwnershipService>;

  const mockNftOwnershipService = {
    tokenExists: jest.fn(),
    getOwner: jest.fn(),
    getWalletTokenIds: jest.fn(),
    verifyNFTOwnership: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NftController],
      providers: [
        { provide: NftService, useValue: { mintClip: jest.fn(), batchMintClips: jest.fn(), updateRoyaltyRecipient: jest.fn(), updateMetadata: jest.fn(), updateTokenUri: jest.fn() } },
        { provide: NftMintService, useValue: { validateClipOwner: jest.fn(), uploadMetadataToIPFS: jest.fn(), prepareMintTx: jest.fn(), confirmMint: jest.fn(), prepareBurnTx: jest.fn(), prepareSetRoyaltiesTx: jest.fn() } },
        { provide: NftMetadataService, useValue: { build: jest.fn() } },
        { provide: IpfsUploadService, useValue: {} },
        { provide: RoyaltyQueryService, useValue: { getRoyaltyInfo: jest.fn(), getRoyaltySplits: jest.fn() } },
        { provide: NftOwnershipVerificationService, useValue: { verifyNFTOwnership: jest.fn() } },
        { provide: NftOwnershipService, useValue: mockNftOwnershipService },
        { provide: PrismaService, useValue: { clip: { findUnique: jest.fn() } } },
        { provide: RoyaltyConfigurationService, useValue: { getCreatorRoyaltyBps: jest.fn(), getPlatformWallet: jest.fn() } },
        { provide: MintSignatureVerificationService, useValue: { verify: jest.fn() } },
        { provide: AdminContractService, useValue: { getPauseStatus: jest.fn(), preparePauseTx: jest.fn() } },
        { provide: GasMetricsService, useValue: { getStats: jest.fn() } },
        { provide: NftTransferService, useValue: { prepareTransferTx: jest.fn() } },
        { provide: NftTransferHistoryService, useValue: { getTransfers: jest.fn() } },
        { provide: NftMetadataRefreshService, useValue: { prepareRefreshWithCooldown: jest.fn() } },
      ],
    })
      .overrideGuard(LoginGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(NftMintGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<NftController>(NftController);
    nftOwnershipService = module.get(NftOwnershipService);
  });

  describe('tokenExists', () => {
    it('returns { id, exists: true } when the token has been minted', async () => {
      mockNftOwnershipService.tokenExists.mockResolvedValue(true);

      const result = await controller.tokenExists(42);

      expect(result).toEqual({ id: 42, exists: true });
      expect(mockNftOwnershipService.tokenExists).toHaveBeenCalledWith('42');
    });

    it('returns { id, exists: false } when the token has not been minted', async () => {
      mockNftOwnershipService.tokenExists.mockResolvedValue(false);

      const result = await controller.tokenExists(99);

      expect(result).toEqual({ id: 99, exists: false });
      expect(mockNftOwnershipService.tokenExists).toHaveBeenCalledWith('99');
    });

    it('throws BadRequestException when id is 0', async () => {
      await expect(controller.tokenExists(0)).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when id is negative', async () => {
      await expect(controller.tokenExists(-1)).rejects.toThrow(BadRequestException);
    });
  });
});
