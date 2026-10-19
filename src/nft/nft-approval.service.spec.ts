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
    const result = await service.prepareApprove(42, OWNER, SPENDER, 100);
    expect(result.tokenId).toBe(42);
    expect(result.spender).toBe(SPENDER);
    expect(result.liveUntilLedger).toBe(100);
    expect(result.emits).toBe('approve');
    expect(result.xdr).toBe('mock-approve-xdr');
    expect(mockCall).toHaveBeenCalledWith(
      'approve',
      expect.anything(),
      expect.anything(),
      expect.anything(),
      { v: 100 },
    );
  });

  it('revokes token approval by approving the owner address', async () => {
    const result = await service.prepareApprove(42, OWNER, '', 100);
    expect(result.spender).toBe(OWNER);
    expect(mockCall).toHaveBeenCalledWith(
      'approve',
      expect.anything(),
      expect.objectContaining({ address: OWNER }),
      expect.anything(),
      { v: 100 },
    );
  });

  it('prepares approve_for_all grants and revocations by expiry ledger', async () => {
    const enabled = await service.prepareSetApprovalForAll(OWNER, SPENDER, 100);
    expect(enabled.approved).toBe(true);
    expect(enabled.liveUntilLedger).toBe(100);
    expect(enabled.emits).toBe('approve_for_all');
    expect(mockCall).toHaveBeenCalledWith(
      'approve_for_all',
      expect.anything(),
      expect.anything(),
      { v: 100 },
    );

    const disabled = await service.prepareSetApprovalForAll(OWNER, SPENDER, 0);
    expect(disabled.approved).toBe(false);
    expect(disabled.liveUntilLedger).toBe(0);
  });

  it('prepares single-token approval revocation as an owner-sourced u32 call', async () => {
    const result = await service.prepareRevokeApproval(42, OWNER);

    expect(result).toMatchObject({
      tokenId: 42,
      owner: OWNER,
      emits: 'revoke_approval',
      xdr: 'mock-approve-xdr',
    });
    expect(mockGetAccount).toHaveBeenCalledWith(OWNER);
    expect(mockCall).toHaveBeenCalledWith('revoke_approval', { v: 42 });
  });

  it('prepares global approval revocation as an owner-sourced call', async () => {
    const result = await service.prepareRevokeAllApprovals(OWNER);

    expect(result).toMatchObject({
      owner: OWNER,
      emits: 'revoke_all_approvals',
      xdr: 'mock-approve-xdr',
    });
    expect(mockGetAccount).toHaveBeenCalledWith(OWNER);
    expect(mockCall).toHaveBeenCalledWith('revoke_all_approvals');
  });

  it('rejects token IDs outside the u32 range for revocation', async () => {
    await expect(service.prepareRevokeApproval(-1, OWNER)).rejects.toThrow(
      'tokenId must be a u32',
    );
    await expect(
      service.prepareRevokeApproval(0x1_0000_0000, OWNER),
    ).rejects.toThrow('tokenId must be a u32');
  });

  it('rejects missing or out-of-range approval expiry ledgers', async () => {
    await expect(service.prepareApprove(42, OWNER, SPENDER)).rejects.toThrow(
      'liveUntilLedger',
    );
    await expect(
      service.prepareApprove(42, OWNER, SPENDER, 0),
    ).rejects.toThrow('liveUntilLedger');
    await expect(
      service.prepareSetApprovalForAll(OWNER, SPENDER, 0x1_0000_0000),
    ).rejects.toThrow('liveUntilLedger');
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
