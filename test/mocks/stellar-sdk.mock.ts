/**
 * Reusable mock for @stellar/stellar-sdk.
 *
 * Usage in a spec file:
 *   jest.mock('@stellar/stellar-sdk', () => require('../../test/mocks/stellar-sdk.mock'));
 *
 * Or for src/ specs (rootDir = src):
 *   jest.mock('@stellar/stellar-sdk', () => require('../../../test/mocks/stellar-sdk.mock'));
 */

export const mockHorizonServer = {
  loadAccount: jest.fn().mockResolvedValue({
    balances: [{ asset_type: 'native', balance: '100.0000000' }],
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
};

export const mockStellarServer = jest.fn().mockImplementation(() => mockHorizonServer);

const StellarSdkMock = {
  __esModule: true,
  default: mockStellarServer,
  StrKey: {
    isValidEd25519PublicKey: jest.fn((addr: string) =>
      /^G[A-Z2-7]{55}$/.test(addr),
    ),
  },
  Horizon: {
    Server: jest.fn().mockImplementation(() => mockHorizonServer),
  },
  Networks: {
    TESTNET: 'Test SDF Network ; September 2015',
    PUBLIC: 'Public Global Stellar Network ; September 2015',
  },
  TransactionBuilder: jest.fn().mockImplementation(() => ({
    addOperation: jest.fn().mockReturnThis(),
    setTimeout: jest.fn().mockReturnThis(),
    build: jest.fn().mockReturnValue({
      toXDR: jest.fn().mockReturnValue('mock-xdr'),
      sign: jest.fn(),
    }),
  })),
  Operation: {
    payment: jest.fn().mockReturnValue({}),
    changeTrust: jest.fn().mockReturnValue({}),
  },
  Asset: {
    native: jest.fn().mockReturnValue({ code: 'XLM', issuer: null }),
  },
  Keypair: {
    fromSecret: jest.fn().mockReturnValue({
      publicKey: jest.fn().mockReturnValue('GMOCK_PUBLIC_KEY'),
      sign: jest.fn(),
    }),
    random: jest.fn().mockReturnValue({
      publicKey: jest.fn().mockReturnValue('GMOCK_RANDOM_KEY'),
      secret: jest.fn().mockReturnValue('SMOCK_SECRET'),
    }),
  },
};

module.exports = StellarSdkMock;
