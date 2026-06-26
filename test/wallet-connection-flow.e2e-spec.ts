import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, ExecutionContext } from '@nestjs/common';
import request from 'supertest';
import { WalletsService } from '../src/wallets/wallets.service';
import { WalletsController } from '../src/wallets/wallets.controller';
import { PrismaService } from '../src/prisma/prisma.service';
import { StellarService } from '../src/stellar/stellar.service';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { WalletOwnershipGuard } from '../src/wallets/guards/wallet-ownership.guard';

const VALID_ADDRESS = 'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3';
const USER_ID = 7;

const mockPrisma = {
  wallet: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
  },
  payout: { findFirst: jest.fn() },
  clip: { findFirst: jest.fn() },
};

const mockStellar = { validateAddress: jest.fn() };

class AuthGuard {
  canActivate(ctx: ExecutionContext) {
    ctx.switchToHttp().getRequest().user = { userId: USER_ID };
    return true;
  }
}

class DenyGuard {
  canActivate() { return false; }
}

async function buildApp(jwtOverride: any): Promise<INestApplication> {
  const mod: TestingModule = await Test.createTestingModule({
    controllers: [WalletsController],
    providers: [
      WalletsService,
      { provide: PrismaService, useValue: mockPrisma },
      { provide: StellarService, useValue: mockStellar },
    ],
  })
    .overrideGuard(JwtAuthGuard).useClass(jwtOverride)
    .overrideGuard(WalletOwnershipGuard).useClass(AuthGuard)
    .compile();

  const app = mod.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  await app.init();
  return app;
}

describe('Wallet connection flow (E2E)', () => {
  let app: INestApplication;

  beforeAll(async () => { app = await buildApp(AuthGuard); });
  afterAll(async () => { await app.close(); });
  beforeEach(() => jest.clearAllMocks());

  // ── POST /wallets/connect ─────────────────────────────────────────────────

  describe('POST /wallets/connect', () => {
    it('returns 403 when unauthenticated', async () => {
      const unauthed = await buildApp(DenyGuard);
      try {
        await request(unauthed.getHttpServer())
          .post('/wallets/connect')
          .send({ address: VALID_ADDRESS, chain: 'stellar', type: 'freighter' })
          .expect(403);
      } finally {
        await unauthed.close();
      }
    });

    it('returns 400 for invalid Stellar address', async () => {
      mockStellar.validateAddress.mockReturnValue({ valid: false });
      await request(app.getHttpServer())
        .post('/wallets/connect')
        .send({ address: 'bad-address', chain: 'stellar', type: 'freighter' })
        .expect(400);
    });

    it('returns 400 for unsupported chain', async () => {
      await request(app.getHttpServer())
        .post('/wallets/connect')
        .send({ address: VALID_ADDRESS, chain: 'ethereum', type: 'freighter' })
        .expect(400);
    });

    it('returns 400 for unsupported wallet type', async () => {
      await request(app.getHttpServer())
        .post('/wallets/connect')
        .send({ address: VALID_ADDRESS, chain: 'stellar', type: 'metamask' })
        .expect(400);
    });

    it('creates a DB record and returns the wallet', async () => {
      mockStellar.validateAddress.mockReturnValue({ valid: true });
      const wallet = { id: 1, userId: USER_ID, address: VALID_ADDRESS, chain: 'stellar', type: 'freighter', deletedAt: null };
      mockPrisma.wallet.upsert.mockResolvedValue(wallet);

      const res = await request(app.getHttpServer())
        .post('/wallets/connect')
        .send({ address: VALID_ADDRESS, chain: 'stellar', type: 'freighter' })
        .expect(200);

      expect(res.body.id).toBe(1);
      expect(res.body.address).toBe(VALID_ADDRESS);
      // Verify DB record created with correct userId
      expect(mockPrisma.wallet.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ create: expect.objectContaining({ userId: USER_ID }) }),
      );
    });

    it('prevents duplicate wallet via upsert (reactivates soft-deleted)', async () => {
      mockStellar.validateAddress.mockReturnValue({ valid: true });
      mockPrisma.wallet.upsert.mockResolvedValue({
        id: 2, userId: USER_ID, address: VALID_ADDRESS, chain: 'stellar', type: 'freighter', deletedAt: null,
      });

      const res = await request(app.getHttpServer())
        .post('/wallets/connect')
        .send({ address: VALID_ADDRESS, chain: 'stellar', type: 'freighter' })
        .expect(200);

      // upsert update must clear deletedAt to prevent duplicate and reactivate
      expect(mockPrisma.wallet.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: expect.objectContaining({ deletedAt: null }) }),
      );
      expect(res.body.deletedAt).toBeNull();
    });
  });

  // ── DELETE /wallets/:id ───────────────────────────────────────────────────

  describe('DELETE /wallets/:id', () => {
    it('returns 403 when unauthenticated', async () => {
      const unauthed = await buildApp(DenyGuard);
      try {
        await request(unauthed.getHttpServer()).delete('/wallets/1').expect(403);
      } finally {
        await unauthed.close();
      }
    });

    it('returns 404 when wallet belongs to a different user', async () => {
      mockPrisma.wallet.findUnique.mockResolvedValue({ id: 1, userId: 999, deletedAt: null });
      mockPrisma.payout.findFirst.mockResolvedValue(null);
      await request(app.getHttpServer()).delete('/wallets/1').expect(404);
    });

    it('soft-deletes wallet and returns success message', async () => {
      mockPrisma.wallet.findUnique.mockResolvedValue({ id: 1, userId: USER_ID, deletedAt: null });
      mockPrisma.payout.findFirst.mockResolvedValue(null);
      mockPrisma.wallet.update.mockResolvedValue({ id: 1, deletedAt: new Date() });

      const res = await request(app.getHttpServer()).delete('/wallets/1').expect(200);

      expect(res.body.message).toMatch(/disconnected/i);
      expect(res.body.walletId).toBe(1);
      // Verify DB record was updated (soft-delete)
      expect(mockPrisma.wallet.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 1 } }),
      );
    });
  });
});
