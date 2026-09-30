import { NftOwnershipService } from '../src/nft/nft-ownership.service';
import { SorobanOwnerOfVerificationStrategy } from '../src/nft/strategies/nft-ownership-verification.strategy';
import { CircuitBreakerService } from '../src/common/circuit-breaker/circuit-breaker.service';
import { ConfigService } from '../src/config/config.service';
import StellarSdk from '@stellar/stellar-sdk';
import {
  mint_test_clip,
  set_test_royalty,
  simulate_test_sale,
  SorobanTestContext,
} from './helpers/soroban-test.helper';

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

describe('Reusable Soroban contract test helpers', () => {
  const seller = StellarSdk.Keypair.random().publicKey();
  const buyer = StellarSdk.Keypair.random().publicKey();
  const simulateTransaction = jest.fn().mockResolvedValue({ results: [] });
  const sourceKeypair = StellarSdk.Keypair.random();
  const context: SorobanTestContext = {
    server: { simulateTransaction } as unknown as StellarSdk.rpc.Server,
    contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEU4',
    sourceAccount: new StellarSdk.Account(sourceKeypair.publicKey(), '0'),
    networkPassphrase: StellarSdk.Networks.TESTNET,
  };

  beforeEach(() => {
    simulateTransaction.mockClear();
    simulateTransaction.mockResolvedValue({ results: [] });
  });

  it('builds a configurable mint test invocation', async () => {
    const result = await mint_test_clip(context, {
      tokenId: 81,
      owner: seller,
      metadata: 'ipfs://test-metadata-81',
      royaltyBps: 725,
    });

    expect(result.functionName).toBe('mint');
    expect(result.transaction.toXDR()).toContain('AAAA');
    expect(simulateTransaction).toHaveBeenCalledWith(result.transaction);
  });

  it('builds a configurable royalty setup invocation', async () => {
    const result = await set_test_royalty(context, {
      tokenId: 81,
      shares: [
        { recipient: seller, bps: 7250 },
        { recipient: buyer, bps: 2750 },
      ],
    });

    expect(result.functionName).toBe('set_royalties');
    expect(simulateTransaction).toHaveBeenCalledWith(result.transaction);
  });

  it('builds a configurable sale simulation invocation', async () => {
    const result = await simulate_test_sale(context, {
      tokenId: 81,
      seller,
      buyer,
      salePrice: 2_500_000_000,
      royaltyBps: 725,
    });

    expect(result.functionName).toBe('transfer_with_royalty');
    expect(simulateTransaction).toHaveBeenCalledWith(result.transaction);
  });
});
