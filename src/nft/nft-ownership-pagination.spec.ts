import { Test, TestingModule } from '@nestjs/testing';
import { NftOwnershipService, NFT_OWNERSHIP_STRATEGY } from './nft-ownership.service';
import { StellarService } from '../stellar/stellar.service';
import { ConfigService } from '../config/config.service';
import { CircuitBreakerService } from '../common/circuit-breaker/circuit-breaker.service';

describe('NftOwnershipService - Paginated User Tokens (Issue #838)', () => {
  let service: NftOwnershipService;
  let mockGetUserTokens: jest.Mock;
  let mockGetWalletTokenIds: jest.Mock;

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
    mockGetUserTokens = jest.fn();
    mockGetWalletTokenIds = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NftOwnershipService,
        { provide: StellarService, useValue: mockStellarService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: CircuitBreakerService, useValue: mockCircuitBreakerService },
        {
          provide: NFT_OWNERSHIP_STRATEGY,
          useValue: {
            verifyOwnership: jest.fn(),
            getOwner: jest.fn(),
            getWalletTokenIds: mockGetWalletTokenIds,
            getUserTokens: mockGetUserTokens,
            tokenExists: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<NftOwnershipService>(NftOwnershipService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getUserTokensPaginated', () => {
    it('returns first page with default limit of 20 via get_user_tokens', async () => {
      mockGetUserTokens.mockResolvedValue({
        tokenIds: Array.from({ length: 20 }, (_, i) => i + 1),
        nextCursor: 20,
        total: 50,
      });

      const result = await service.getUserTokensPaginated('GABC...', 20, 0);

      expect(result.tokenIds).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
      expect(result.nextCursor).toBe(20);
      expect(result.total).toBe(50);
      expect(mockGetUserTokens).toHaveBeenCalledWith(
        mockConfigService.sorobanNftContractId,
        'GABC...',
        20,
        0,
      );
    });

    it('returns second page correctly', async () => {
      mockGetUserTokens.mockResolvedValue({
        tokenIds: Array.from({ length: 20 }, (_, i) => i + 21),
        nextCursor: 40,
        total: 50,
      });

      const result = await service.getUserTokensPaginated('GABC...', 20, 20);

      expect(result.tokenIds).toEqual(Array.from({ length: 20 }, (_, i) => i + 21));
      expect(result.nextCursor).toBe(40);
      expect(result.total).toBe(50);
    });

    it('returns last partial page with null nextCursor', async () => {
      mockGetUserTokens.mockResolvedValue({
        tokenIds: Array.from({ length: 10 }, (_, i) => i + 41),
        nextCursor: null,
        total: 50,
      });

      const result = await service.getUserTokensPaginated('GABC...', 20, 40);

      expect(result.tokenIds).toEqual(Array.from({ length: 10 }, (_, i) => i + 41));
      expect(result.nextCursor).toBeNull();
      expect(result.total).toBe(50);
    });

    it('returns empty when cursor exceeds total', async () => {
      mockGetUserTokens.mockResolvedValue({
        tokenIds: [],
        nextCursor: null,
        total: 3,
      });

      const result = await service.getUserTokensPaginated('GABC...', 10, 100);

      expect(result.tokenIds).toEqual([]);
      expect(result.nextCursor).toBeNull();
      expect(result.total).toBe(3);
    });

    it('clamps limit to max 100', async () => {
      mockGetUserTokens.mockResolvedValue({
        tokenIds: Array.from({ length: 50 }, (_, i) => i + 1),
        nextCursor: null,
        total: 50,
      });

      await service.getUserTokensPaginated('GABC...', 500, 0);

      expect(mockGetUserTokens).toHaveBeenCalledWith(
        expect.any(String),
        'GABC...',
        100,
        0,
      );
    });

    it('clamps negative cursor to 0', async () => {
      mockGetUserTokens.mockResolvedValue({
        tokenIds: [1, 2, 3],
        nextCursor: null,
        total: 3,
      });

      await service.getUserTokensPaginated('GABC...', 10, -5);

      expect(mockGetUserTokens).toHaveBeenCalledWith(
        expect.any(String),
        'GABC...',
        10,
        0,
      );
    });

    it('enforces minimum limit of 1', async () => {
      mockGetUserTokens.mockResolvedValue({
        tokenIds: [1],
        nextCursor: 1,
        total: 3,
      });

      await service.getUserTokensPaginated('GABC...', 0, 0);

      expect(mockGetUserTokens).toHaveBeenCalledWith(
        expect.any(String),
        'GABC...',
        1,
        0,
      );
    });

    it('paginates through entire large collection (1000 tokens)', async () => {
      const TOTAL = 1000;
      const PAGE = 100;

      mockGetUserTokens.mockImplementation(
        async (_c: string, _w: string, limit: number, cursor: number) => {
          const tokenIds = Array.from(
            { length: Math.min(limit, TOTAL - cursor) },
            (_, i) => cursor + i + 1,
          );
          const end = cursor + tokenIds.length;
          return {
            tokenIds,
            nextCursor: end < TOTAL ? end : null,
            total: TOTAL,
          };
        },
      );

      let cursor = 0;
      let pages = 0;
      const seen: number[] = [];

      while (cursor != null) {
        const page = await service.getUserTokensPaginated('GABC...', PAGE, cursor);
        seen.push(...page.tokenIds);
        pages += 1;
        if (page.nextCursor == null) break;
        cursor = page.nextCursor;
      }

      expect(pages).toBe(10);
      expect(seen.length).toBe(TOTAL);
      expect(seen[0]).toBe(1);
      expect(seen[TOTAL - 1]).toBe(TOTAL);
    });

    it('passes contractId through to get_user_tokens', async () => {
      mockGetUserTokens.mockResolvedValue({
        tokenIds: [1, 2],
        nextCursor: null,
        total: 2,
      });

      await service.getUserTokensPaginated('GABC...', 10, 0, 'CUSTOM_CONTRACT');

      expect(mockGetUserTokens).toHaveBeenCalledWith(
        'CUSTOM_CONTRACT',
        'GABC...',
        10,
        0,
      );
    });

    it('falls back to getWalletTokenIds when getUserTokens is absent', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          NftOwnershipService,
          { provide: StellarService, useValue: mockStellarService },
          { provide: ConfigService, useValue: mockConfigService },
          { provide: CircuitBreakerService, useValue: mockCircuitBreakerService },
          {
            provide: NFT_OWNERSHIP_STRATEGY,
            useValue: {
              verifyOwnership: jest.fn(),
              getOwner: jest.fn(),
              getWalletTokenIds: mockGetWalletTokenIds,
              tokenExists: jest.fn(),
            },
          },
        ],
      }).compile();

      const fallbackService = module.get<NftOwnershipService>(NftOwnershipService);
      mockGetWalletTokenIds.mockResolvedValue(
        Array.from({ length: 50 }, (_, i) => i + 1),
      );

      const result = await fallbackService.getUserTokensPaginated('GABC...', 20, 0);

      expect(result.tokenIds.length).toBe(20);
      expect(result.nextCursor).toBe(20);
      expect(result.total).toBe(50);
    });
  });
});
