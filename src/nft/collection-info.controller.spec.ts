import { Test, TestingModule } from '@nestjs/testing';
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
import { NftMintGuard } from './guards/nft-mint.guard';
import { LoginGuard } from '../auth/guards/login.guard';

describe('NftController – GET /nfts/collection (Issue #679)', () => {
  let controller: NftController;

  const mockAdminContractService = {
    getCollectionInfo: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NftController],
      providers: [
        { provide: NftService, useValue: {} },
        { provide: NftMintService, useValue: {} },
        { provide: NftMetadataService, useValue: { build: jest.fn() } },
        { provide: IpfsUploadService, useValue: {} },
        { provide: RoyaltyQueryService, useValue: { getRoyaltyInfo: jest.fn(), getRoyaltySplits: jest.fn() } },
        { provide: NftOwnershipVerificationService, useValue: { verifyNFTOwnership: jest.fn() } },
        { provide: NftOwnershipService, useValue: { tokenExists: jest.fn(), getOwner: jest.fn() } },
        { provide: PrismaService, useValue: { clip: { findUnique: jest.fn() } } },
        { provide: RoyaltyConfigurationService, useValue: { getCreatorRoyaltyBps: jest.fn(), getPlatformWallet: jest.fn() } },
        { provide: MintSignatureVerificationService, useValue: { verify: jest.fn() } },
        { provide: AdminContractService, useValue: mockAdminContractService },
        { provide: GasMetricsService, useValue: { getStats: jest.fn() } },
      ],
    })
      .overrideGuard(LoginGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(NftMintGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<NftController>(NftController);
    jest.clearAllMocks();
  });

  it('returns the collection info from AdminContractService', async () => {
    mockAdminContractService.getCollectionInfo.mockResolvedValue({
      name: 'ClipCash NFT',
      symbol: 'CLIP',
      contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEU4',
    });

    const result = await controller.getCollectionInfo();

    expect(mockAdminContractService.getCollectionInfo).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      name: 'ClipCash NFT',
      symbol: 'CLIP',
      contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEU4',
    });
  });
});
