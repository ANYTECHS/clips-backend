import { NftOwnershipService } from './nft-ownership.service';

describe('NftOwnershipService', () => {
  const mockStellarService = {
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
  };

  const mockConfig = {
    sorobanNftContractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEU4',
  };

  const mockCircuitBreaker = {
    execute: jest.fn().mockImplementation((_config, fn) => fn()),
  };

  let service: NftOwnershipService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new NftOwnershipService(
      mockStellarService as any,
      mockConfig as any,
      mockCircuitBreaker as any,
    );
  });

  it('returns ownership result shape with isOwner boolean', async () => {
    const result = await service.verifyNFTOwnership(
      '1',
      'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
    );

    expect(result).toHaveProperty('isOwner');
    expect(result).toHaveProperty('owned');
    expect(typeof result.isOwner).toBe('boolean');
    expect(result.owned).toBe(result.isOwner);
  });
});
