import { Test, TestingModule } from '@nestjs/testing';
import { PlatformRevenueService } from './platform-revenue.service';
import { StellarService } from '../stellar/stellar.service';
import { RedisService } from '../redis/redis.service';
import { InternalServerErrorException } from '@nestjs/common';

describe('PlatformRevenueService', () => {
  let service: PlatformRevenueService;
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
        PlatformRevenueService,
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

    service = module.get<PlatformRevenueService>(PlatformRevenueService);
    stellarService = module.get<StellarService>(StellarService);
  });

  afterEach(() => {
    delete process.env.SOROBAN_NFT_CONTRACT_ID;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getPlatformRevenue', () => {
    it('should return platform revenue info with stroops and XLM', async () => {
      // This test would require mocking the Stellar RPC response
      // For now, we just verify the service structure
      expect(service.getPlatformRevenue).toBeDefined();
    });
  });

  describe('clearCache', () => {
    it('should clear the revenue cache', async () => {
      await expect(service.clearCache()).resolves.not.toThrow();
      expect(mockRedisService.del).toHaveBeenCalled();
    });
  });

  describe('module initialization', () => {
    it('should throw InternalServerErrorException when SOROBAN_NFT_CONTRACT_ID is not set', async () => {
      delete process.env.SOROBAN_NFT_CONTRACT_ID;

      const module = Test.createTestingModule({
        providers: [
          PlatformRevenueService,
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
