import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ContractPauseService } from './contract-pause.service';
import { PrismaService } from '../prisma/prisma.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ADMIN = 'GADMIN1234567890ADKEYADDR';

/** Build a minimal mock Prisma client focusing on contractPauseSchedule. */
function makePrismaMock() {
  return {
    contractPauseSchedule: {
      create: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
    },
  };
}

/** Returns a fake schedule record. */
function makeRecord(overrides: Partial<{
  id: number;
  requestedBy: string;
  requestedAt: Date;
  scheduledFor: Date;
  activatedAt: Date | null;
  cancelledAt: Date | null;
  cancelledBy: string | null;
  reason: string | null;
}> = {}) {
  const requestedAt = overrides.requestedAt ?? new Date('2026-01-01T00:00:00Z');
  const scheduledFor = overrides.scheduledFor ?? new Date(requestedAt.getTime() + 24 * 60 * 60 * 1000);
  return {
    id: 1,
    requestedBy: ADMIN,
    requestedAt,
    scheduledFor,
    activatedAt: null,
    cancelledAt: null,
    cancelledBy: null,
    reason: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ContractPauseService', () => {
  let service: ContractPauseService;
  let prisma: ReturnType<typeof makePrismaMock>;

  beforeEach(async () => {
    prisma = makePrismaMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContractPauseService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<ContractPauseService>(ContractPauseService);

    // Set a valid admin address env var for every test.
    process.env.ADMIN_STELLAR_ADDRESS = ADMIN;
  });

  afterEach(() => {
    delete process.env.ADMIN_STELLAR_ADDRESS;
    jest.resetAllMocks();
  });

  // -------------------------------------------------------------------------
  // Admin guard
  // -------------------------------------------------------------------------

  describe('admin guard', () => {
    it('rejects schedulePause when adminAddress does not match ADMIN_STELLAR_ADDRESS', async () => {
      prisma.contractPauseSchedule.findFirst.mockResolvedValue(null); // no active pause
      await expect(
        service.schedulePause('GWRONG_ADDRESS'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects cancelPause when adminAddress does not match', async () => {
      await expect(service.cancelPause('GWRONG_ADDRESS')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rejects when ADMIN_STELLAR_ADDRESS is unset', async () => {
      delete process.env.ADMIN_STELLAR_ADDRESS;
      await expect(service.schedulePause(ADMIN)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // -------------------------------------------------------------------------
  // schedulePause
  // -------------------------------------------------------------------------

  describe('schedulePause', () => {
    it('creates a pause schedule with 24-hour timelock', async () => {
      // No active pause, no pending pause.
      prisma.contractPauseSchedule.findFirst
        .mockResolvedValueOnce(null) // isPaused check
        .mockResolvedValueOnce(null); // findPending check

      const before = Date.now();
      const fakeRecord = makeRecord();
      prisma.contractPauseSchedule.create.mockResolvedValue(fakeRecord);

      const status = await service.schedulePause(ADMIN, 'test reason');

      expect(prisma.contractPauseSchedule.create).toHaveBeenCalledTimes(1);
      const createCall = prisma.contractPauseSchedule.create.mock.calls[0][0];
      const { requestedAt, scheduledFor } = createCall.data as { requestedAt: Date; scheduledFor: Date };

      // scheduledFor should be ~24 h after requestedAt.
      const diff = scheduledFor.getTime() - requestedAt.getTime();
      expect(diff).toBeCloseTo(24 * 60 * 60 * 1000, -3); // within 1 s

      expect(status.isPaused).toBe(false);
      expect(status.hasPendingPause).toBe(true);
      expect(before).toBeLessThanOrEqual(requestedAt.getTime());
    });

    it('rejects if a pause is already active', async () => {
      // isPaused() returns true → there is an activated record.
      prisma.contractPauseSchedule.findFirst.mockResolvedValueOnce(
        makeRecord({ activatedAt: new Date() }),
      );

      await expect(service.schedulePause(ADMIN)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.contractPauseSchedule.create).not.toHaveBeenCalled();
    });

    it('rejects if a pending pause already exists', async () => {
      // isPaused() → no active
      prisma.contractPauseSchedule.findFirst
        .mockResolvedValueOnce(null)
        // findPending → existing pending
        .mockResolvedValueOnce(makeRecord());

      await expect(service.schedulePause(ADMIN)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.contractPauseSchedule.create).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // cancelPause
  // -------------------------------------------------------------------------

  describe('cancelPause', () => {
    it('cancels a pending pause and returns updated status', async () => {
      const pending = makeRecord();
      prisma.contractPauseSchedule.findFirst.mockResolvedValue(pending);

      const cancelled = { ...pending, cancelledAt: new Date(), cancelledBy: ADMIN };
      prisma.contractPauseSchedule.update.mockResolvedValue(cancelled);

      const status = await service.cancelPause(ADMIN);

      expect(prisma.contractPauseSchedule.update).toHaveBeenCalledWith({
        where: { id: pending.id },
        data: expect.objectContaining({ cancelledBy: ADMIN }),
      });
      expect(status.isPaused).toBe(false);
      expect(status.hasPendingPause).toBe(false);
    });

    it('throws NotFoundException when no pending pause exists', async () => {
      prisma.contractPauseSchedule.findFirst.mockResolvedValue(null);
      await expect(service.cancelPause(ADMIN)).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException if the pause is already activated', async () => {
      prisma.contractPauseSchedule.findFirst.mockResolvedValue(
        makeRecord({ activatedAt: new Date() }),
      );
      await expect(service.cancelPause(ADMIN)).rejects.toThrow(BadRequestException);
    });
  });

  // -------------------------------------------------------------------------
  // isPaused
  // -------------------------------------------------------------------------

  describe('isPaused', () => {
    it('returns false when no active pause record exists', async () => {
      prisma.contractPauseSchedule.findFirst.mockResolvedValue(null);
      expect(await service.isPaused()).toBe(false);
    });

    it('returns true when an activated, non-cancelled record exists', async () => {
      prisma.contractPauseSchedule.findFirst.mockResolvedValue(
        makeRecord({ activatedAt: new Date() }),
      );
      expect(await service.isPaused()).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // activatePendingPause (timelock enforcement)
  // -------------------------------------------------------------------------

  describe('activatePendingPause', () => {
    it('activates the pause when timelock has elapsed', async () => {
      const past = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 h ago
      const pending = makeRecord({
        requestedAt: past,
        scheduledFor: new Date(past.getTime() + 24 * 60 * 60 * 1000),
      });
      prisma.contractPauseSchedule.findFirst.mockResolvedValue(pending);
      prisma.contractPauseSchedule.update.mockResolvedValue({
        ...pending,
        activatedAt: new Date(),
      });

      const result = await service.activatePendingPause();

      expect(result).toBe(true);
      expect(prisma.contractPauseSchedule.update).toHaveBeenCalledWith({
        where: { id: pending.id },
        data: expect.objectContaining({ activatedAt: expect.any(Date) }),
      });
    });

    it('blocks activation when timelock has NOT yet elapsed', async () => {
      const future = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 h from now
      const pending = makeRecord({
        scheduledFor: future,
      });
      prisma.contractPauseSchedule.findFirst.mockResolvedValue(pending);

      const result = await service.activatePendingPause();

      expect(result).toBe(false);
      expect(prisma.contractPauseSchedule.update).not.toHaveBeenCalled();
    });

    it('returns false and does not update when no pending schedule exists', async () => {
      prisma.contractPauseSchedule.findFirst.mockResolvedValue(null);
      const result = await service.activatePendingPause();
      expect(result).toBe(false);
      expect(prisma.contractPauseSchedule.update).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // assertNotPaused
  // -------------------------------------------------------------------------

  describe('assertNotPaused', () => {
    it('does not throw when contract is not paused', async () => {
      prisma.contractPauseSchedule.findFirst.mockResolvedValue(null);
      await expect(service.assertNotPaused()).resolves.not.toThrow();
    });

    it('throws ForbiddenException when contract is paused', async () => {
      prisma.contractPauseSchedule.findFirst.mockResolvedValue(
        makeRecord({ activatedAt: new Date() }),
      );
      await expect(service.assertNotPaused()).rejects.toThrow(ForbiddenException);
    });
  });

  // -------------------------------------------------------------------------
  // deactivatePause
  // -------------------------------------------------------------------------

  describe('deactivatePause', () => {
    it('marks the active pause as cancelled', async () => {
      const active = makeRecord({ activatedAt: new Date() });
      prisma.contractPauseSchedule.findFirst.mockResolvedValue(active);
      prisma.contractPauseSchedule.update.mockResolvedValue({
        ...active,
        cancelledAt: new Date(),
      });

      await service.deactivatePause();

      expect(prisma.contractPauseSchedule.update).toHaveBeenCalledWith({
        where: { id: active.id },
        data: expect.objectContaining({ cancelledAt: expect.any(Date) }),
      });
    });

    it('is a no-op when no active pause exists', async () => {
      prisma.contractPauseSchedule.findFirst.mockResolvedValue(null);
      await expect(service.deactivatePause()).resolves.not.toThrow();
      expect(prisma.contractPauseSchedule.update).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // getPauseStatus
  // -------------------------------------------------------------------------

  describe('getPauseStatus', () => {
    it('returns isPaused=true when there is an active pause', async () => {
      const active = makeRecord({ activatedAt: new Date() });
      // First call (findFirst for active) returns the active record.
      prisma.contractPauseSchedule.findFirst.mockResolvedValueOnce(active);

      const status = await service.getPauseStatus();
      expect(status.isPaused).toBe(true);
      expect(status.hasPendingPause).toBe(false);
    });

    it('returns hasPendingPause=true when there is a pending but not active pause', async () => {
      const pending = makeRecord();
      // First call for active → null; second call for pending → record.
      prisma.contractPauseSchedule.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(pending);

      const status = await service.getPauseStatus();
      expect(status.isPaused).toBe(false);
      expect(status.hasPendingPause).toBe(true);
      expect(status.scheduledFor).toBe(pending.scheduledFor.toISOString());
    });

    it('returns isPaused=false, hasPendingPause=false when neither exists', async () => {
      prisma.contractPauseSchedule.findFirst
        .mockResolvedValueOnce(null) // no active
        .mockResolvedValueOnce(null); // no pending

      const status = await service.getPauseStatus();
      expect(status.isPaused).toBe(false);
      expect(status.hasPendingPause).toBe(false);
      expect(status.requestedAt).toBeNull();
      expect(status.scheduledFor).toBeNull();
    });
  });
});
