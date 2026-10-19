/**
 * Reusable mock for @stellar/stellar-sdk.
 *
 * Covers:
 *  - SorobanRPC / rpc.Server (Soroban contract interactions)
 *  - Horizon.Server (account loading, balance lookup, tx submission)
 *  - TransactionBuilder, Account, TimeoutInfinite
 *  - Contract (Soroban contract call builder)
 *  - Address, nativeToScVal, scValToNative
 *  - xdr.ScVal helpers
 *  - StrKey (address validation / encoding)
 *  - Networks passphrases
 *  - Operation (payment, changeTrust)
 *  - Asset (native, custom)
 *  - Keypair (fromSecret, random, fromPublicKey)
 *
 * Usage in a spec file (from test/ directory):
 *   jest.mock('@stellar/stellar-sdk', () => require('./mocks/stellar-sdk.mock'));
 *
 * Usage from src/ specs (rootDir = src):
 *   jest.mock('@stellar/stellar-sdk', () => require('../test/mocks/stellar-sdk.mock'));
 *
 * Resetting mocks between tests:
 *   beforeEach(() => jest.clearAllMocks());
 *
 * Controlling return values:
 *   import { mockRpcServer } from '../test/mocks/stellar-sdk.mock';
 *   mockRpcServer.simulateTransaction.mockResolvedValue({ ... });
 */

// ── Shared mock transaction objects ──────────────────────────────────────────

export const mockTransaction = {
  toXDR: jest.fn().mockReturnValue('mock-unsigned-xdr-base64=='),
  sign: jest.fn(),
  toEnvelope: jest.fn().mockReturnValue({ toXDR: jest.fn().mockReturnValue(Buffer.from('mock-xdr')) }),
  hash: jest.fn().mockReturnValue(Buffer.from('mock-tx-hash')),
};

export const mockTransactionBuilder = {
  addOperation: jest.fn().mockReturnThis(),
  setTimeout: jest.fn().mockReturnThis(),
  setNetworkPassphrase: jest.fn().mockReturnThis(),
  build: jest.fn().mockReturnValue(mockTransaction),
  setSorobanData: jest.fn().mockReturnThis(),
};

// ── Soroban RPC Server mock ───────────────────────────────────────────────────

export const mockRpcServer = {
  getAccount: jest.fn().mockResolvedValue({
    id: 'GMOCK_ACCOUNT_ID',
    sequence: '1000',
    balances: [{ asset_type: 'native', balance: '100.0000000' }],
  }),
  simulateTransaction: jest.fn().mockResolvedValue({
    results: [{ auth: [], xdr: 'mock-result-xdr' }],
    cost: { cpuInsns: '100', memBytes: '100' },
    latestLedger: 1000,
    transactionData: 'mock-soroban-data',
    events: [],
    minResourceFee: '100',
  }),
  sendTransaction: jest.fn().mockResolvedValue({
    status: 'PENDING',
    hash: 'mock-tx-hash-soroban',
    latestLedger: 1001,
    latestLedgerCloseTime: '1700000000',
  }),
  getTransaction: jest.fn().mockResolvedValue({
    status: 'SUCCESS',
    latestLedger: 1002,
    latestLedgerCloseTime: '1700000001',
    applicationOrder: 1,
    feeBump: false,
    envelopeXdr: 'mock-envelope-xdr',
    resultXdr: 'mock-result-xdr',
    resultMetaXdr: 'mock-result-meta-xdr',
  }),
  getHealth: jest.fn().mockResolvedValue({ status: 'healthy' }),
  getLedgerEntries: jest.fn().mockResolvedValue({ entries: [], latestLedger: 1000 }),
  getLatestLedger: jest.fn().mockResolvedValue({ id: 'mock-ledger-id', sequence: 1000, protocolVersion: 20 }),
  getEvents: jest.fn().mockResolvedValue({ events: [], latestLedger: 1000 }),
  prepareTransaction: jest.fn().mockImplementation((tx) => Promise.resolve(tx)),
};

// ── Horizon Server mock ───────────────────────────────────────────────────────

export const mockHorizonServer = {
  loadAccount: jest.fn().mockResolvedValue({
    id: 'GMOCK_ACCOUNT_ID',
    sequence: '1000',
    balances: [
      { asset_type: 'native', balance: '100.0000000' },
    ],
    accountId: jest.fn().mockReturnValue('GMOCK_ACCOUNT_ID'),
    incrementSequenceNumber: jest.fn(),
    sequenceNumber: jest.fn().mockReturnValue('1000'),
  }),
  submitTransaction: jest.fn().mockResolvedValue({
    hash: 'mock-horizon-tx-hash',
    ledger: 1000,
    envelope_xdr: 'mock-envelope-xdr',
    result_xdr: 'mock-result-xdr',
    result_meta_xdr: 'mock-result-meta-xdr',
  }),
  transactions: jest.fn().mockReturnValue({
    forAccount: jest.fn().mockReturnThis(),
    transaction: jest.fn().mockReturnThis(),
    call: jest.fn().mockResolvedValue({
      records: [],
      memo: '',
      hash: 'tx_hash',
      operations: jest.fn().mockReturnValue({
        call: jest.fn().mockResolvedValue({ records: [] }),
      }),
    }),
    stream: jest.fn().mockReturnValue(jest.fn()),
  }),
  operations: jest.fn().mockReturnValue({
    forAccount: jest.fn().mockReturnThis(),
    call: jest.fn().mockResolvedValue({ records: [] }),
  }),
  payments: jest.fn().mockReturnValue({
    forAccount: jest.fn().mockReturnThis(),
    call: jest.fn().mockResolvedValue({ records: [] }),
    stream: jest.fn().mockReturnValue(jest.fn()),
  }),
  feeStats: jest.fn().mockResolvedValue({
    last_ledger: '1000',
    last_ledger_base_fee: '100',
    ledger_capacity_usage: '0.1',
    fee_charged: { max: '100', min: '100', mode: '100', p10: '100', p20: '100', p30: '100', p40: '100', p50: '100', p60: '100', p70: '100', p80: '100', p90: '100', p95: '100', p99: '100' },
    max_fee: { max: '100', min: '100', mode: '100', p10: '100', p20: '100', p30: '100', p40: '100', p50: '100', p60: '100', p70: '100', p80: '100', p90: '100', p95: '100', p99: '100' },
  }),
};

// ── Contract mock (Soroban) ───────────────────────────────────────────────────

export const mockContract = {
  call: jest.fn().mockReturnValue({ type: 0 }),
  contractId: jest.fn().mockReturnValue('CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEU4'),
  address: jest.fn().mockReturnValue({ toScVal: jest.fn().mockReturnValue({ type: 0 }) }),
};

// ── ScVal / XDR mocks ─────────────────────────────────────────────────────────

export const mockScVal = {
  type: 0,
  u32: jest.fn().mockReturnValue(0),
  i32: jest.fn().mockReturnValue(0),
  u64: jest.fn().mockReturnValue(BigInt(0)),
  i64: jest.fn().mockReturnValue(BigInt(0)),
  u128: jest.fn().mockReturnValue(BigInt(0)),
  i128: jest.fn().mockReturnValue(BigInt(0)),
  bool: jest.fn().mockReturnValue(true),
  str: jest.fn().mockReturnValue(''),
  sym: jest.fn().mockReturnValue(''),
  bytes: jest.fn().mockReturnValue(Buffer.from([])),
  address: jest.fn().mockReturnValue('GMOCK'),
  vec: jest.fn().mockReturnValue([]),
  map: jest.fn().mockReturnValue([]),
};

// ── Address mock ──────────────────────────────────────────────────────────────

export const mockAddress = {
  fromString: jest.fn().mockReturnValue({
    toScVal: jest.fn().mockReturnValue(mockScVal),
    toString: jest.fn().mockReturnValue('GMOCK_ADDRESS'),
  }),
  contract: jest.fn().mockReturnValue({
    toScVal: jest.fn().mockReturnValue(mockScVal),
    toString: jest.fn().mockReturnValue('CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEU4'),
  }),
};

// ── Keypair mock ──────────────────────────────────────────────────────────────

export const mockKeypair = {
  publicKey: jest.fn().mockReturnValue('GMOCK_PUBLIC_KEY_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'),
  secret: jest.fn().mockReturnValue('SMOCK_SECRET_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'),
  sign: jest.fn().mockReturnValue(Buffer.from('mock-signature')),
  verify: jest.fn().mockReturnValue(true),
  canSign: jest.fn().mockReturnValue(true),
  rawPublicKey: jest.fn().mockReturnValue(Buffer.from('mock-raw-key')),
};

// ── Helper factories ──────────────────────────────────────────────────────────

/**
 * Create a mock Stellar/Horizon error object.
 * @param status HTTP status code (e.g. 400, 404)
 * @param message Human-readable error message
 */
export function createMockHorizonError(status: number, message: string): Error & { status: number; response: { status: number; data: unknown } } {
  const err = new Error(message) as Error & { status: number; response: { status: number; data: unknown } };
  err.status = status;
  err.response = { status, data: { type: 'https://stellar.org/horizon-errors/transaction_failed', title: message, status, extras: { result_codes: { transaction: 'tx_failed', operations: [] } } } };
  return err;
}

/**
 * Create a mock Soroban RPC error.
 */
export function createMockStellarError(code: number, message: string): Error & { code: number } {
  const err = new Error(message) as Error & { code: number };
  err.code = code;
  return err;
}

/**
 * Create a mock successful Soroban simulation result.
 */
export function createMockSimulateSuccess(resultXdr = 'mock-result-xdr') {
  return {
    results: [{ auth: [], xdr: resultXdr }],
    cost: { cpuInsns: '1000', memBytes: '500' },
    latestLedger: 1000,
    transactionData: 'mock-soroban-data',
    events: [],
    minResourceFee: '100',
  };
}

/**
 * Create a mock failed Soroban simulation result.
 */
export function createMockSimulateFailure(error = 'Contract execution failed') {
  return {
    error,
    latestLedger: 1000,
    events: [],
  };
}

/**
 * Create a mock Horizon account with custom balances.
 */
export function createMockAccount(publicKey = 'GMOCK_ACCOUNT', xlmBalance = '100.0000000') {
  return {
    id: publicKey,
    sequence: '1000',
    balances: [{ asset_type: 'native', balance: xlmBalance }],
    accountId: jest.fn().mockReturnValue(publicKey),
    incrementSequenceNumber: jest.fn(),
    sequenceNumber: jest.fn().mockReturnValue('1000'),
  };
}

// ── Main mock object (default export shape) ───────────────────────────────────

const StellarSdkMock = {
  __esModule: true,

  // Soroban RPC
  rpc: {
    Server: jest.fn().mockImplementation(() => mockRpcServer),
    Api: {
      GetTransactionStatus: {
        SUCCESS: 'SUCCESS',
        FAILED: 'FAILED',
        NOT_FOUND: 'NOT_FOUND',
      },
    },
    assembleTransaction: jest.fn().mockImplementation((tx) => ({
      ...tx,
      ...mockTransactionBuilder,
      build: jest.fn().mockReturnValue(mockTransaction),
    })),
  },

  // Horizon
  Horizon: {
    Server: jest.fn().mockImplementation(() => mockHorizonServer),
  },

  // Contract
  Contract: jest.fn().mockImplementation(() => mockContract),

  // Transaction building
  TransactionBuilder: jest.fn().mockImplementation(() => mockTransactionBuilder),
  Account: jest.fn().mockImplementation((id: string, seq: string) => ({
    id,
    sequence: seq ?? '1000',
    accountId: jest.fn().mockReturnValue(id),
    incrementSequenceNumber: jest.fn(),
    sequenceNumber: jest.fn().mockReturnValue(seq ?? '1000'),
  })),
  TimeoutInfinite: 0,

  // Address / ScVal
  Address: mockAddress,
  nativeToScVal: jest.fn().mockReturnValue(mockScVal),
  scValToNative: jest.fn().mockReturnValue('mock-native-value'),

  // XDR
  xdr: {
    ScVal: {
      fromXDR: jest.fn().mockReturnValue(mockScVal),
      scvVoid: jest.fn().mockReturnValue(mockScVal),
      scvBool: jest.fn().mockReturnValue(mockScVal),
      scvU32: jest.fn().mockReturnValue(mockScVal),
      scvI32: jest.fn().mockReturnValue(mockScVal),
      scvU64: jest.fn().mockReturnValue(mockScVal),
      scvI64: jest.fn().mockReturnValue(mockScVal),
      scvU128: jest.fn().mockReturnValue(mockScVal),
      scvI128: jest.fn().mockReturnValue(mockScVal),
      scvBytes: jest.fn().mockReturnValue(mockScVal),
      scvString: jest.fn().mockReturnValue(mockScVal),
      scvSymbol: jest.fn().mockReturnValue(mockScVal),
      scvAddress: jest.fn().mockReturnValue(mockScVal),
      scvVec: jest.fn().mockReturnValue(mockScVal),
      scvMap: jest.fn().mockReturnValue(mockScVal),
    },
    SorobanTransactionData: {
      fromXDR: jest.fn().mockReturnValue({}),
    },
    OperationBody: { invokeHostFunction: jest.fn() },
    HostFunction: { invokeContract: jest.fn() },
    InvokeContractArgs: jest.fn().mockImplementation(() => ({})),
    ScAddress: {
      scAddressTypeContract: jest.fn(),
      scAddressTypeAccount: jest.fn(),
    },
  },

  // StrKey
  StrKey: {
    isValidEd25519PublicKey: jest.fn((addr: string) => /^G[A-Z2-7]{55}$/.test(addr)),
    isValidEd25519SecretSeed: jest.fn((seed: string) => /^S[A-Z2-7]{55}$/.test(seed)),
    encodeEd25519PublicKey: jest.fn().mockReturnValue('GMOCK_ENCODED_KEY'),
    decodeEd25519PublicKey: jest.fn().mockReturnValue(Buffer.from('mock-decoded-key')),
    isValidContract: jest.fn((addr: string) => /^C[A-Z2-7]{55}$/.test(addr)),
    encodeContract: jest.fn().mockReturnValue('CMOCK_CONTRACT_ADDRESS_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'),
  },

  // Networks
  Networks: {
    TESTNET: 'Test SDF Network ; September 2015',
    PUBLIC: 'Public Global Stellar Network ; September 2015',
    FUTURENET: 'Test SDF Future Network ; October 2022',
  },

  // Operation
  Operation: {
    payment: jest.fn().mockReturnValue({ type: 'payment' }),
    changeTrust: jest.fn().mockReturnValue({ type: 'changeTrust' }),
    createAccount: jest.fn().mockReturnValue({ type: 'createAccount' }),
    invokeContractFunction: jest.fn().mockReturnValue({ type: 'invokeHostFunction' }),
    invokeHostFunction: jest.fn().mockReturnValue({ type: 'invokeHostFunction' }),
  },

  // Asset
  Asset: jest.fn().mockImplementation((code: string, issuer?: string) => ({ code, issuer: issuer ?? null })) as jest.MockedFunction<(...args: any[]) => any> & {
    native: jest.MockedFunction<() => { code: string; issuer: null }>;
  },

  // Keypair
  Keypair: {
    fromSecret: jest.fn().mockReturnValue(mockKeypair),
    random: jest.fn().mockReturnValue(mockKeypair),
    fromPublicKey: jest.fn().mockReturnValue({ ...mockKeypair, canSign: jest.fn().mockReturnValue(false) }),
    fromRawEd25519Seed: jest.fn().mockReturnValue(mockKeypair),
  },

  // Muxed accounts
  MuxedAccount: jest.fn().mockImplementation(() => ({
    accountId: jest.fn().mockReturnValue('MMOCK_MUXED_ACCOUNT'),
  })),

  // Misc
  BASE_FEE: '100',
  Memo: {
    none: jest.fn().mockReturnValue({ type: 'none' }),
    text: jest.fn().mockReturnValue({ type: 'text', value: '' }),
    hash: jest.fn().mockReturnValue({ type: 'hash', value: '' }),
    id: jest.fn().mockReturnValue({ type: 'id', value: '0' }),
  },
};

// Asset.native needs to be a static method on the mock
(StellarSdkMock.Asset as any).native = jest.fn().mockReturnValue({ code: 'XLM', issuer: null });

module.exports = StellarSdkMock;
