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
    scValToNative: jest.fn((scVal: { __xdr: string }) => {
      const numericValue = Number(scVal.__xdr);
      return Number.isNaN(numericValue) ? scVal.__xdr : numericValue;
    }),
    nativeToScVal: jest.fn((value: unknown) => value),
  };

  return { __esModule: true, default: sdkShape, ...sdkShape };
});

describe('AdminContractService.getCollectionInfo (Issue #679)', () => {
  let service: AdminContractService;
  const stellarService = {
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
    network: 'testnet',
    validateAddress: jest.fn().mockReturnValue({ valid: true }),
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

describe('AdminContractService.getTotalSupply', () => {
  let service: AdminContractService;
  const stellarService = {
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
    network: 'testnet',
    validateAddress: jest.fn().mockReturnValue({ valid: true }),
  };
  const circuitBreakerService = {
    execute: jest.fn((_config: unknown, fn: () => unknown) => fn()),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    circuitBreakerService.execute.mockImplementation((_config: unknown, fn: () => unknown) => fn());
    service = new AdminContractService(stellarService as any, circuitBreakerService as any);
  });

  it.each([0, 1250])('returns the contract supply value %i', async (supply) => {
    mockSimulateTransaction.mockResolvedValue({ results: [{ xdr: String(supply) }] });

    await expect(service.getTotalSupply()).resolves.toEqual({
      totalSupply: supply,
      contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEU4',
      network: 'testnet',
    });
  });

  it('maps contract communication failures to an internal server error', async () => {
    circuitBreakerService.execute.mockRejectedValue(new Error('Soroban RPC down'));

    await expect(service.getTotalSupply()).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });

  it('prepares a freeze transaction after confirming the token is not frozen', async () => {
    mockSimulateTransaction
      .mockResolvedValueOnce({ results: [{ xdr: 'clip-42' }] })
      .mockResolvedValueOnce({ results: [{ xdr: '0' }] });

    const result = await service.prepareTokenFreezeTx(42, 'GADMIN', true);

    expect(result).toMatchObject({ action: 'freeze', tokenId: '42', xdr: 'mock-xdr' });
    expect(mockSimulateTransaction).toHaveBeenCalledTimes(2);
  });

  it('rejects a duplicate freeze request with conflict', async () => {
    mockSimulateTransaction
      .mockResolvedValueOnce({ results: [{ xdr: 'clip-42' }] })
      .mockResolvedValueOnce({ results: [{ xdr: '1' }] });

    await expect(service.prepareTokenFreezeTx(42, 'GADMIN', true)).rejects.toMatchObject({
      status: 409,
    });
  });

  it('prepares an unfreeze transaction for a frozen token', async () => {
    mockSimulateTransaction
      .mockResolvedValueOnce({ results: [{ xdr: 'clip-42' }] })
      .mockResolvedValueOnce({ results: [{ xdr: '1' }] });

    const result = await service.prepareTokenFreezeTx(42, 'GADMIN', false);

    expect(result).toMatchObject({ action: 'unfreeze', tokenId: '42', xdr: 'mock-xdr' });
  });

  it('returns not found when querying the freeze status of a missing token', async () => {
    mockSimulateTransaction.mockResolvedValue({ results: [] });

    await expect(service.getFreezeStatus(42)).rejects.toMatchObject({ status: 404 });
  });
});
