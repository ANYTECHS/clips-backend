import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  ExecutionContext,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import request from 'supertest';
import { WalletsService } from '../src/wallets/wallets.service';
import { WalletsController } from '../src/wallets/wallets.controller';
import { PrismaService } from '../src/prisma/prisma.service';
import { StellarService } from '../src/stellar/stellar.service';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { WalletOwnershipGuard } from '../src/wallets/guards/wallet-ownership.guard';
import { WalletManagementService } from '../src/wallets/wallet-management.service';
import { WalletValidationService } from '../src/wallets/wallet-validation.service';
import { WalletBalanceService } from '../src/wallets/wallet-balance.service';
import { NftOwnershipService } from '../src/nft/nft-ownership.service';

/**
 * Exercises the wallet HTTP flow with authentication, address validation, and
 * persistence boundaries controlled by test doubles.
 */

const VALID_STELLAR_ADDRESS = 'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3';
const USER_ID = 42;

const walletRecords: Array<Record<string, any>> = [];
let nextWalletId = 1;

const mockPrisma = {
  wallet: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
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

const mockWalletValidation = {
  validateAddressForChain: jest.fn((address: string, chain: string) => {
    if (
      chain === 'stellar' &&
      !mockStellarService.validateAddress(address).valid
    ) {
      throw new BadRequestException('Invalid Stellar address format');
    }
  }),
  verifySignatureOwnership: jest.fn(),
};

/** Guard that simulates an authenticated user. */
class AuthenticatedGuard {
  canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    req.user = { userId: USER_ID, email: 'user@example.com' };
    return true;
  }
}

class OtherAuthenticatedGuard {
  canActivate(ctx: ExecutionContext) {
    ctx.switchToHttp().getRequest().user = { userId: USER_ID + 1 };
    return true;
  }
}

/** Guard that simulates an unauthenticated request (returns 401). */
class UnauthenticatedGuard {
  canActivate() {
    throw new UnauthorizedException();
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
        WalletManagementService,
        WalletBalanceService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StellarService, useValue: mockStellarService },
        { provide: WalletValidationService, useValue: mockWalletValidation },
        {
          provide: NftOwnershipService,
          useValue: { getWalletTokenIds: jest.fn() },
        },
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
    walletRecords.splice(0, walletRecords.length);
    nextWalletId = 1;
    mockStellarService.validateAddress.mockReturnValue({ valid: true });

    mockPrisma.wallet.findUnique.mockImplementation(async ({ where }) => {
      if (where.address_chain) {
        return (
          walletRecords.find(
            (wallet) =>
              wallet.address === where.address_chain.address &&
              wallet.chain === where.address_chain.chain,
          ) ?? null
        );
      }
      return walletRecords.find((wallet) => wallet.id === where.id) ?? null;
    });
    mockPrisma.wallet.findFirst.mockImplementation(async ({ where }) => {
      return (
        walletRecords.find(
          (wallet) =>
            wallet.id === where.id &&
            wallet.userId === where.userId &&
            wallet.deletedAt === where.deletedAt,
        ) ?? null
      );
    });
    mockPrisma.wallet.upsert.mockImplementation(
      async ({ where, update, create }) => {
        const existing = walletRecords.find(
          (wallet) =>
            wallet.address === where.address_chain.address &&
            wallet.chain === where.address_chain.chain,
        );
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }

        const wallet = {
          id: nextWalletId++,
          ...create,
          connectedAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        };
        walletRecords.push(wallet);
        return wallet;
      },
    );
    mockPrisma.wallet.update.mockImplementation(async ({ where, data }) => {
      const wallet = walletRecords.find((item) => item.id === where.id);
      if (!wallet) return null;
      Object.assign(wallet, data);
      return wallet;
    });
    mockPrisma.payout.findFirst.mockResolvedValue(null);
    mockPrisma.clip.findFirst.mockResolvedValue(null);
  });

  // ─── POST /wallets/connect ─────────────────────────────────────────────────

  describe('POST /wallets/connect', () => {
    it('returns 401 when the request is unauthenticated', async () => {
      const unauthApp = await buildApp(UnauthenticatedGuard);
      try {
        await request(unauthApp.getHttpServer())
          .post('/wallets/connect')
          .send({
            address: VALID_STELLAR_ADDRESS,
            chain: 'stellar',
            type: 'freighter',
            publicKey: VALID_STELLAR_ADDRESS,
            signature: 'mock-sig',
            signedMessage: 'mock-msg',
          })
          .expect(401);
      } finally {
        await unauthApp.close();
      }
    });

    it('returns 400 for invalid Stellar address', async () => {
      mockStellarService.validateAddress.mockReturnValue({ valid: false });

      await request(authedApp.getHttpServer())
        .post('/wallets/connect')
        .send({
          address: VALID_STELLAR_ADDRESS,
          chain: 'stellar',
          type: 'freighter',
          publicKey: VALID_STELLAR_ADDRESS,
          signature: 'mock-sig',
          signedMessage: 'mock-msg',
        })
        .expect(400);

      expect(mockStellarService.validateAddress).toHaveBeenCalledWith(
        VALID_STELLAR_ADDRESS,
      );
    });

    it('returns 400 for unsupported chain', async () => {
      await request(authedApp.getHttpServer())
        .post('/wallets/connect')
        .send({
          address: VALID_STELLAR_ADDRESS,
          chain: 'ethereum',
          type: 'freighter',
          publicKey: VALID_STELLAR_ADDRESS,
          signature: 'mock-sig',
          signedMessage: 'mock-msg',
        })
        .expect(400);
    });

    it('returns 400 for unsupported wallet type', async () => {
      await request(authedApp.getHttpServer())
        .post('/wallets/connect')
        .send({
          address: VALID_STELLAR_ADDRESS,
          chain: 'stellar',
          type: 'not-a-wallet',
          publicKey: VALID_STELLAR_ADDRESS,
          signature: 'mock-sig',
          signedMessage: 'mock-msg',
        })
        .expect(400);
    });

    it('creates a DB record and returns the wallet on valid input', async () => {
      mockStellarService.validateAddress.mockReturnValue({ valid: true });
      const res = await request(authedApp.getHttpServer())
        .post('/wallets/connect')
        .send({
          address: VALID_STELLAR_ADDRESS,
          chain: 'stellar',
          type: 'freighter',
          publicKey: VALID_STELLAR_ADDRESS,
          signature: 'mock-sig',
          signedMessage: 'mock-msg',
        })
        .expect(200);

      expect(res.body.id).toBe(1);
      expect(res.body.address).toBe('GC6X...UHTZF3');
      expect(walletRecords).toHaveLength(1);
      expect(walletRecords[0]).toEqual(
        expect.objectContaining({
          userId: USER_ID,
          address: VALID_STELLAR_ADDRESS,
          chain: 'stellar',
          type: 'freighter',
          deletedAt: null,
        }),
      );

      const fetched = await request(authedApp.getHttpServer())
        .get('/wallets/1')
        .expect(200);
      expect(fetched.body).toEqual(
        expect.objectContaining({
          id: 1,
          userId: USER_ID,
          address: 'GC6X...UHTZF3',
        }),
      );
    });

    it('prevents duplicate records and rejects a wallet owned by another user', async () => {
      const body = {
        address: VALID_STELLAR_ADDRESS,
        chain: 'stellar',
        type: 'freighter',
        publicKey: VALID_STELLAR_ADDRESS,
        signature: 'mock-sig',
        signedMessage: 'mock-msg',
      };
      const first = await request(authedApp.getHttpServer())
        .post('/wallets/connect')
        .send(body)
        .expect(200);

      const repeated = await request(authedApp.getHttpServer())
        .post('/wallets/connect')
        .send(body)
        .expect(200);
      expect(repeated.body.id).toBe(first.body.id);
      expect(walletRecords).toHaveLength(1);

      const otherUserApp = await buildApp(OtherAuthenticatedGuard);
      try {
        await request(otherUserApp.getHttpServer())
          .post('/wallets/connect')
          .send(body)
          .expect(409);
      } finally {
        await otherUserApp.close();
      }
      expect(walletRecords).toHaveLength(1);
    });

    it('reactivates a previously disconnected wallet', async () => {
      await request(authedApp.getHttpServer())
        .post('/wallets/connect')
        .send({
          address: VALID_STELLAR_ADDRESS,
          chain: 'stellar',
          type: 'freighter',
          publicKey: VALID_STELLAR_ADDRESS,
          signature: 'mock-sig',
          signedMessage: 'mock-msg',
        })
        .expect(200);
      walletRecords[0].deletedAt = new Date();

      const res = await request(authedApp.getHttpServer())
        .post('/wallets/connect')
        .send({
          address: VALID_STELLAR_ADDRESS,
          chain: 'stellar',
          type: 'freighter',
          publicKey: VALID_STELLAR_ADDRESS,
          signature: 'mock-sig',
          signedMessage: 'mock-msg',
        })
        .expect(200);

      expect(walletRecords).toHaveLength(1);
      expect(res.body.deletedAt).toBeNull();
    });
  });

  // ─── DELETE /wallets/:id ───────────────────────────────────────────────────

  describe('DELETE /wallets/:id', () => {
    it('returns 401 when the request is unauthenticated', async () => {
      const unauthApp = await buildApp(UnauthenticatedGuard);
      try {
        await request(unauthApp.getHttpServer())
          .delete('/wallets/1')
          .expect(401);
      } finally {
        await unauthApp.close();
      }
    });

    it('returns 404 when wallet does not belong to the user', async () => {
      walletRecords.push({
        id: 1,
        userId: 999,
        address: VALID_STELLAR_ADDRESS,
        chain: 'stellar',
        type: 'freighter',
        deletedAt: null,
      });

      await request(authedApp.getHttpServer())
        .delete('/wallets/1')
        .expect(404);
    });

    it('soft-deletes the wallet and returns success', async () => {
      walletRecords.push({
        id: 1,
        userId: USER_ID,
        address: VALID_STELLAR_ADDRESS,
        chain: 'stellar',
        type: 'freighter',
        deletedAt: null,
      });

      const res = await request(authedApp.getHttpServer())
        .delete('/wallets/1')
        .expect(200);

      expect(res.body.message).toMatch(/disconnected/i);
      expect(res.body.walletId).toBe(1);
      expect(walletRecords[0].deletedAt).toBeInstanceOf(Date);
      await request(authedApp.getHttpServer()).get('/wallets/1').expect(404);
    });
  });
});
