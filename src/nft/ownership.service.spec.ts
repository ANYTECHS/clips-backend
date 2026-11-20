import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { OwnershipService } from './ownership.service';
import { NftOwnershipService } from './nft-ownership.service';
import { StellarService } from '../stellar/stellar.service';
import { ConfigService } from '../config/config.service';

describe('OwnershipService', () => {
  let service: OwnershipService;
  let nftOwnershipService: jest.Mocked<Partial<NftOwnershipService>>;
  let stellarService: jest.Mocked<Partial<StellarService>>;

  const VALID_WALLET = 'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3';
  const OTHER_WALLET = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN';

  beforeEach(async () => {
    nftOwnershipService = {
      verifyNFTOwnership: jest.fn(),
    };

    stellarService = {
      validateAddress: jest.fn().mockImplementation((addr: string) => {
        if (addr && addr.startsWith('G') && addr.length >= 50) {
          return { valid: true };
        }
        return { valid: false, message: 'Invalid Stellar address' };
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OwnershipService,
        {
          provide: NftOwnershipService,
          useValue: nftOwnershipService,
        },
        {
          provide: StellarService,
          useValue: stellarService,
        },
        {
          provide: ConfigService,
          useValue: {
            sorobanNftContractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEU4',
          },
        },
      ],
    }).compile();

    service = module.get<OwnershipService>(OwnershipService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('verifyOwnership', () => {
    it('returns { owner: true, message: "Wallet owns NFT" } when wallet owns the NFT', async () => {
      (nftOwnershipService.verifyNFTOwnership as jest.Mock).mockResolvedValue({
        isOwner: true,
        ownerAddress: VALID_WALLET,
      });

      const result = await service.verifyOwnership('42', VALID_WALLET);

      expect(nftOwnershipService.verifyNFTOwnership).toHaveBeenCalledWith(
        '42',
        VALID_WALLET,
        undefined,
      );
      expect(result).toEqual({
        owner: true,
        message: 'Wallet owns NFT',
      });
    });

    it('returns { owner: false, message: "Wallet does not own NFT" } when wallet does not own the NFT', async () => {
      (nftOwnershipService.verifyNFTOwnership as jest.Mock).mockResolvedValue({
        isOwner: false,
        ownerAddress: OTHER_WALLET,
      });

      const result = await service.verifyOwnership('42', VALID_WALLET);

      expect(result).toEqual({
        owner: false,
        message: 'Wallet does not own NFT',
      });
    });

    it('returns { owner: false, message: error } when on-chain query fails', async () => {
      (nftOwnershipService.verifyNFTOwnership as jest.Mock).mockResolvedValue({
        isOwner: false,
        error: 'Simulation failed: token not found',
      });

      const result = await service.verifyOwnership('42', VALID_WALLET);

      expect(result).toEqual({
        owner: false,
        message: 'Simulation failed: token not found',
      });
    });

    it('throws BadRequestException when tokenId is missing or empty', async () => {
      await expect(service.verifyOwnership('', VALID_WALLET)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when walletAddress is invalid', async () => {
      await expect(service.verifyOwnership('42', 'invalid-address')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
