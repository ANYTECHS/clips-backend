import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { WalletsService } from '../src/wallets/wallets.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { StellarService } from '../src/stellar/stellar.service';

jest.mock('../src/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

// A valid 56-char Stellar public key (G...)
const VALID_ADDRESS = 'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3';

class InMemoryPrisma {
  private wallets: any[] = [];
  private payouts: any[] = [];
  private clips: any[] = [];
  private nextId = 1;

  wallet = {
    findUnique: jest.fn(async ({ where }) => {
      const wallet = this.wallets.find((w) => w.id === where.id) ?? null;
      if (!wallet) return null;
      return {
        ...wallet,
        payouts: this.payouts.filter((p) => p.walletId === wallet.id),
      };
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
      const created = { id: this.nextId++, ...create };
      this.wallets.push(created);
      return created;
    }),
  };

  payout = {
    findFirst: jest.fn(async ({ where }) => {
      return (
        this.payouts.find(
          (p) => p.walletId === where.walletId && p.status === where.status,
        ) ?? null
      );
    }),
  };

  clip = {
    findFirst: jest.fn(async ({ where } = {}) => {
      return (
        this.clips.find((clip) => {
          if (where?.video?.userId !== undefined && clip.userId !== where.video.userId) {
            return false;
          }
          if (where?.OR?.length) {
            return where.OR.some((condition) => {
              if (condition.nftStatus !== undefined) {
                return clip.nftStatus === condition.nftStatus;
              }
              if (condition.mintAddress?.not === null) {
                return clip.mintAddress !== null;
              }
              return false;
            });
          }
          return true;
        }) ?? null
      );
    }),
  };

  // Test helpers
  _seed(wallet: any) {
    this.wallets.push(wallet);
  }
  _seedPayout(payout: any) {
    this.payouts.push(payout);
  }
  _seedClip(clip: any) {
    this.clips.push(clip);
  }
  _getWallets() {
    return this.wallets;
  }
}

describe('Wallets integration', () => {
  let service: WalletsService;
  let prisma: InMemoryPrisma;
  let stellarService: { validateAddress: jest.Mock };

  beforeEach(async () => {
    prisma = new InMemoryPrisma();
    stellarService = {
      validateAddress: jest.fn().mockReturnValue({ valid: true }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletsService,
        { provide: PrismaService, useValue: prisma },
        { provide: StellarService, useValue: stellarService },
      ],
    }).compile();

    service = module.get<WalletsService>(WalletsService);
  });

  // ─── connect ──────────────────────────────────────────────────────────────

  describe('connect', () => {
    it('creates a new wallet record for a valid Stellar address', async () => {
      const dto = { address: VALID_ADDRESS, chain: 'stellar', type: 'freighter' };
      const result = await service.connect(1, dto);

      expect(result.id).toBeDefined();
      expect(result.address).toBe(VALID_ADDRESS);
      expect(result.userId).toBe(1);
      expect(prisma._getWallets()).toHaveLength(1);
    });

    it('reactivates a previously soft-deleted wallet on reconnect', async () => {
      const dto = { address: VALID_ADDRESS, chain: 'stellar', type: 'freighter' };
      // First connect
      await service.connect(1, dto);
      // Soft-delete it manually
      const wallets = prisma._getWallets();
      wallets[0].deletedAt = new Date();

      // Reconnect — upsert should clear deletedAt
      const result = await service.connect(1, dto);
      expect(result.deletedAt).toBeNull();
    });

    it('throws BadRequestException for an invalid Stellar address', async () => {
      stellarService.validateAddress.mockReturnValue({ valid: false });
      await expect(
        service.connect(1, { address: 'not-a-stellar-key', chain: 'stellar', type: 'freighter' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('reassigns wallet to a different user on upsert', async () => {
      const dto = { address: VALID_ADDRESS, chain: 'stellar', type: 'freighter' };
      await service.connect(1, dto);

      // User 2 claims the same address
      const result = await service.connect(2, dto);
      expect(result.userId).toBe(2);
      // Only one wallet record should exist
      expect(prisma._getWallets()).toHaveLength(1);
    });

    it('supports lobstr wallet type', async () => {
      const dto = { address: VALID_ADDRESS, chain: 'stellar', type: 'lobstr' };
      const result = await service.connect(5, dto);
      expect(result.type).toBe('lobstr');
    });

    it('supports albedo wallet type', async () => {
      const dto = { address: VALID_ADDRESS, chain: 'stellar', type: 'albedo' };
      const result = await service.connect(5, dto);
      expect(result.type).toBe('albedo');
    });
  });

  // ─── disconnect ────────────────────────────────────────────────────────────

  describe('disconnect', () => {
    const baseWallet = {
      id: 10,
      userId: 42,
      address: VALID_ADDRESS,
      chain: 'stellar',
      type: 'freighter',
      deletedAt: null,
    };

    beforeEach(() => {
      prisma._seed({ ...baseWallet });
    });

    it('soft-deletes the wallet and returns a success message', async () => {
      const result = await service.disconnect(10, 42);

      expect(result).toEqual({ message: 'Wallet disconnected successfully', walletId: 10 });
      expect(prisma.wallet.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 10 } }),
      );
    });

    it('throws NotFoundException when the wallet does not exist', async () => {
      await expect(service.disconnect(999, 42)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when wallet belongs to a different user', async () => {
      await expect(service.disconnect(10, 99)).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when wallet is already disconnected', async () => {
      prisma._getWallets()[0].deletedAt = new Date();
      await expect(service.disconnect(10, 42)).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when pending payouts exist on the wallet', async () => {
      prisma._seedPayout({ id: 1, walletId: 10, status: 'pending' });
      await expect(service.disconnect(10, 42)).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when active NFTs exist', async () => {
      prisma._seedClip({ id: 1, userId: 42, nftStatus: 'minted', mintAddress: 'CONTRACT' });
      await expect(service.disconnect(10, 42)).rejects.toThrow(ConflictException);
    });

    it('allows disconnect when the only payout is not pending', async () => {
      prisma._seedPayout({ id: 2, walletId: 10, status: 'completed' });
      const result = await service.disconnect(10, 42);
      expect(result.walletId).toBe(10);
    });
  });
});
