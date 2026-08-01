import { Test, TestingModule } from '@nestjs/testing';
import { NftOwnershipService } from './nft-ownership.service';
import { StellarService } from '../stellar/stellar.service';
import { ConfigService } from '../config/config.service';
import { CircuitBreakerService } from '../common/circuit-breaker/circuit-breaker.service';

describe('NftOwnershipService - Paginated User Tokens (Issue #704)', () => {
  let service: NftOwnershipService;
  let mockGetWalletTokenIds: jest.SpyInstance;

  const mockStellarService = {
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
  };

  const mockConfigService = {
    sorobanNftContractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEU4',
  };

  const mockCircuitBreakerService = {
    execute: jest.fn().mockImplementation((_config, fn) => fn()),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NftOwnershipService,
        { provide: StellarService, useValue: mockStellarService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: CircuitBreakerService, useValue: mockCircuitBreakerService },
      ],
    }).compile();

    service = module.get<NftOwnershipService>(NftOwnershipService);
    mockGetWalletTokenIds = jest.spyOn(service, 'getWalletTokenIds');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getUserTokensPaginated', () => {
    it('returns first page with default limit of 20', async () => {
      const tokens = Array.from({ length: 50 }, (_, i) => i + 1);
      mockGetWalletTokenIds.mockResolvedValue(tokens);

      const result = await service.getUserTokensPaginated('GABC...', 20, 0);

      expect(result.tokenIds).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
      expect(result.nextCursor).toBe(20);
      expect(result.total).toBe(50);
    });

    it('returns second page correctly', async () => {
      const tokens = Array.from({ length: 50 }, (_, i) => i + 1);
      mockGetWalletTokenIds.mockResolvedValue(tokens);

      const result = await service.getUserTokensPaginated('GABC...', 20, 20);

      expect(result.tokenIds).toEqual(Array.from({ length: 20 }, (_, i) => i + 21));
      expect(result.nextCursor).toBe(40);
      expect(result.total).toBe(50);
    });

    it('returns last partial page with null nextCursor', async () => {
      const tokens = Array.from({ length: 50 }, (_, i) => i + 1);
      mockGetWalletTokenIds.mockResolvedValue(tokens);

      const result = await service.getUserTokensPaginated('GABC...', 20, 40);

      expect(result.tokenIds).toEqual(Array.from({ length: 10 }, (_, i) => i + 41));
      expect(result.nextCursor).toBeNull();
      expect(result.total).toBe(50);
    });

    it('returns empty when cursor exceeds total', async () => {
      const tokens = [1, 2, 3];
      mockGetWalletTokenIds.mockResolvedValue(tokens);

      const result = await service.getUserTokensPaginated('GABC...', 10, 100);

      expect(result.tokenIds).toEqual([]);
      expect(result.nextCursor).toBeNull();
      expect(result.total).toBe(3);
    });

    it('returns all tokens when limit exceeds total', async () => {
      const tokens = [1, 2, 3];
      mockGetWalletTokenIds.mockResolvedValue(tokens);

      const result = await service.getUserTokensPaginated('GABC...', 100, 0);

      expect(result.tokenIds).toEqual([1, 2, 3]);
      expect(result.nextCursor).toBeNull();
      expect(result.total).toBe(3);
    });

    it('returns empty for wallet with no tokens', async () => {
      mockGetWalletTokenIds.mockResolvedValue([]);

      const result = await service.getUserTokensPaginated('GABC...', 20, 0);

      expect(result.tokenIds).toEqual([]);
      expect(result.nextCursor).toBeNull();
      expect(result.total).toBe(0);
    });

    it('clamps limit to max 100', async () => {
      const tokens = Array.from({ length: 50 }, (_, i) => i + 1);
      mockGetWalletTokenIds.mockResolvedValue(tokens);

      const result = await service.getUserTokensPaginated('GABC...', 500, 0);

      expect(result.tokenIds.length).toBe(50);
      expect(result.nextCursor).toBeNull();
    });

    it('clamps negative cursor to 0', async () => {
      const tokens = [1, 2, 3];
      mockGetWalletTokenIds.mockResolvedValue(tokens);

      const result = await service.getUserTokensPaginated('GABC...', 10, -5);

      expect(result.tokenIds).toEqual([1, 2, 3]);
      expect(result.total).toBe(3);
    });

    it('enforces minimum limit of 1', async () => {
      const tokens = [1, 2, 3];
      mockGetWalletTokenIds.mockResolvedValue(tokens);

      const result = await service.getUserTokensPaginated('GABC...', 0, 0);

      expect(result.tokenIds.length).toBe(1);
      expect(result.tokenIds[0]).toBe(1);
    });

    it('paginates through entire large collection', async () => {
      const tokens = Array.from({ length: 100 }, (_, i) => i + 1);
      mockGetWalletTokenIds.mockResolvedValue(tokens);

      const page1 = await service.getUserTokensPaginated('GABC...', 25, 0);
      expect(page1.tokenIds).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
      expect(page1.nextCursor).toBe(25);

      const page2 = await service.getUserTokensPaginated('GABC...', 25, 25);
      expect(page2.tokenIds).toEqual(Array.from({ length: 25 }, (_, i) => i + 26));
      expect(page2.nextCursor).toBe(50);

      const page3 = await service.getUserTokensPaginated('GABC...', 25, 50);
      expect(page3.tokenIds).toEqual(Array.from({ length: 25 }, (_, i) => i + 51));
      expect(page3.nextCursor).toBe(75);

      const page4 = await service.getUserTokensPaginated('GABC...', 25, 75);
      expect(page4.tokenIds).toEqual(Array.from({ length: 25 }, (_, i) => i + 76));
      expect(page4.nextCursor).toBeNull();
    });

    it('passes contractId through to getWalletTokenIds', async () => {
      mockGetWalletTokenIds.mockResolvedValue([1, 2]);

      await service.getUserTokensPaginated('GABC...', 10, 0, 'CUSTOM_CONTRACT');

      expect(mockGetWalletTokenIds).toHaveBeenCalledWith('GABC...', 'CUSTOM_CONTRACT');
    });
  });
});
