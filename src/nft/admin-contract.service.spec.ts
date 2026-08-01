import { InternalServerErrorException } from '@nestjs/common';
import { AdminContractService } from './admin-contract.service';

const mockSimulateTransaction = jest.fn();

jest.mock('@stellar/stellar-sdk', () => {
  const mockTx = { toXDR: jest.fn().mockReturnValue('mock-xdr') };
  const mockBuilder = {
    addOperation: jest.fn().mockReturnThis(),
    setTimeout: jest.fn().mockReturnThis(),
    build: jest.fn().mockReturnValue(mockTx),
  };

  const sdkShape = {
    rpc: {
      Server: jest.fn().mockImplementation(() => ({
        getAccount: jest.fn().mockResolvedValue({}),
        simulateTransaction: mockSimulateTransaction,
      })),
    },
    Contract: jest.fn().mockImplementation(() => ({
      call: jest.fn((fnName: string) => ({ fnName })),
    })),
    Account: jest.fn().mockImplementation(() => ({})),
    TransactionBuilder: jest.fn().mockImplementation(() => mockBuilder),
    TimeoutInfinite: 0,
    xdr: {
      ScVal: {
        // Stash the raw xdr string so scValToNative below can look up the
        // per-call return value keyed by which contract fn produced it.
        fromXDR: jest.fn((xdrStr: string) => ({ __xdr: xdrStr })),
      },
    },
    scValToNative: jest.fn((scVal: { __xdr: string }) => scVal.__xdr),
  };

  return { __esModule: true, default: sdkShape, ...sdkShape };
});

describe('AdminContractService.getCollectionInfo (Issue #679)', () => {
  let service: AdminContractService;
  const stellarService = {
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
  };
  const circuitBreakerService = {
    execute: jest.fn((_config: unknown, fn: () => unknown) => fn()),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    circuitBreakerService.execute.mockImplementation((_config: unknown, fn: () => unknown) => fn());
    service = new AdminContractService(stellarService as any, circuitBreakerService as any);
  });

  it('returns name, symbol, and contractId from the name()/symbol() contract calls', async () => {
    mockSimulateTransaction.mockImplementation(async (tx: { toXDR: () => string }) => {
      // Both calls produce the same mock tx object shape here since the
      // TransactionBuilder mock is shared; differentiate via call order.
      const callIndex = mockSimulateTransaction.mock.calls.length;
      const value = callIndex === 1 ? 'ClipCash NFT' : 'CLIP';
      return { results: [{ xdr: value }] };
    });

    const result = await service.getCollectionInfo();

    expect(result.name).toBe('ClipCash NFT');
    expect(result.symbol).toBe('CLIP');
    expect(result.contractId).toBe(
      'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEU4',
    );
    expect(mockSimulateTransaction).toHaveBeenCalledTimes(2);
  });

  it('throws InternalServerErrorException when a contract call returns no value', async () => {
    mockSimulateTransaction.mockResolvedValue({ results: [] });

    await expect(service.getCollectionInfo()).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });

  it('throws InternalServerErrorException when the circuit breaker rejects', async () => {
    circuitBreakerService.execute.mockRejectedValue(new Error('Soroban RPC down'));

    await expect(service.getCollectionInfo()).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });
});
