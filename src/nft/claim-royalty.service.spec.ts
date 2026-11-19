import { BadRequestException } from '@nestjs/common';

const mockSimulateTransaction = jest.fn();
const mockScValToNative = jest.fn();

jest.mock('@stellar/stellar-sdk', () => {
  const builder = {
    addOperation: jest.fn().mockReturnThis(),
    setTimeout: jest.fn().mockReturnThis(),
    build: jest.fn().mockReturnValue({}),
  };
  const sdk = {
    StrKey: {
      isValidEd25519PublicKey: jest.fn((address: string) => address === 'GVALID'),
    },
    rpc: {
      Server: jest.fn().mockImplementation(() => ({ simulateTransaction: mockSimulateTransaction })),
    },
    Contract: jest.fn().mockImplementation(() => ({ call: jest.fn() })),
    Address: {
      fromString: jest.fn((address: string) => ({ toScVal: () => address })),
    },
    Account: jest.fn().mockImplementation(() => ({})),
    TransactionBuilder: jest.fn().mockImplementation(() => builder),
    nativeToScVal: jest.fn((value: unknown) => value),
    xdr: { ScVal: { fromXDR: jest.fn(() => 'decoded') } },
    scValToNative: mockScValToNative,
    TimeoutInfinite: 0,
  };
  return { __esModule: true, default: sdk, ...sdk };
});

import { ClaimRoyaltyService } from './claim-royalty.service';

describe('ClaimRoyaltyService exact balances', () => {
  const originalContractId = process.env.SOROBAN_NFT_CONTRACT_ID;
  const stellarService = {
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
    network: 'testnet',
  };
  const circuitBreakerService = {
    execute: jest.fn((_config: unknown, action: () => unknown) => action()),
  };
  const royaltyConfigurationService = {
    getRoyaltyAsset: jest.fn().mockReturnValue({ code: 'native' }),
  };
  let service: ClaimRoyaltyService;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SOROBAN_NFT_CONTRACT_ID =
      'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEU4';
    mockSimulateTransaction.mockResolvedValue({
      results: [{ xdr: 'encoded-result' }],
    });
    mockScValToNative.mockReturnValue(0n);
    service = new ClaimRoyaltyService(
      stellarService as any,
      circuitBreakerService as any,
      royaltyConfigurationService as any,
    );
  });

  afterAll(() => {
    if (originalContractId === undefined) {
      delete process.env.SOROBAN_NFT_CONTRACT_ID;
    } else {
      process.env.SOROBAN_NFT_CONTRACT_ID = originalContractId;
    }
  });

  it('rejects an invalid configured royalty recipient before querying', async () => {
    await expect(service.getClaimableBalanceExact(42, 'not-a-stellar-address'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(mockSimulateTransaction).not.toHaveBeenCalled();
  });

  it('preserves a large on-chain balance as bigint', async () => {
    const amount = 900719925474099312345n;
    mockScValToNative.mockReturnValue(amount);

    await expect(service.getClaimableBalanceExact(42, 'GVALID')).resolves.toBe(
      amount,
    );
  });

  it('refuses to round a large balance for number-based callers', async () => {
    mockScValToNative.mockReturnValue(900719925474099312345n);

    await expect(service.getClaimableBalance(42, 'GVALID')).rejects.toThrow(
      'safe integer range',
    );
  });

  it('returns zero when simulation has no return value', async () => {
    mockSimulateTransaction.mockResolvedValue({ results: [] });

    await expect(service.getClaimableBalanceExact(42, 'GVALID')).resolves.toBe(
      0n,
    );
  });
});