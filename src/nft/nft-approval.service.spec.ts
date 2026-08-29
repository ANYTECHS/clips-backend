import { BadRequestException } from '@nestjs/common';
import { NftApprovalService } from './nft-approval.service';

const mockGetAccount = jest.fn();
const mockSimulateTransaction = jest.fn();
const mockToXDR = jest.fn().mockReturnValue('mock-approve-xdr');
const mockCall = jest.fn((fnName: string) => ({ fnName }));

jest.mock('@stellar/stellar-sdk', () => {
  const mockBuilder = {
    addOperation: jest.fn().mockReturnThis(),
    setTimeout: jest.fn().mockReturnThis(),
    build: jest.fn().mockReturnValue({ toXDR: mockToXDR }),
  };

  const sdkShape = {
    rpc: {
      Server: jest.fn().mockImplementation(() => ({
        getAccount: mockGetAccount,
        simulateTransaction: mockSimulateTransaction,
      })),
    },
    Contract: jest.fn().mockImplementation(() => ({ call: mockCall })),
    Account: jest.fn().mockImplementation(() => ({})),
    Address: {
      fromString: jest.fn((a: string) => ({
        toScVal: () => ({ address: a }),
      })),
    },
    TransactionBuilder: jest.fn().mockImplementation(() => mockBuilder),
    TimeoutInfinite: 0,
    nativeToScVal: jest.fn((v) => ({ v })),
    xdr: {
      ScVal: {
        fromXDR: jest.fn((xdrStr: string) => ({ __xdr: xdrStr })),
      },
    },
    scValToNative: jest.fn((scVal: { __xdr: string }) => scVal.__xdr),
  };

  return { __esModule: true, default: sdkShape, ...sdkShape };
});

const OWNER = 'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3';
const SPENDER = 'GDDESTINATIONADDRESSXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';

describe('NftApprovalService (Issue #842)', () => {
  const stellarService = {
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
    network: 'testnet' as const,
    validateAddress: jest.fn().mockReturnValue({ valid: true }),
  };
  const circuitBreakerService = {
    execute: jest.fn((_c: unknown, fn: () => unknown) => fn()),
  };

  let service: NftApprovalService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAccount.mockResolvedValue({});
    stellarService.validateAddress.mockReturnValue({ valid: true });
    circuitBreakerService.execute.mockImplementation((_c: unknown, fn: () => unknown) =>
      fn(),
    );
    service = new NftApprovalService(
      stellarService as any,
      circuitBreakerService as any,
    );
  });

  it('prepares approve() XDR for a spender', async () => {
    const result = await service.prepareApprove(42, OWNER, SPENDER);
    expect(result.tokenId).toBe(42);
    expect(result.spender).toBe(SPENDER);
    expect(result.emits).toBe('Approval');
    expect(result.xdr).toBe('mock-approve-xdr');
    expect(mockCall).toHaveBeenCalledWith(
      'approve',
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it('allows revoke by passing empty spender', async () => {
    const result = await service.prepareApprove(42, OWNER, '');
    expect(result.spender).toBe('');
  });

  it('prepares set_approval_for_all enable and disable', async () => {
    const enabled = await service.prepareSetApprovalForAll(OWNER, SPENDER, true);
    expect(enabled.approved).toBe(true);
    expect(enabled.emits).toBe('ApprovalForAll');

    const disabled = await service.prepareSetApprovalForAll(OWNER, SPENDER, false);
    expect(disabled.approved).toBe(false);
  });

  it('queries get_approved()', async () => {
    mockSimulateTransaction.mockResolvedValue({
      results: [{ xdr: SPENDER }],
    });
    const result = await service.getApproved(7);
    expect(result.tokenId).toBe(7);
    expect(result.approved).toBe(SPENDER);
    expect(mockCall).toHaveBeenCalledWith('get_approved', expect.anything());
  });

  it('queries is_approved_for_all()', async () => {
    mockSimulateTransaction.mockResolvedValue({
      results: [{ xdr: true as unknown as string }],
    });
    // scValToNative returns __xdr which we set to boolean via mock above — adjust:
    const StellarSdk = require('@stellar/stellar-sdk');
    StellarSdk.scValToNative.mockReturnValueOnce(true);

    const result = await service.isApprovedForAll(OWNER, SPENDER);
    expect(result.approved).toBe(true);
    expect(result.owner).toBe(OWNER);
  });

  it('rejects unauthorized/invalid addresses', async () => {
    stellarService.validateAddress.mockReturnValue({
      valid: false,
      message: 'invalid',
    });
    await expect(
      service.prepareApprove(1, 'BAD', SPENDER),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
