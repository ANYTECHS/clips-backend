import { BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AdminConfigService, CONFIG_UPDATED_EVENT } from './admin-config.service';

const mockGetAccount = jest.fn();
const mockToXDR = jest.fn().mockReturnValue('mock-config-xdr');
const mockCall = jest.fn((fnName: string) => ({ fnName }));

jest.mock('@stellar/stellar-sdk', () => {
  const toXDRFn = jest.fn().mockReturnValue('mock-config-xdr');
  const mockBuilder = {
    addOperation: jest.fn().mockReturnThis(),
    setTimeout: jest.fn().mockReturnThis(),
    build: jest.fn().mockReturnValue({ toXDR: toXDRFn }),
  };

  const sdkShape = {
    rpc: {
      Server: jest.fn().mockImplementation(() => ({
        getAccount: mockGetAccount,
        simulateTransaction: jest.fn(),
      })),
    },
    Contract: jest.fn().mockImplementation(() => ({ call: mockCall })),
    Account: jest.fn(),
    TransactionBuilder: jest.fn().mockImplementation(() => mockBuilder),
    TimeoutInfinite: 0,
    nativeToScVal: jest.fn((v) => ({ v })),
  };

  return { __esModule: true, default: sdkShape, ...sdkShape };
});

describe('AdminConfigService (Issue #835)', () => {
  const stellarService = {
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
    network: 'testnet' as const,
    validateAddress: jest.fn().mockReturnValue({ valid: true }),
  };
  const circuitBreakerService = {
    execute: jest.fn((_c: unknown, fn: () => unknown) => fn()),
  };
  const eventEmitter = { emit: jest.fn() };

  let service: AdminConfigService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAccount.mockResolvedValue({ accountId: 'GADMIN' });
    stellarService.validateAddress.mockReturnValue({ valid: true });
    circuitBreakerService.execute.mockImplementation((_c: unknown, fn: () => unknown) =>
      fn(),
    );
    service = new AdminConfigService(
      stellarService as any,
      { sorobanNftContractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEU4' } as any,
      circuitBreakerService as any,
      eventEmitter as unknown as EventEmitter2,
    );
  });

  it('prepares set_platform_fee XDR and emits ConfigUpdated', async () => {
    const result = await service.prepareSetPlatformFee(
      'GADMIN6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
      200,
    );

    expect(result.action).toBe('set_platform_fee');
    expect(result.valueBps).toBe(200);
    expect(result.emits).toBe(CONFIG_UPDATED_EVENT);
    expect(result.xdr).toBe('mock-config-xdr');
    expect(mockCall).toHaveBeenCalledWith('set_platform_fee', expect.anything());
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      CONFIG_UPDATED_EVENT,
      expect.objectContaining({ key: 'platform_fee', valueBps: 200 }),
    );
  });

  it('prepares set_default_royalty XDR and emits ConfigUpdated', async () => {
    const result = await service.prepareSetDefaultRoyalty(
      'GADMIN6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
      1000,
    );

    expect(result.action).toBe('set_default_royalty');
    expect(result.valueBps).toBe(1000);
    expect(result.emits).toBe(CONFIG_UPDATED_EVENT);
    expect(mockCall).toHaveBeenCalledWith('set_default_royalty', expect.anything());
  });

  it('rejects non-owner-style invalid admin addresses', async () => {
    stellarService.validateAddress.mockReturnValue({
      valid: false,
      message: 'bad',
    });

    await expect(
      service.prepareSetPlatformFee('BAD', 100),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects BPS outside 0–10000', async () => {
    await expect(
      service.prepareSetPlatformFee(
        'GADMIN6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
        10001,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
