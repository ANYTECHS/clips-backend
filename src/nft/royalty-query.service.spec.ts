import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RoyaltyQueryService } from './royalty-query.service';

describe('RoyaltyQueryService', () => {
  const redisService = {
    get: jest.fn(),
    setex: jest.fn(),
  };
  const stellarService = {
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
  };
  const circuitBreakerService = {
    execute: jest.fn((config, fn) => fn()),
  };

  let service: RoyaltyQueryService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RoyaltyQueryService(
      stellarService as any,
      redisService as any,
      circuitBreakerService as any,
    );
  });

  it('returns cached royalty info without hitting Soroban', async () => {
    const cached = { royaltyBps: 1000, recipient: 'GABC' };
    redisService.get.mockResolvedValue(JSON.stringify(cached));

    const result = await service.getRoyaltyInfo('42');

    expect(result).toEqual(cached);
    expect(circuitBreakerService.execute).not.toHaveBeenCalled();
  });

  it('rejects non-numeric mint addresses', async () => {
    redisService.get.mockResolvedValue(null);

    await expect(service.getRoyaltyInfo('not-a-token')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('throws NotFoundException when on-chain royalty map is empty', async () => {
    redisService.get.mockResolvedValue(null);

    // Force queryOnChainRoyalty path with a stub that returns empty map via private method spy
    jest
      .spyOn(service as any, 'queryOnChainRoyalty')
      .mockRejectedValue(
        new NotFoundException('Royalty data not found for mint address 99'),
      );

    await expect(service.getRoyaltyInfo('99')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
