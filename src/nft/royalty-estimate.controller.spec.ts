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
import { NftMintGuard } from './guards/nft-mint.guard';
import { LoginGuard } from '../auth/guards/login.guard';

describe('NftController – GET /nfts/royalty/estimate (Issue #680)', () => {
  let controller: NftController;

  const mockRoyaltyConfigurationService = {
    getCreatorRoyaltyBps: jest.fn(),
    calculateRoyalty: jest.fn(),
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
        { provide: RoyaltyConfigurationService, useValue: mockRoyaltyConfigurationService },
        { provide: MintSignatureVerificationService, useValue: { verify: jest.fn() } },
        { provide: AdminContractService, useValue: { getPauseStatus: jest.fn(), preparePauseTx: jest.fn() } },
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

  it('uses the configured creator royalty rate when royaltyBps is omitted', () => {
    mockRoyaltyConfigurationService.getCreatorRoyaltyBps.mockReturnValue(1000);
    mockRoyaltyConfigurationService.calculateRoyalty.mockReturnValue(10_000_000);

    const result = controller.getRoyaltyEstimate({ salePrice: 100_000_000 });

    expect(mockRoyaltyConfigurationService.getCreatorRoyaltyBps).toHaveBeenCalledWith(undefined);
    expect(mockRoyaltyConfigurationService.calculateRoyalty).toHaveBeenCalledWith(100_000_000, 1000);
    expect(result).toEqual({
      salePrice: 100_000_000,
      royaltyBps: 1000,
      royaltyAmount: 10_000_000,
    });
  });

  it('uses an explicit royaltyBps override when provided', () => {
    mockRoyaltyConfigurationService.getCreatorRoyaltyBps.mockReturnValue(500);
    mockRoyaltyConfigurationService.calculateRoyalty.mockReturnValue(2_500);

    const result = controller.getRoyaltyEstimate({ salePrice: 50_000, royaltyBps: 500 });

    expect(mockRoyaltyConfigurationService.getCreatorRoyaltyBps).toHaveBeenCalledWith(500);
    expect(result).toEqual({ salePrice: 50_000, royaltyBps: 500, royaltyAmount: 2_500 });
  });

  it('propagates BadRequestException from an invalid royaltyBps', () => {
    mockRoyaltyConfigurationService.getCreatorRoyaltyBps.mockImplementation(() => {
      throw new BadRequestException('Invalid royaltyBps: 20000');
    });

    expect(() =>
      controller.getRoyaltyEstimate({ salePrice: 1000, royaltyBps: 20000 }),
    ).toThrow(BadRequestException);
  });
});
