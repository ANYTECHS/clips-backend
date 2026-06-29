import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { EarningsService } from '../src/earnings/earnings.service';
import { WalletsService } from '../src/wallets/wallets.service';
import { PayoutMethodService } from '../src/payouts/payout-method.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { StellarService } from '../src/stellar/stellar.service';
import { EncryptionService } from '../src/encryption/encryption.service';

jest.mock('../src/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const VALID_ADDRESS =
  'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3';

class InMemoryPrisma {
  private earnings: any[] = [];
  private wallets: any[] = [];
  private payoutMethods: any[] = [];
  private nextEarningId = 1;
  private nextWalletId = 1;
  private nextPayoutMethodId = 1;

  earning = {
    findUnique: jest.fn(async ({ where }) => {
      return this.earnings.find((e) => e.id === where.id) ?? null;
    }),
    findMany: jest.fn(async ({ where } = {}) => {
      let results = [...this.earnings];
      if (where?.deletedAt !== undefined) {
        results = results.filter((e) => {
          const isDeleted = e.deletedAt !== null;
          return where.deletedAt === null ? !isDeleted : isDeleted;
        });
      }
      if (where?.clip?.video?.userId !== undefined) {
        results = results.filter(
          (e) => e.clip.video.userId === where.clip.video.userId,
        );
      }
      return results;
    }),
    update: jest.fn(async ({ where, data }) => {
      const idx = this.earnings.findIndex((e) => e.id === where.id);
      if (idx === -1) return null;
      this.earnings[idx] = { ...this.earnings[idx], ...data };
      return this.earnings[idx];
    }),
    aggregate: jest.fn(),
  };

  wallet = {
    findUnique: jest.fn(async ({ where }) => {
      return this.wallets.find((w) => w.id === where.id) ?? null;
    }),
    findFirst: jest.fn(async ({ where } = {}) => {
      let results = [...this.wallets];
      if (where?.deletedAt !== undefined) {
        results = results.filter((w) => {
          const isDeleted = w.deletedAt !== null;
          return where.deletedAt === null ? !isDeleted : isDeleted;
        });
      }
      if (where?.userId !== undefined) {
        results = results.filter((w) => w.userId === where.userId);
      }
      return results.length > 0 ? results[0] : null;
    }),
    update: jest.fn(async ({ where, data }) => {
      const idx = this.wallets.findIndex((w) => w.id === where.id);
      if (idx === -1) return null;
      this.wallets[idx] = { ...this.wallets[idx], ...data };
      return this.wallets[idx];
    }),
    upsert: jest.fn(async ({ where, update, create }) => {
      const existing = this.wallets.find(
        (w) =>
          w.address === where.address_chain.address &&
          w.chain === where.address_chain.chain,
      );
      if (existing) {
        Object.assign(existing, update);
        return existing;
      }
      const created = { id: this.nextWalletId++, ...create };
      this.wallets.push(created);
      return created;
    }),
  };

  payout = {
    findFirst: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
  };

  payoutMethod = {
    findMany: jest.fn(async ({ where } = {}) => {
      let results = [...this.payoutMethods];
      if (where?.deletedAt !== undefined) {
        results = results.filter((pm) => {
          const isDeleted = pm.deletedAt !== null;
          return where.deletedAt === null ? !isDeleted : isDeleted;
        });
      }
      if (where?.userId !== undefined) {
        results = results.filter((pm) => pm.userId === where.userId);
      }
      if (where?.isDefault !== undefined) {
        results = results.filter((pm) => pm.isDefault === where.isDefault);
      }
      return results;
    }),
    findFirst: jest.fn(async ({ where } = {}) => {
      let results = [...this.payoutMethods];
      if (where?.deletedAt !== undefined) {
        results = results.filter((pm) => {
          const isDeleted = pm.deletedAt !== null;
          return where.deletedAt === null ? !isDeleted : isDeleted;
        });
      }
      if (where?.id !== undefined) {
        results = results.filter((pm) => pm.id === where.id);
      }
      if (where?.userId !== undefined) {
        results = results.filter((pm) => pm.userId === where.userId);
      }
      if (where?.isDefault !== undefined) {
        results = results.filter((pm) => pm.isDefault === where.isDefault);
      }
      return results.length > 0 ? results[0] : null;
    }),
    create: jest.fn(async ({ data }) => {
      const created = { id: this.nextPayoutMethodId++, ...data };
      this.payoutMethods.push(created);
      return created;
    }),
    update: jest.fn(async ({ where, data }) => {
      const idx = this.payoutMethods.findIndex((pm) => pm.id === where.id);
      if (idx === -1) return null;
      this.payoutMethods[idx] = { ...this.payoutMethods[idx], ...data };
      return this.payoutMethods[idx];
    }),
    updateMany: jest.fn(),
  };

  $transaction = jest.fn(async (arg: unknown) => {
    if (typeof arg === 'function') {
      return arg(this);
    }
    return Promise.all(arg as Promise<unknown>[]);
  });

  // Test helpers
  _seedEarning(earning: any) {
    this.earnings.push(earning);
  }
  _seedWallet(wallet: any) {
    this.wallets.push(wallet);
  }
  _seedPayoutMethod(method: any) {
    this.payoutMethods.push(method);
  }
  _getEarnings() {
    return this.earnings;
  }
  _getWallets() {
    return this.wallets;
  }
  _getPayoutMethods() {
    return this.payoutMethods;
  }
}

describe('Soft Delete Integration', () => {
  let prisma: InMemoryPrisma;
  let earningsService: EarningsService;
  let walletsService: WalletsService;
  let payoutMethodService: PayoutMethodService;

  beforeEach(async () => {
    prisma = new InMemoryPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EarningsService,
        WalletsService,
        PayoutMethodService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: StellarService,
          useValue: {
            validateAddress: jest.fn().mockReturnValue({ valid: true }),
          },
        },
        {
          provide: EncryptionService,
          useValue: {
            encrypt: jest.fn((text: string) => `encrypted_${text}`),
            decrypt: jest.fn((text: string) => text.replace('encrypted_', '')),
          },
        },
      ],
    }).compile();

    earningsService = module.get<EarningsService>(EarningsService);
    walletsService = module.get<WalletsService>(WalletsService);
    payoutMethodService = module.get<PayoutMethodService>(PayoutMethodService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── Earning soft delete ───────────────────────────────────────────────

  describe('EarningsService.softDelete', () => {
    const baseEarning = (overrides = {}) => ({
      id: 1,
      amount: 100,
      source: 'royalty',
      deletedAt: null,
      clip: { video: { userId: 42 } },
      ...overrides,
    });

    it('sets deletedAt instead of removing the record', async () => {
      prisma._seedEarning(baseEarning());

      const result = await earningsService.softDelete(1, 42);

      expect(result).toEqual({ message: 'Earning deleted successfully' });
      const record = prisma._getEarnings()[0];
      expect(record.deletedAt).not.toBeNull();
      expect(record.deletedAt).toBeInstanceOf(Date);
      expect(record.id).toBe(1);
    });

    it('throws NotFoundException when earning does not exist', async () => {
      await expect(earningsService.softDelete(999, 42)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException when earning belongs to another user', async () => {
      prisma._seedEarning(baseEarning({ clip: { video: { userId: 99 } } }));

      await expect(earningsService.softDelete(1, 42)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException when earning is already soft-deleted', async () => {
      prisma._seedEarning(baseEarning({ deletedAt: new Date() }));

      await expect(earningsService.softDelete(1, 42)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('EarningsService.getLeaderboard', () => {
    beforeEach(() => {
      process.env.LEADERBOARD_ENABLED = 'true';
    });

    it('excludes soft-deleted earnings from leaderboard', async () => {
      prisma._seedEarning({
        id: 1,
        amount: 100,
        deletedAt: null,
        clip: { video: { userId: 1 } },
      });
      prisma._seedEarning({
        id: 2,
        amount: 200,
        deletedAt: null,
        clip: { video: { userId: 2 } },
      });
      prisma._seedEarning({
        id: 3,
        amount: 300,
        deletedAt: new Date(),
        clip: { video: { userId: 1 } },
      });

      const result = await earningsService.getLeaderboard(10);

      expect(result).toHaveLength(2);
      const userId1Entry = result.find((e) => e.totalEarned === 100);
      expect(userId1Entry).toBeDefined();
    });
  });

  // ─── Wallet soft delete ────────────────────────────────────────────────

  describe('WalletsService.disconnect', () => {
    const baseWallet = {
      id: 10,
      userId: 42,
      address: VALID_ADDRESS,
      chain: 'stellar',
      type: 'freighter',
      deletedAt: null,
    };

    beforeEach(() => {
      prisma._seedWallet({ ...baseWallet });
    });

    it('sets deletedAt instead of removing the record', async () => {
      const result = await walletsService.disconnect(10, 42);

      expect(result).toEqual({
        message: 'Wallet disconnected successfully',
        walletId: 10,
      });
      const record = prisma._getWallets()[0];
      expect(record.deletedAt).not.toBeNull();
      expect(record.deletedAt).toBeInstanceOf(Date);
    });

    it('throws ConflictException when wallet is already disconnected', async () => {
      prisma._getWallets()[0].deletedAt = new Date();

      await expect(walletsService.disconnect(10, 42)).rejects.toThrow(
        ConflictException,
      );
    });

    it('throws NotFoundException when wallet does not exist', async () => {
      await expect(walletsService.disconnect(999, 42)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException when wallet belongs to another user', async () => {
      await expect(walletsService.disconnect(10, 99)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('WalletsService.connect', () => {
    it('reactivates a soft-deleted wallet by clearing deletedAt', async () => {
      const dto = {
        address: VALID_ADDRESS,
        chain: 'stellar',
        type: 'freighter',
      };

      await walletsService.connect(1, dto);
      const wallets = prisma._getWallets();
      wallets[0].deletedAt = new Date();

      const result = await walletsService.connect(1, dto);
      expect(result.deletedAt).toBeNull();
    });
  });

  // ─── PayoutMethod soft delete ──────────────────────────────────────────

  describe('PayoutMethodService.remove', () => {
    const baseMethod = {
      id: 1,
      userId: 42,
      type: 'bank_account',
      isDefault: false,
      deletedAt: null,
      encryptedAccountNumber: null,
      encryptedRoutingNumber: null,
      encryptedSwiftCode: null,
      encryptedIban: null,
      bankName: 'Test Bank',
      accountHolderName: 'Test User',
      country: 'US',
      currency: 'USD',
      lastFourDigits: '7890',
    };

    beforeEach(() => {
      prisma._seedPayoutMethod({ ...baseMethod });
    });

    it('sets deletedAt instead of removing the record', async () => {
      const result = await payoutMethodService.remove(1, 42);

      expect(result).toEqual({ message: 'Payout method deleted successfully' });
      const record = prisma._getPayoutMethods()[0];
      expect(record.deletedAt).not.toBeNull();
      expect(record.deletedAt).toBeInstanceOf(Date);
    });

    it('throws NotFoundException when method does not exist', async () => {
      await expect(payoutMethodService.remove(999, 42)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException when method is already soft-deleted', async () => {
      prisma._getPayoutMethods()[0].deletedAt = new Date();

      await expect(payoutMethodService.remove(1, 42)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('PayoutMethodService queries exclude deleted records', () => {
    beforeEach(() => {
      prisma._seedPayoutMethod({
        id: 1,
        userId: 42,
        type: 'bank_account',
        isDefault: true,
        deletedAt: null,
        encryptedAccountNumber: 'encrypted_123',
        encryptedRoutingNumber: 'encrypted_routing',
        encryptedSwiftCode: null,
        encryptedIban: null,
        bankName: 'Active Bank',
        accountHolderName: 'Active User',
        country: 'US',
        currency: 'USD',
        lastFourDigits: '1234',
      });
      prisma._seedPayoutMethod({
        id: 2,
        userId: 42,
        type: 'wire_transfer',
        isDefault: false,
        deletedAt: new Date(),
        encryptedAccountNumber: null,
        encryptedRoutingNumber: null,
        encryptedSwiftCode: 'encrypted_swift',
        encryptedIban: 'encrypted_iban',
        bankName: 'Deleted Bank',
        accountHolderName: 'Deleted User',
        country: 'GB',
        currency: 'GBP',
        lastFourDigits: '5678',
      });
    });

    it('findAll returns only non-deleted methods', async () => {
      const results = await payoutMethodService.findAll(42);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(1);
      expect(results[0].bankName).toBe('Active Bank');
    });

    it('findOne returns null for soft-deleted method', async () => {
      await expect(payoutMethodService.findOne(2, 42)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('findOneWithSensitiveData throws NotFoundException for soft-deleted method', async () => {
      await expect(
        payoutMethodService.findOneWithSensitiveData(2, 42),
      ).rejects.toThrow(NotFoundException);
    });

    it('update throws NotFoundException for soft-deleted method', async () => {
      await expect(
        payoutMethodService.update(2, 42, { bankName: 'New Name' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('getDefaultMethod excludes soft-deleted default method', async () => {
      prisma._seedPayoutMethod({
        id: 3,
        userId: 42,
        type: 'bank_account',
        isDefault: true,
        deletedAt: new Date(),
        encryptedAccountNumber: null,
        encryptedRoutingNumber: null,
        encryptedSwiftCode: null,
        encryptedIban: null,
        bankName: 'Old Default',
        accountHolderName: null,
        country: null,
        currency: 'USD',
        lastFourDigits: '0000',
      });

      const result = await payoutMethodService.getDefaultMethod(42);

      expect(result).not.toBeNull();
      expect(result!.id).toBe(1);
      expect(result!.bankName).toBe('Active Bank');
    });
  });
});
