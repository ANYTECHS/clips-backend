import {
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

const mockOperations = jest.fn();
const mockTransactionCall = jest.fn();
const mockServerInstance = {
  transactions: () => ({
    transaction: () => ({
      call: mockTransactionCall,
    }),
  }),
};

jest.mock('@stellar/stellar-sdk', () => ({
  Horizon: {
    Server: jest.fn().mockImplementation(() => mockServerInstance),
  },
}));

import { StellarPayoutVerificationService } from './stellar-payout-verification.service';

describe('StellarPayoutVerificationService', () => {
  const stellarService = {
    horizonUrl: 'https://horizon-testnet.stellar.org',
  };

  const circuitBreakerService = {
    execute: jest.fn((_cfg: unknown, fn: () => Promise<unknown>) => fn()),
  };

  let service: StellarPayoutVerificationService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockTransactionCall.mockReset();
    mockOperations.mockReset();
    service = new StellarPayoutVerificationService(
      stellarService as any,
      circuitBreakerService as any,
    );
  });

  it('throws transaction-not-found on Horizon 404', async () => {
    mockTransactionCall.mockRejectedValue({ response: { status: 404 } });

    await expect(
      service.verifyPayoutTransaction('missing-hash'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns failed when transaction is unsuccessful', async () => {
    mockTransactionCall.mockResolvedValue({
      successful: false,
      created_at: '2026-01-01T00:00:00Z',
      operations: () => ({ call: mockOperations }),
    });

    const result = await service.verifyPayoutTransaction('bad-tx');
    expect(result.outcome).toBe('failed');
    expect(result.successful).toBe(false);
  });

  it('confirms matching destination and amount', async () => {
    mockOperations.mockResolvedValue({
      records: [
        {
          type: 'payment',
          destination: 'GDEST',
          to: 'GDEST',
          amount: '25.0000000',
        },
      ],
    });
    mockTransactionCall.mockResolvedValue({
      successful: true,
      created_at: '2026-01-01T00:00:00Z',
      operations: () => ({ call: mockOperations }),
    });

    const result = await service.verifyPayoutTransaction('ok-tx', {
      expectedDestination: 'GDEST',
      expectedAmount: 25,
    });

    expect(result.outcome).toBe('confirmed');
    expect(result.destination).toBe('GDEST');
    expect(result.transferredAmount).toBe(25);
  });

  it('throws verification-conflict on amount mismatch', async () => {
    mockOperations.mockResolvedValue({
      records: [
        {
          type: 'payment',
          destination: 'GDEST',
          to: 'GDEST',
          amount: '10.0000000',
        },
      ],
    });
    mockTransactionCall.mockResolvedValue({
      successful: true,
      created_at: '2026-01-01T00:00:00Z',
      operations: () => ({ call: mockOperations }),
    });

    await expect(
      service.verifyPayoutTransaction('conflict-tx', {
        expectedDestination: 'GDEST',
        expectedAmount: 25,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
