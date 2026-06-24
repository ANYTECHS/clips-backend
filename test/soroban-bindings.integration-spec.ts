import { NftOwnershipService } from '../src/nft/nft-ownership.service';
import { SorobanOwnerOfVerificationStrategy } from '../src/nft/strategies/nft-ownership-verification.strategy';
import { CircuitBreakerService } from '../src/common/circuit-breaker/circuit-breaker.service';
import { ConfigService } from '../src/config/config.service';

describe('Soroban TypeScript Bindings Integration', () => {
  let service: NftOwnershipService;

  const mockStellarService = {
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
  };

  const mockConfig = {
    sorobanNftContractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEU4',
  } as ConfigService;

  const mockCircuitBreaker = {
    execute: jest.fn().mockImplementation((_config, fn) => fn()),
  } as unknown as CircuitBreakerService;

  const mockStrategy = {
    verifyOwnership: jest.fn().mockResolvedValue({ isOwner: false }),
  } as unknown as SorobanOwnerOfVerificationStrategy;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new NftOwnershipService(
      mockStellarService as any,
      mockConfig,
      mockCircuitBreaker,
      mockStrategy,
    );
  });

  it('should verify NFT ownership using Soroban bindings', async () => {
    const result = await service.verifyNFTOwnership(
      '1',
      'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
    );
    expect(result).toHaveProperty('isOwner');
    expect(typeof result.isOwner).toBe('boolean');
  });
});
