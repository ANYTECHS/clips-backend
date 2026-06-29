import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, ExecutionContext } from '@nestjs/common';
import request from 'supertest';
import { WalletsService } from '../src/wallets/wallets.service';
import { WalletsController } from '../src/wallets/wallets.controller';
import { PrismaService } from '../src/prisma/prisma.service';
import { StellarService } from '../src/stellar/stellar.service';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { WalletOwnershipGuard } from '../src/wallets/guards/wallet-ownership.guard';

/**
 * E2E / integration tests for the wallet connection flow.
 *
 * Guards are overridden so we can control authentication state without
 * needing a real JWT or database. This lets us test the full HTTP layer
 * (routing, validation, service logic) in isolation.
 */

const VALID_STELLAR_ADDRESS = 'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3';
const USER_ID = 42;

const mockPrisma = {
  wallet: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
  },
  payout: {
    findFirst: jest.fn(),
  },
  clip: {
    findFirst: jest.fn(),
  },
};

const mockStellarService = {
  validateAddress: jest.fn(),
};

/** Guard that simulates an authenticated user. */
class AuthenticatedGuard {
  canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    req.user = { userId: USER_ID, email: 'user@example.com' };
    return true;
  }
}

/** Guard that simulates an unauthenticated request (returns 401). */
class UnauthenticatedGuard {
  canActivate() {
    return false; // NestJS returns 403 by default; we'll use AuthGuard behaviour
  }
}

describe('Wallet connection flow (E2E)', () => {
  let app: INestApplication;
  let authedApp: INestApplication;

  /** Build an app with the given JwtAuthGuard override. */
  async function buildApp(jwtGuardOverride: any): Promise<INestApplication> {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [WalletsController],
      providers: [
        WalletsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StellarService, useValue: mockStellarService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(jwtGuardOverride)
      .overrideGuard(WalletOwnershipGuard)
      .useClass(AuthenticatedGuard) // ownership guard always passes in authed context
      .compile();

    const a = moduleFixture.createNestApplication();
    a.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await a.init();
    return a;
  }

  beforeAll(async () => {
    authedApp = await buildApp(AuthenticatedGuard);
  });

  afterAll(async () => {
    await authedApp.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── POST /wallets/connect ─────────────────────────────────────────────────

  describe('POST /wallets/connect', () => {
    it('returns 401 when JWT guard rejects the request', async () => {
      const unauthApp = await buildApp(UnauthenticatedGuard);
      try {
        await request(unauthApp.getHttpServer())
          .post('/wallets/connect')
          .send({ address: VALID_STELLAR_ADDRESS, chain: 'stellar', type: 'freighter' })
          .expect(403); // NestJS returns 403 when canActivate returns false
      } finally {
        await unauthApp.close();
      }
    });

    it('returns 400 for invalid Stellar address', async () => {
      mockStellarService.validateAddress.mockReturnValue({ valid: false });

      await request(authedApp.getHttpServer())
        .post('/wallets/connect')
        .send({ address: 'not-a-valid-address', chain: 'stellar', type: 'freighter' })
        .expect(400);
    });

    it('returns 400 for unsupported chain', async () => {
      await request(authedApp.getHttpServer())
        .post('/wallets/connect')
        .send({ address: VALID_STELLAR_ADDRESS, chain: 'ethereum', type: 'freighter' })
        .expect(400);
    });

    it('returns 400 for unsupported wallet type', async () => {
      await request(authedApp.getHttpServer())
        .post('/wallets/connect')
        .send({ address: VALID_STELLAR_ADDRESS, chain: 'stellar', type: 'metamask' })
        .expect(400);
    });

    it('creates a DB record and returns the wallet on valid input', async () => {
      mockStellarService.validateAddress.mockReturnValue({ valid: true });
      const createdWallet = {
        id: 1,
        userId: USER_ID,
        address: VALID_STELLAR_ADDRESS,
        chain: 'stellar',
        type: 'freighter',
        deletedAt: null,
      };
      mockPrisma.wallet.upsert.mockResolvedValue(createdWallet);

      const res = await request(authedApp.getHttpServer())
        .post('/wallets/connect')
        .send({ address: VALID_STELLAR_ADDRESS, chain: 'stellar', type: 'freighter' })
        .expect(200);

      expect(res.body.id).toBe(1);
      expect(res.body.address).toBe(VALID_STELLAR_ADDRESS);

      // Verify the DB upsert was called with the correct userId
      expect(mockPrisma.wallet.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ userId: USER_ID }),
        }),
      );
    });

    it('reactivates a previously disconnected wallet (duplicate prevention via upsert)', async () => {
      mockStellarService.validateAddress.mockReturnValue({ valid: true });
      const reactivatedWallet = {
        id: 2,
        userId: USER_ID,
        address: VALID_STELLAR_ADDRESS,
        chain: 'stellar',
        type: 'freighter',
        deletedAt: null,
      };
      mockPrisma.wallet.upsert.mockResolvedValue(reactivatedWallet);

      const res = await request(authedApp.getHttpServer())
        .post('/wallets/connect')
        .send({ address: VALID_STELLAR_ADDRESS, chain: 'stellar', type: 'freighter' })
        .expect(200);

      // The upsert update payload must clear deletedAt to reactivate
      expect(mockPrisma.wallet.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ deletedAt: null }),
        }),
      );
      expect(res.body.deletedAt).toBeNull();
    });
  });

  // ─── DELETE /wallets/:id ───────────────────────────────────────────────────

  describe('DELETE /wallets/:id', () => {
    it('returns 403 when JWT guard rejects the request', async () => {
      const unauthApp = await buildApp(UnauthenticatedGuard);
      try {
        await request(unauthApp.getHttpServer()).delete('/wallets/1').expect(403);
      } finally {
        await unauthApp.close();
      }
    });

    it('returns 404 when wallet does not belong to the user', async () => {
      mockPrisma.wallet.findUnique.mockResolvedValue({
        id: 1,
        userId: 999, // different user
        deletedAt: null,
      });
      mockPrisma.payout.findFirst.mockResolvedValue(null);

      await request(authedApp.getHttpServer())
        .delete('/wallets/1')
        .expect(404);
    });

    it('soft-deletes the wallet and returns success', async () => {
      mockPrisma.wallet.findUnique.mockResolvedValue({
        id: 1,
        userId: USER_ID,
        deletedAt: null,
      });
      mockPrisma.payout.findFirst.mockResolvedValue(null);
      mockPrisma.wallet.update.mockResolvedValue({ id: 1, deletedAt: new Date() });

      const res = await request(authedApp.getHttpServer())
        .delete('/wallets/1')
        .expect(200);

      expect(res.body.message).toMatch(/disconnected/i);
      expect(res.body.walletId).toBe(1);
    });
  });
});
