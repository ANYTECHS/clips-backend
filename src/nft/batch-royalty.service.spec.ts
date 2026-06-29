import { Test, TestingModule } from '@nestjs/testing';
import { BatchRoyaltyService } from './batch-royalty.service';
import { StellarService } from '../stellar/stellar.service';
import { RedisService } from '../redis/redis.service';
import { BadRequestException, InternalServerErrorException } from '@nestjs/common';

describe('BatchRoyaltyService', () => {
  let service: BatchRoyaltyService;
  let stellarService: StellarService;

  const mockStellarService = {
    networkPassphrase: 'Test SDF Network ; September 2015',
    rpcUrl: 'https://soroban-testnet.stellar.org',
    network: 'testnet',
  };

  const mockRedisService = {
    get: jest.fn().mockResolvedValue(null),
    setex: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.resetModules();
    process.env.SOROBAN_NFT_CONTRACT_ID = 'test_contract_id';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BatchRoyaltyService,
        {
          provide: StellarService,
          useValue: mockStellarService,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    service = module.get<BatchRoyaltyService>(BatchRoyaltyService);
    stellarService = module.get<StellarService>(StellarService);
  });

  afterEach(() => {
    delete process.env.SOROBAN_NFT_CONTRACT_ID;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getBatchRoyaltyInfo', () => {
    it('should return empty array for empty input', async () => {
      const result = await service.getBatchRoyaltyInfo([]);
      expect(result).toEqual([]);
    });

    it('should throw BadRequestException for non-array input', async () => {
      await expect(
        service.getBatchRoyaltyInfo(null as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for batch size exceeding limit', async () => {
      const largeArray = Array.from({ length: 101 }, (_, i) => i + 1);
      await expect(
        service.getBatchRoyaltyInfo(largeArray),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('clearCache', () => {
    it('should clear cache for given token IDs', async () => {
      await expect(service.clearCache([1, 2, 3])).resolves.not.toThrow();
      expect(mockRedisService.del).toHaveBeenCalled();
    });
  });

  describe('module initialization', () => {
    it('should throw InternalServerErrorException when SOROBAN_NFT_CONTRACT_ID is not set', async () => {
      delete process.env.SOROBAN_NFT_CONTRACT_ID;

      const module = Test.createTestingModule({
        providers: [
          BatchRoyaltyService,
          {
            provide: StellarService,
            useValue: mockStellarService,
          },
          {
            provide: RedisService,
            useValue: mockRedisService,
          },
        ],
      });

      await expect(module.compile()).rejects.toThrow(InternalServerErrorException);
    });
  });
});
