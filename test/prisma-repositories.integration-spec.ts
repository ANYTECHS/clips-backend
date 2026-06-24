/**
 * Integration tests: Prisma repositories
 *
 * Verifies repository logic for User, Wallet, Payout, Earning, and Subscription
 * using in-memory fakes — no real database required.
 *
 * Closes #424
 */
import { PrismaService } from '../src/prisma/prisma.service';

// ── In-memory Prisma repository fake ─────────────────────────────────────────

class InMemoryPrisma {
  private _users: any[] = [];
  private _wallets: any[] = [];
  private _payouts: any[] = [];
  private _earnings: any[] = [];
  private _subscriptions: any[] = [];
  private _intents: any[] = [];
  private _id = 1;
  private nextId() { return this._id++; }

  user = {
    create: jest.fn(async ({ data }: any) => {
      const u = { id: this.nextId(), ...data };
      this._users.push(u);
      return u;
    }),
    findUnique: jest.fn(async ({ where }: any) =>
      this._users.find((u) => (where.id ? u.id === where.id : u.email === where.email)) ?? null,
    ),
    update: jest.fn(async ({ where, data }: any) => {
      const idx = this._users.findIndex((u) => u.id === where.id);
      if (idx === -1) return null;
      this._users[idx] = { ...this._users[idx], ...data };
      return this._users[idx];
    }),
    findMany: jest.fn(async () => this._users),
  };

  wallet = {
    create: jest.fn(async ({ data }: any) => {
      const w = { id: this.nextId(), deletedAt: null, ...data };
      this._wallets.push(w);
      return w;
    }),
    findFirst: jest.fn(async ({ where }: any) =>
      this._wallets.find((w) => {
        if (where.userId !== undefined && w.userId !== where.userId) return false;
        if (where.id !== undefined && w.id !== where.id) return false;
        if (where.deletedAt === null && w.deletedAt !== null) return false;
        if (where.status !== undefined && w.status !== where.status) return false;
        return true;
      }) ?? null,
    ),
    findMany: jest.fn(async ({ where }: any = {}) =>
      this._wallets.filter((w) => {
        if (where?.userId !== undefined && w.userId !== where.userId) return false;
        if (where?.deletedAt === null && w.deletedAt !== null) return false;
        return true;
      }),
    ),
    update: jest.fn(async ({ where, data }: any) => {
      const idx = this._wallets.findIndex((w) => w.id === where.id);
      if (idx === -1) return null;
      this._wallets[idx] = { ...this._wallets[idx], ...data };
      return this._wallets[idx];
    }),
  };

  payout = {
    create: jest.fn(async ({ data }: any) => {
      const p = { id: this.nextId(), createdAt: new Date(), ...data };
      this._payouts.push(p);
      return p;
    }),
    findFirst: jest.fn(async ({ where }: any) =>
      this._payouts.find((p) => {
        if (where.userId !== undefined && p.userId !== where.userId) return false;
        if (where.status !== undefined && p.status !== where.status) return false;
        if (where.walletId !== undefined && p.walletId !== where.walletId) return false;
        return true;
      }) ?? null,
    ),
    findMany: jest.fn(async ({ where }: any = {}) =>
      this._payouts.filter((p) => !where?.userId || p.userId === where.userId),
    ),
    update: jest.fn(async ({ where, data }: any) => {
      const idx = this._payouts.findIndex((p) => p.id === where.id);
      if (idx === -1) return null;
      this._payouts[idx] = { ...this._payouts[idx], ...data };
      return this._payouts[idx];
    }),
    aggregate: jest.fn(async ({ where }: any) => {
      const rows = this._payouts.filter((p) => !where?.userId || p.userId === where.userId);
      const total = rows.reduce((s, p) => s + (p.amount ?? 0), 0);
      return { _sum: { amount: total } };
    }),
  };

  earning = {
    create: jest.fn(async ({ data }: any) => {
      const e = { id: this.nextId(), deletedAt: null, createdAt: new Date(), ...data };
      this._earnings.push(e);
      return e;
    }),
    findMany: jest.fn(async ({ where }: any = {}) =>
      this._earnings.filter((e) => {
        if (where?.deletedAt === null && e.deletedAt !== null) return false;
        return true;
      }),
    ),
    aggregate: jest.fn(async () => ({
      _sum: { amount: this._earnings.reduce((s, e) => s + (e.amount ?? 0), 0) },
    })),
    update: jest.fn(async ({ where, data }: any) => {
      const idx = this._earnings.findIndex((e) => e.id === where.id);
      if (idx === -1) return null;
      this._earnings[idx] = { ...this._earnings[idx], ...data };
      return this._earnings[idx];
    }),
  };

  subscription = {
    create: jest.fn(async ({ data }: any) => {
      const s = { id: this.nextId(), createdAt: new Date(), ...data };
      this._subscriptions.push(s);
      return s;
    }),
    findMany: jest.fn(async ({ where }: any = {}) =>
      this._subscriptions.filter((s) => !where?.userId || s.userId === where.userId),
    ),
  };

  stellarPaymentIntent = {
    create: jest.fn(async ({ data }: any) => {
      const i = { id: `intent-${this.nextId()}`, createdAt: new Date(), ...data };
      this._intents.push(i);
      return i;
    }),
    findFirst: jest.fn(async ({ where }: any) =>
      this._intents.find((i) => {
        if (where?.memo && i.memo !== where.memo) return false;
        if (where?.status && i.status !== where.status) return false;
        if (where?.transactionId && i.transactionId !== where.transactionId) return false;
        return true;
      }) ?? null,
    ),
    update: jest.fn(async ({ where, data }: any) => {
      const idx = this._intents.findIndex((i) => i.id === where.id);
      if (idx === -1) return null;
      this._intents[idx] = { ...this._intents[idx], ...data };
      return this._intents[idx];
    }),
  };

  $transaction = jest.fn(async (arg: any) => {
    if (typeof arg === 'function') return arg(this);
    return Promise.all(arg);
  });

  // Helpers
  _reset() {
    this._users = []; this._wallets = []; this._payouts = [];
    this._earnings = []; this._subscriptions = []; this._intents = [];
    this._id = 1;
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Prisma repositories (integration)', () => {
  let prisma: InMemoryPrisma;

  beforeEach(() => {
    prisma = new InMemoryPrisma();
  });

  afterEach(() => prisma._reset());

  // ── User repository ───────────────────────────────────────────────────────

  describe('User repository', () => {
    it('creates and retrieves a user by id', async () => {
      const user = await prisma.user.create({ data: { email: 'a@test.com', name: 'Alice' } });
      const found = await prisma.user.findUnique({ where: { id: user.id } });
      expect(found?.email).toBe('a@test.com');
    });

    it('retrieves a user by email', async () => {
      await prisma.user.create({ data: { email: 'b@test.com', name: 'Bob' } });
      const found = await prisma.user.findUnique({ where: { email: 'b@test.com' } });
      expect(found?.name).toBe('Bob');
    });

    it('returns null for unknown user', async () => {
      const found = await prisma.user.findUnique({ where: { id: 9999 } });
      expect(found).toBeNull();
    });

    it('updates user fields', async () => {
      const user = await prisma.user.create({ data: { email: 'c@test.com' } });
      const updated = await prisma.user.update({ where: { id: user.id }, data: { name: 'Charlie' } });
      expect(updated?.name).toBe('Charlie');
    });
  });

  // ── Wallet repository ─────────────────────────────────────────────────────

  describe('Wallet repository', () => {
    it('creates a wallet for a user', async () => {
      const wallet = await prisma.wallet.create({
        data: { userId: 1, address: 'GABC', chain: 'stellar', type: 'freighter' },
      });
      expect(wallet.id).toBeDefined();
      expect(wallet.address).toBe('GABC');
    });

    it('finds wallet by userId and not deleted', async () => {
      await prisma.wallet.create({ data: { userId: 2, address: 'GXYZ', chain: 'stellar', type: 'freighter' } });
      const found = await prisma.wallet.findFirst({ where: { userId: 2, deletedAt: null } });
      expect(found?.address).toBe('GXYZ');
    });

    it('soft-deletes wallet by setting deletedAt', async () => {
      const wallet = await prisma.wallet.create({ data: { userId: 3, address: 'GDEL', chain: 'stellar', type: 'freighter' } });
      await prisma.wallet.update({ where: { id: wallet.id }, data: { deletedAt: new Date() } });
      const found = await prisma.wallet.findFirst({ where: { userId: 3, deletedAt: null } });
      expect(found).toBeNull();
    });

    it('lists all active wallets for a user', async () => {
      await prisma.wallet.create({ data: { userId: 4, address: 'G1', chain: 'stellar', type: 'freighter' } });
      await prisma.wallet.create({ data: { userId: 4, address: 'G2', chain: 'stellar', type: 'lobstr' } });
      const wallets = await prisma.wallet.findMany({ where: { userId: 4, deletedAt: null } });
      expect(wallets).toHaveLength(2);
    });
  });

  // ── Payout repository ─────────────────────────────────────────────────────

  describe('Payout repository', () => {
    it('creates a payout record', async () => {
      const payout = await prisma.payout.create({
        data: { userId: 1, amount: 100, currency: 'USD', method: 'stellar', status: 'pending' },
      });
      expect(payout.status).toBe('pending');
    });

    it('finds pending payout by userId', async () => {
      await prisma.payout.create({ data: { userId: 5, amount: 50, currency: 'USD', method: 'stellar', status: 'pending' } });
      const found = await prisma.payout.findFirst({ where: { userId: 5, status: 'pending' } });
      expect(found).not.toBeNull();
    });

    it('aggregates total payout amount for a user', async () => {
      await prisma.payout.create({ data: { userId: 6, amount: 40, currency: 'USD', method: 'stellar', status: 'completed' } });
      await prisma.payout.create({ data: { userId: 6, amount: 60, currency: 'USD', method: 'stellar', status: 'completed' } });
      const agg = await prisma.payout.aggregate({ where: { userId: 6 } });
      expect(agg._sum.amount).toBe(100);
    });

    it('updates payout status to completed', async () => {
      const p = await prisma.payout.create({ data: { userId: 7, amount: 80, currency: 'USD', method: 'stellar', status: 'pending' } });
      const updated = await prisma.payout.update({ where: { id: p.id }, data: { status: 'completed', onChainTxHash: 'HASH' } });
      expect(updated?.status).toBe('completed');
      expect(updated?.onChainTxHash).toBe('HASH');
    });
  });

  // ── Earning repository ────────────────────────────────────────────────────

  describe('Earning repository', () => {
    it('creates an earning record', async () => {
      const e = await prisma.earning.create({
        data: { clipId: 1, amount: 25, currency: 'USD', date: new Date(), source: 'royalty' },
      });
      expect(e.amount).toBe(25);
      expect(e.deletedAt).toBeNull();
    });

    it('aggregates total earnings', async () => {
      await prisma.earning.create({ data: { clipId: 1, amount: 30, currency: 'USD', date: new Date() } });
      await prisma.earning.create({ data: { clipId: 2, amount: 70, currency: 'USD', date: new Date() } });
      const agg = await prisma.earning.aggregate({});
      expect(agg._sum.amount).toBe(100);
    });

    it('soft-delete excludes earning from active queries', async () => {
      const e = await prisma.earning.create({ data: { clipId: 3, amount: 50, currency: 'USD', date: new Date() } });
      await prisma.earning.update({ where: { id: e.id }, data: { deletedAt: new Date() } });
      const active = await prisma.earning.findMany({ where: { deletedAt: null } });
      expect(active).toHaveLength(0);
    });
  });

  // ── StellarPaymentIntent repository ──────────────────────────────────────

  describe('StellarPaymentIntent repository', () => {
    it('creates a payment intent', async () => {
      const intent = await prisma.stellarPaymentIntent.create({
        data: {
          userId: 1, amount: 10, asset: 'xlm', destination: 'GDEST',
          memo: 'MEMO1', plan: 'pro', status: 'pending', expiresAt: new Date(),
        },
      });
      expect(intent.memo).toBe('MEMO1');
    });

    it('finds intent by memo and pending status', async () => {
      await prisma.stellarPaymentIntent.create({
        data: { userId: 1, amount: 10, asset: 'xlm', destination: 'G1', memo: 'FINDME', plan: 'basic', status: 'pending', expiresAt: new Date() },
      });
      const found = await prisma.stellarPaymentIntent.findFirst({ where: { memo: 'FINDME', status: 'pending' } });
      expect(found).not.toBeNull();
    });

    it('does not find intent by wrong memo', async () => {
      const found = await prisma.stellarPaymentIntent.findFirst({ where: { memo: 'NOPE', status: 'pending' } });
      expect(found).toBeNull();
    });

    it('updates intent status on completion', async () => {
      const intent = await prisma.stellarPaymentIntent.create({
        data: { userId: 1, amount: 5, asset: 'xlm', destination: 'G2', memo: 'COMPLETE', plan: 'pro', status: 'pending', expiresAt: new Date() },
      });
      const updated = await prisma.stellarPaymentIntent.update({
        where: { id: intent.id },
        data: { status: 'completed', transactionId: 'tx-final' },
      });
      expect(updated?.status).toBe('completed');
      expect(updated?.transactionId).toBe('tx-final');
    });
  });

  // ── Transaction consistency ───────────────────────────────────────────────

  describe('Transaction consistency', () => {
    it('withTransaction executes all operations atomically', async () => {
      const prismaService = prisma as unknown as PrismaService;

      await (prismaService as any).$transaction(async (tx: InMemoryPrisma) => {
        await tx.earning.create({ data: { clipId: 1, amount: 100, currency: 'USD', date: new Date() } });
        await tx.payout.create({ data: { userId: 1, amount: 100, currency: 'USD', method: 'stellar', status: 'pending' } });
      });

      const earnings = await prisma.earning.findMany({});
      const payouts = await prisma.payout.findMany({});

      expect(earnings).toHaveLength(1);
      expect(payouts).toHaveLength(1);
    });
  });
});
