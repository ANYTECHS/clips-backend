/**
 * #1030 — Soft-delete behaviour test suite.
 *
 * Verifies that soft-deleted records:
 *  - have `deletedAt` populated instead of being removed
 *  - are excluded from normal queries
 *  - are excluded from aggregations
 *  - are excluded from API/service level responses
 *  - can be restored
 *  - handle repeated deletion
 *
 * Uses an in-memory Prisma fake so no database is required.
 */
import { SoftDeleteService } from '../../payouts/soft-delete.service';

interface FakeRecord {
  id: number;
  userId: number;
  amount: number;
  status: string;
  deletedAt: Date | null;
}

const seedPayouts = (): FakeRecord[] => [
  { id: 1, userId: 42, amount: 100, status: 'pending', deletedAt: null },
  { id: 2, userId: 42, amount: 250, status: 'paid', deletedAt: null },
  { id: 3, userId: 42, amount: 75, status: 'rejected', deletedAt: null },
];

function matchesWhere(record: FakeRecord, where: any): boolean {
  if (!where) return true;
  if (where.id !== undefined) {
    if (typeof where.id === 'object' && where.id !== null && 'in' in where.id) {
      if (!where.id.in.includes(record.id)) return false;
    } else if (record.id !== where.id) {
      return false;
    }
  }
  if (where.userId !== undefined && record.userId !== where.userId) return false;
  if ('deletedAt' in where) {
    const expected = where.deletedAt;
    if (expected === null && record.deletedAt !== null) return false;
    if (expected && typeof expected === 'object' && 'not' in expected) {
      if (expected.not === null && record.deletedAt === null) return false;
    }
  }
  return true;
}

function fakePrisma(store: FakeRecord[]) {
  const apply = (record: FakeRecord, data: any): FakeRecord => {
    const next = { ...record, ...data };
    const idx = store.findIndex((r) => r.id === record.id);
    store[idx] = next;
    return next;
  };
  return {
    store,
    payout: {
      update: jest.fn(async ({ where, data }: any) => {
        const record = store.find((r) => matchesWhere(r, where));
        if (!record) throw new Error('Record not found');
        return apply(record, data);
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const targets = store.filter((r) => matchesWhere(r, where));
        targets.forEach((r) => apply(r, data));
        return { count: targets.length };
      }),
      findUnique: jest.fn(async ({ where }: any) =>
        store.find((r) => matchesWhere(r, where)) ?? null,
      ),
      findMany: jest.fn(async ({ where }: any) =>
        store.filter((r) => matchesWhere(r, where)),
      ),
    },
    payoutMethod: {
      update: jest.fn(async ({ where, data }: any) => {
        const record = { id: where.id, deletedAt: null } as any;
        return { ...record, ...data };
      }),
    },
  };
}

describe('Soft delete behaviour (#1030)', () => {
  let store: FakeRecord[];
  let prisma: ReturnType<typeof fakePrisma>;
  let service: SoftDeleteService;

  beforeEach(() => {
    store = seedPayouts();
    prisma = fakePrisma(store);
    service = new SoftDeleteService(prisma as any);
  });

  it('populates deletedAt on delete instead of removing the row', async () => {
    const deleted = await service.softDeletePayout(1);

    expect(deleted.deletedAt).toBeInstanceOf(Date);
    // Row still exists (soft delete, not hard delete)
    expect(store).toHaveLength(3);
    expect(store.find((r) => r.id === 1)?.deletedAt).toBeInstanceOf(Date);
    expect(prisma.payout.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { deletedAt: expect.any(Date) },
    });
  });

  it('excludes soft-deleted records from normal queries', async () => {
    await service.softDeletePayout(1);

    const active = await service.getActivePayoutsForUser(42);
    expect(active).toHaveLength(2);
    expect(active.map((p: FakeRecord) => p.id).sort()).toEqual([2, 3]);
    expect(prisma.payout.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 42, deletedAt: null },
      }),
    );
  });

  it('excludes soft-deleted records from aggregations', async () => {
    const totalBefore = store.reduce((sum, p) => sum + p.amount, 0);
    expect(totalBefore).toBe(425);

    await service.softDeletePayout(2);

    const active = await service.getActivePayoutsForUser(42);
    const totalAfter = active.reduce((sum: number, p: FakeRecord) => sum + p.amount, 0);

    expect(totalAfter).toBe(175); // 100 + 75 — deleted 250 excluded
  });

  it('only returns soft-deleted records from the audit query', async () => {
    await service.softDeletePayout(3);

    const deleted = await service.getDeletedPayoutsForUser(42);
    expect(deleted).toHaveLength(1);
    expect(deleted[0].id).toBe(3);
    expect(prisma.payout.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 42, deletedAt: { not: null } },
      }),
    );
  });

  it('restores soft-deleted records back into normal queries', async () => {
    await service.softDeletePayout(1);
    expect((await service.getActivePayoutsForUser(42))).toHaveLength(2);

    const restored = await service.restorePayout(1);
    expect(restored.deletedAt).toBeNull();

    const active = await service.getActivePayoutsForUser(42);
    expect(active).toHaveLength(3);
    expect(active.map((p: FakeRecord) => p.id).sort()).toEqual([1, 2, 3]);
  });

  it('handles repeated deletion without removing or duplicating rows', async () => {
    await service.softDeletePayout(1);
    const second = await service.softDeletePayout(1);

    expect(second.deletedAt).toBeInstanceOf(Date);
    expect(store).toHaveLength(3);
    expect((await service.getActivePayoutsForUser(42))).toHaveLength(2);

    const bulkCount = await service.softDeletePayouts([1, 2]);
    expect(bulkCount).toBe(2);
    expect(store).toHaveLength(3);
    expect((await service.getActivePayoutsForUser(42))).toHaveLength(1);
  });

  it('keeps soft-deleted records visible only through the explicit audit read', async () => {
    await service.softDeletePayout(2);

    // Normal (API-facing) read excludes it…
    const active = await service.getActivePayoutsForUser(42);
    expect(active.find((p: FakeRecord) => p.id === 2)).toBeUndefined();

    // …while the audit read still surfaces it for admin/audit use.
    const incl = await service.getPayoutIncludingDeleted(2);
    expect(incl).not.toBeNull();
    expect((incl as FakeRecord).deletedAt).toBeInstanceOf(Date);
  });

  it('soft-deletes and restores payout methods', async () => {
    const deletedMethod = await service.softDeletePayoutMethod(9);
    expect(deletedMethod.deletedAt).toBeInstanceOf(Date);

    const restoredMethod = await service.restorePayoutMethod(9);
    expect(restoredMethod.deletedAt).toBeNull();
  });
});
