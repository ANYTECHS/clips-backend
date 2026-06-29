import { NftOwnershipService } from '../nft-ownership.service';
import type { NftOwnershipVerificationStrategy } from './nft-ownership-verification.strategy';

describe('NftOwnershipService with strategy', () => {
  const mockStellarService = {
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
  };

  const mockConfig = {
    sorobanNftContractId: 'CCCSorobanTestContractIdPlaceholder000000000000000000000',
  };

  const mockCircuitBreaker = {
    execute: jest.fn().mockImplementation((_config, fn) => fn()),
  };

  it('delegates verification to the configured strategy', async () => {
    const strategy: NftOwnershipVerificationStrategy = {
      verifyOwnership: jest.fn().mockResolvedValue({
        isOwner: true,
        ownerAddress: 'GABC',
      }),
    };

    const service = new NftOwnershipService(
      mockStellarService as any,
      mockConfig as any,
      mockCircuitBreaker as any,
      strategy,
    );

    const result = await service.verifyNFTOwnership('7', 'GABC');
    expect(result.isOwner).toBe(true);
    expect(strategy.verifyOwnership).toHaveBeenCalledWith(
      mockConfig.sorobanNftContractId,
      '7',
      'GABC',
    );
  });
});
