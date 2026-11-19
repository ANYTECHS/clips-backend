import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  PayoutStateMachineService,
  PayoutStatus,
} from './payout-state-machine.service';
import { PrismaService } from '../prisma/prisma.service';

describe('PayoutStateMachineService', () => {
  let service: PayoutStateMachineService;
  let prisma: {
    payout: { findUnique: jest.Mock; update: jest.Mock };
  };

  const payoutRecord = (status: string, userId = 1) => ({
    id: 7,
    userId,
    status,
    amount: 100,
  });

  type UpdateArgs = { where: { id: number }; data: Record<string, unknown> };
  type FindArgs = { where: { id: number }; select: Record<string, boolean> };

  /** Typed accessor for the `data` payload passed to prisma.payout.update. */
  const lastUpdateData = (): Record<string, unknown> => {
    const calls = prisma.payout.update.mock.calls as unknown as [UpdateArgs][];
    return calls[calls.length - 1][0].data;
  };

  const firstUpdateArgs = (): UpdateArgs =>
    (prisma.payout.update.mock.calls as unknown as [UpdateArgs][])[0][0];

  beforeEach(async () => {
    prisma = {
      payout: { findUnique: jest.fn(), update: jest.fn() },
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        PayoutStateMachineService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(PayoutStateMachineService);
  });

  describe('isValidTransition', () => {
    it('allows the documented pending -> approved transition', () => {
      expect(service.isValidTransition('pending', 'approved')).toBe(true);
    });

    it('allows pending -> under_review and the legacy pending_review synonym', () => {
      expect(service.isValidTransition('pending', 'under_review')).toBe(true);
      expect(service.isValidTransition('pending', 'pending_review')).toBe(true);
    });

    it('allows the full review workflow from under_review', () => {
      expect(service.isValidTransition('under_review', 'approved')).toBe(true);
      expect(service.isValidTransition('under_review', 'rejected')).toBe(true);
    });

    it('allows the full review workflow from the legacy pending_review', () => {
      expect(service.isValidTransition('pending_review', 'approved')).toBe(
        true,
      );
      expect(service.isValidTransition('pending_review', 'rejected')).toBe(
        true,
      );
    });

    it('allows the processing workflow including retries', () => {
      expect(service.isValidTransition('approved', 'processing')).toBe(true);
      expect(service.isValidTransition('processing', 'completed')).toBe(true);
      expect(service.isValidTransition('processing', 'pending_retry')).toBe(
        true,
      );
      expect(service.isValidTransition('pending_retry', 'processing')).toBe(
        true,
      );
    });

    it('allows the terminal failure transitions', () => {
      expect(service.isValidTransition('processing', 'failed')).toBe(true);
      expect(service.isValidTransition('pending_retry', 'failed')).toBe(true);
    });

    it('rejects transitions out of terminal states', () => {
      expect(service.isValidTransition('completed', 'processing')).toBe(false);
      expect(service.isValidTransition('rejected', 'approved')).toBe(false);
      expect(service.isValidTransition('failed', 'processing')).toBe(false);
    });

    it('rejects skipping the review step', () => {
      expect(service.isValidTransition('pending', 'completed')).toBe(false);
      expect(service.isValidTransition('pending', 'processing')).toBe(false);
    });

    it('rejects a self transition', () => {
      expect(service.isValidTransition('pending', 'pending')).toBe(false);
      expect(service.isValidTransition('processing', 'processing')).toBe(false);
    });

    it('rejects transitions from an unknown state', () => {
      expect(
        service.isValidTransition('nonsense' as PayoutStatus, 'approved'),
      ).toBe(false);
    });
  });

  describe('getAllowedTransitions', () => {
    it('lists every reachable state from pending', () => {
      expect(service.getAllowedTransitions('pending').sort()).toEqual(
        ['approved', 'pending_review', 'under_review'].sort(),
      );
    });

    it('lists the review outcomes from under_review and pending_review', () => {
      expect(service.getAllowedTransitions('under_review').sort()).toEqual(
        ['approved', 'rejected'].sort(),
      );
      expect(service.getAllowedTransitions('pending_review').sort()).toEqual(
        ['approved', 'rejected'].sort(),
      );
    });

    it('lists the processing outcomes from approved', () => {
      expect(service.getAllowedTransitions('approved')).toEqual(['processing']);
    });

    it('lists completion, retry and failure from processing', () => {
      expect(service.getAllowedTransitions('processing').sort()).toEqual(
        ['completed', 'failed', 'pending_retry'].sort(),
      );
    });

    it('lists retry and failure from pending_retry', () => {
      expect(service.getAllowedTransitions('pending_retry').sort()).toEqual(
        ['failed', 'processing'].sort(),
      );
    });

    it('returns an empty list for terminal states', () => {
      expect(service.getAllowedTransitions('completed')).toEqual([]);
      expect(service.getAllowedTransitions('rejected')).toEqual([]);
      expect(service.getAllowedTransitions('failed')).toEqual([]);
    });

    it('returns an empty list for an unknown state', () => {
      expect(service.getAllowedTransitions('nonsense' as PayoutStatus)).toEqual(
        [],
      );
    });
  });

  describe('transitionPayout', () => {
    it('persists a valid transition and returns the updated row', async () => {
      prisma.payout.findUnique.mockResolvedValue(payoutRecord('pending'));
      prisma.payout.update.mockResolvedValue({ id: 7, status: 'approved' });

      await expect(service.transitionPayout(7, 1, 'approved')).resolves.toEqual(
        {
          id: 7,
          status: 'approved',
        },
      );

      expect(prisma.payout.findUnique).toHaveBeenCalledWith({
        where: { id: 7 },
        select: { id: true, userId: true, status: true, amount: true },
      });
      expect(firstUpdateArgs().where).toEqual({ id: 7 });
    });

    it('throws BadRequestException when the payout does not exist', async () => {
      prisma.payout.findUnique.mockResolvedValue(null);

      await expect(service.transitionPayout(7, 1, 'approved')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.payout.update).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the payout belongs to another user', async () => {
      prisma.payout.findUnique.mockResolvedValue(payoutRecord('pending', 99));

      await expect(service.transitionPayout(7, 1, 'approved')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws ConflictException for an invalid transition and lists the allowed states', async () => {
      prisma.payout.findUnique.mockResolvedValue(payoutRecord('completed'));

      await expect(
        service.transitionPayout(7, 1, 'processing'),
      ).rejects.toThrow(ConflictException);
      await expect(
        service.transitionPayout(7, 1, 'processing'),
      ).rejects.toThrow(
        'Cannot transition payout from completed to processing. Allowed states: ',
      );
    });

    it('stamps approvedAt automatically when approving', async () => {
      prisma.payout.findUnique.mockResolvedValue(payoutRecord('pending'));
      prisma.payout.update.mockResolvedValue({ id: 7, status: 'approved' });

      const before = Date.now();
      await service.transitionPayout(7, 1, 'approved');

      const data = lastUpdateData();
      const approvedAt = data.approvedAt as Date;
      expect(approvedAt).toBeInstanceOf(Date);
      expect(approvedAt.getTime()).toBeGreaterThanOrEqual(before);
    });

    it('respects an explicit approvedAt', async () => {
      prisma.payout.findUnique.mockResolvedValue(payoutRecord('under_review'));
      prisma.payout.update.mockResolvedValue({ id: 7, status: 'approved' });
      const approvedAt = new Date('2026-01-01T00:00:00.000Z');

      await service.transitionPayout(7, 1, 'approved', { approvedAt });

      const data = lastUpdateData();
      expect(data.approvedAt).toBe(approvedAt);
    });

    it('records the rejection reason and rejectedAt', async () => {
      prisma.payout.findUnique.mockResolvedValue(payoutRecord('under_review'));
      prisma.payout.update.mockResolvedValue({ id: 7, status: 'rejected' });

      await service.transitionPayout(7, 1, 'rejected', {
        rejectionReason: 'amount too large',
      });

      const data = lastUpdateData();
      expect(data.rejectedAt).toBeInstanceOf(Date);
      expect(data.rejectionReason).toBe('amount too large');
    });

    it('omits rejection fields when no reason is supplied', async () => {
      prisma.payout.findUnique.mockResolvedValue(payoutRecord('under_review'));
      prisma.payout.update.mockResolvedValue({ id: 7, status: 'rejected' });

      await service.transitionPayout(7, 1, 'rejected');

      const data = lastUpdateData();
      expect(data.rejectedAt).toBeUndefined();
      expect(data.rejectionReason).toBeUndefined();
    });

    it('records the failure reason when moving to failed', async () => {
      prisma.payout.findUnique.mockResolvedValue(payoutRecord('processing'));
      prisma.payout.update.mockResolvedValue({ id: 7, status: 'failed' });

      await service.transitionPayout(7, 1, 'failed', {
        failureReason: 'stellar submit error',
      });

      const data = lastUpdateData();
      expect(data.failureReason).toBe('stellar submit error');
    });

    it('ignores the failure reason for non-failed transitions', async () => {
      prisma.payout.findUnique.mockResolvedValue(payoutRecord('approved'));
      prisma.payout.update.mockResolvedValue({ id: 7, status: 'processing' });

      await service.transitionPayout(7, 1, 'processing', {
        failureReason: 'ignored',
      });

      const data = lastUpdateData();
      expect(data.failureReason).toBeUndefined();
    });

    it('persists retry bookkeeping when supplied', async () => {
      prisma.payout.findUnique.mockResolvedValue(payoutRecord('processing'));
      prisma.payout.update.mockResolvedValue({
        id: 7,
        status: 'pending_retry',
      });
      const nextRetryAt = new Date('2026-02-02T00:00:00.000Z');
      const lastAttemptAt = new Date('2026-02-01T00:00:00.000Z');

      await service.transitionPayout(7, 1, 'pending_retry', {
        nextRetryAt,
        lastAttemptAt,
        retryCount: 3,
      });

      const data = lastUpdateData();
      expect(data.nextRetryAt).toBe(nextRetryAt);
      expect(data.lastAttemptAt).toBe(lastAttemptAt);
      expect(data.retryCount).toBe(3);
    });

    it('ignores a negative retry count', async () => {
      prisma.payout.findUnique.mockResolvedValue(payoutRecord('processing'));
      prisma.payout.update.mockResolvedValue({
        id: 7,
        status: 'pending_retry',
      });

      await service.transitionPayout(7, 1, 'pending_retry', {
        retryCount: -1,
      });

      const data = lastUpdateData();
      expect(data.retryCount).toBeUndefined();
    });

    it('accepts a zero retry count', async () => {
      prisma.payout.findUnique.mockResolvedValue(payoutRecord('processing'));
      prisma.payout.update.mockResolvedValue({
        id: 7,
        status: 'pending_retry',
      });

      await service.transitionPayout(7, 1, 'pending_retry', {
        retryCount: 0,
      });

      const data = lastUpdateData();
      expect(data.retryCount).toBe(0);
    });

    it('works without any additional data', async () => {
      prisma.payout.findUnique.mockResolvedValue(payoutRecord('approved'));
      prisma.payout.update.mockResolvedValue({
        id: 7,
        status: 'processing',
      });

      await expect(
        service.transitionPayout(7, 1, 'processing'),
      ).resolves.toEqual({ id: 7, status: 'processing' });
    });
  });

  describe('getPayoutWithStatus', () => {
    it('returns the payout for the owning user', async () => {
      const payout = payoutRecord('processing');
      prisma.payout.findUnique.mockResolvedValue(payout);

      await expect(service.getPayoutWithStatus(7, 1)).resolves.toEqual(payout);

      const [[findArgs]] = prisma.payout.findUnique.mock.calls as unknown as [
        [FindArgs],
      ][];
      expect(findArgs.where).toEqual({ id: 7 });
      expect(findArgs.select).toMatchObject({
        id: true,
        userId: true,
        status: true,
        retryCount: true,
        rejectionReason: true,
        failureReason: true,
        approvedAt: true,
      });
    });

    it('throws BadRequestException when the payout is missing', async () => {
      prisma.payout.findUnique.mockResolvedValue(null);

      await expect(service.getPayoutWithStatus(7, 1)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when the payout belongs to another user', async () => {
      prisma.payout.findUnique.mockResolvedValue(payoutRecord('pending', 42));

      await expect(service.getPayoutWithStatus(7, 1)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
