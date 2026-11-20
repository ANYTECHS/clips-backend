import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TransactionConfirmationService } from './transaction-confirmation.service';
import { TransactionStatus } from './dto/transaction-status.dto';

const HASH =
  'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456';

describe('TransactionConfirmationService (Issue #846)', () => {
  let service: TransactionConfirmationService;
  let prisma: {
    trackedTransaction: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      upsert: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };
  let stellar: { getTransactionStatus: jest.Mock };

  beforeEach(() => {
    prisma = {
      trackedTransaction: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    stellar = {
      getTransactionStatus: jest.fn(),
    };
    service = new TransactionConfirmationService(prisma as any, stellar as any);
  });

  it('tracks a hash as pending then confirms on poll', async () => {
    const pendingRow = {
      hash: HASH,
      status: TransactionStatus.PENDING,
      label: 'mint',
      submittedAt: new Date('2026-08-29T09:00:00.000Z'),
      confirmedAt: null,
      failureReason: null,
      lastCheckedAt: new Date('2026-08-29T09:00:00.000Z'),
    };

    prisma.trackedTransaction.findUnique.mockResolvedValue(null);
    prisma.trackedTransaction.upsert.mockResolvedValue(pendingRow);
    stellar.getTransactionStatus.mockResolvedValue({
      found: true,
      successful: true,
      confirmedAt: new Date('2026-08-29T09:00:12.000Z'),
    });
    prisma.trackedTransaction.update.mockResolvedValue({
      ...pendingRow,
      status: TransactionStatus.CONFIRMED,
      confirmedAt: new Date('2026-08-29T09:00:12.000Z'),
      lastCheckedAt: new Date('2026-08-29T09:00:12.000Z'),
    });

    const result = await service.track(HASH, 'mint', 1);
    expect(result.status).toBe(TransactionStatus.CONFIRMED);
    expect(result.hash).toBe(HASH);
  });

  it('marks failed when Horizon reports unsuccessful', async () => {
    const pendingRow = {
      hash: HASH,
      status: TransactionStatus.PENDING,
      label: 'approve',
      submittedAt: new Date(),
      confirmedAt: null,
      failureReason: null,
      lastCheckedAt: new Date(),
    };
    prisma.trackedTransaction.findUnique.mockResolvedValue(pendingRow);
    stellar.getTransactionStatus.mockResolvedValue({
      found: true,
      successful: false,
      confirmedAt: new Date(),
    });
    prisma.trackedTransaction.update.mockImplementation(async ({ data }) => ({
      ...pendingRow,
      ...data,
    }));

    const result = await service.getStatus(HASH);
    expect(result.status).toBe(TransactionStatus.FAILED);
    expect(result.failureReason).toBeTruthy();
  });

  it('throws NotFound when hash is unknown offline and not on Horizon', async () => {
    prisma.trackedTransaction.findUnique.mockResolvedValue(null);
    stellar.getTransactionStatus.mockResolvedValue({ found: false });

    await expect(service.getStatus(HASH)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects invalid hash format', async () => {
    await expect(service.track('not-a-hash')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
