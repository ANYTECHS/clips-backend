import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, ExecutionContext } from '@nestjs/common';
import request from 'supertest';
import { TransactionsController } from '../src/transactions/transactions.controller';
import { TransactionsService } from '../src/transactions/transactions.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { StellarService } from '../src/stellar/stellar.service';
import { EncryptionService } from '../src/encryption/encryption.service';
import { RedisService } from '../src/redis/redis.service';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';

// We mock the entire Stellar SDK so no real network calls happen
jest.mock('@stellar/stellar-sdk', () => {
  const mockSign = jest.fn();
  const mockBuild = jest.fn().mockReturnValue({ sign: mockSign });
  const mockTimeout = jest.fn().mockReturnValue({ build: mockBuild });
  const mockAddOperation = jest.fn().mockReturnValue({ setTimeout: mockTimeout });
  const mockTxBuilder = jest.fn().mockImplementation(() => ({
    addOperation: mockAddOperation,
  }));

  return {
    Keypair: {
      fromSecret: jest.fn().mockReturnValue({
        publicKey: jest.fn().mockReturnValue('GPUBLICKEY'),
      }),
    },
    Horizon: {
      Server: jest.fn().mockImplementation(() => ({
        loadAccount: jest.fn().mockResolvedValue({ id: 'GPUBLICKEY' }),
        submitTransaction: jest.fn().mockResolvedValue({ hash: 'mock-tx-hash' }),
      })),
    },
    TransactionBuilder: mockTxBuilder,
    Operation: {
      payment: jest.fn().mockReturnValue({ type: 'payment' }),
    },
    Asset: {
      native: jest.fn().mockReturnValue({ isNative: () => true }),
    },
    BASE_FEE: '100',
  };
});

const VALID_STELLAR_ADDRESS = 'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3';
const USER_ID = 42;

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
  },
};

const mockStellarService = {
  validateAddress: jest.fn(),
  horizonUrl: 'https://horizon-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015',
};

const mockEncryptionService = {
  decrypt: jest.fn(),
};

const mockRedisService = {
  get: jest.fn(),
  setex: jest.fn(),
  getClient: jest.fn().mockReturnValue({
    incrbyfloat: jest.fn(),
  }),
};

class AuthenticatedGuard {
  canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    req.user = { userId: USER_ID, email: 'user@example.com' };
    return true;
  }
}

class UnauthenticatedGuard {
  canActivate() {
    return false;
  }
}

describe('Transactions proxy endpoint (E2E)', () => {
  let app: INestApplication;
  let authedApp: INestApplication;

  async function buildApp(jwtGuardOverride: any): Promise<INestApplication> {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [TransactionsController],
      providers: [
        TransactionsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StellarService, useValue: mockStellarService },
        { provide: EncryptionService, useValue: mockEncryptionService },
        { provide: RedisService, useValue: mockRedisService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(jwtGuardOverride)
      .compile();

    const a = moduleFixture.createNestApplication();
    a.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
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
    mockRedisService.get.mockResolvedValue(null);
    mockRedisService.setex.mockResolvedValue(undefined);
    mockRedisService.getClient().incrbyfloat.mockResolvedValue(undefined);
    mockEncryptionService.decrypt.mockReturnValue('SCZANGBA5YELWTYPPRHG5PJRJHQ7VVTL6IIYLXN5YB7SFT2UVNO3XHZ');
    mockStellarService.validateAddress.mockReturnValue({ valid: true });
  });

  describe('POST /transactions/send', () => {
    it('returns 403 when JWT guard rejects the request', async () => {
      const unauthApp = await buildApp(UnauthenticatedGuard);
      try {
        await request(unauthApp.getHttpServer())
          .post('/transactions/send')
          .send({ destination: VALID_STELLAR_ADDRESS, amount: '10' })
          .expect(403);
      } finally {
        await unauthApp.close();
      }
    });

    it('returns 400 for invalid destination Stellar address format', async () => {
      await request(authedApp.getHttpServer())
        .post('/transactions/send')
        .send({ destination: 'invalid-address', amount: '10' })
        .expect(400);
    });

    it('returns 400 for invalid amount format', async () => {
      await request(authedApp.getHttpServer())
        .post('/transactions/send')
        .send({ destination: VALID_STELLAR_ADDRESS, amount: 'not-a-number' })
        .expect(400);
    });

    it('returns 400 for amount exceeding 10000 XLM limit', async () => {
      await request(authedApp.getHttpServer())
        .post('/transactions/send')
        .send({ destination: VALID_STELLAR_ADDRESS, amount: '10001' })
        .expect(400);
    });

    it('returns 400 for negative or zero amount', async () => {
      await request(authedApp.getHttpServer())
        .post('/transactions/send')
        .send({ destination: VALID_STELLAR_ADDRESS, amount: '-5' })
        .expect(400);

      await request(authedApp.getHttpServer())
        .post('/transactions/send')
        .send({ destination: VALID_STELLAR_ADDRESS, amount: '0' })
        .expect(400);
    });

    it('returns 404 when user does not have custodial wallet on record', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await request(authedApp.getHttpServer())
        .post('/transactions/send')
        .send({ destination: VALID_STELLAR_ADDRESS, amount: '10' })
        .expect(404);
    });

    it('submits transaction and returns transaction hash on valid request', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        stellarPublicKey: 'GPUBLICKEY',
        encryptedStellarSecret: 'encrypted-secret',
      });

      const res = await request(authedApp.getHttpServer())
        .post('/transactions/send')
        .send({ destination: VALID_STELLAR_ADDRESS, amount: '10.5' })
        .expect(201);

      expect(res.body.hash).toBe('mock-tx-hash');
      expect(res.body.destination).toBe(VALID_STELLAR_ADDRESS);
      expect(res.body.amount).toBe('10.5');
    });

    it('returns 400 when attempting to send to own custodial wallet', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        stellarPublicKey: VALID_STELLAR_ADDRESS,
        encryptedStellarSecret: 'encrypted-secret',
      });

      await request(authedApp.getHttpServer())
        .post('/transactions/send')
        .send({ destination: VALID_STELLAR_ADDRESS, amount: '10' })
        .expect(400);
    });

    it('implements idempotency and returns identical response on repeat request with header', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        stellarPublicKey: 'GPUBLICKEY',
        encryptedStellarSecret: 'encrypted-secret',
      });

      const cachedResponse = {
        hash: 'cached-tx-hash',
        destination: VALID_STELLAR_ADDRESS,
        amount: '10.5',
      };
      mockRedisService.get.mockResolvedValueOnce(JSON.stringify(cachedResponse));

      const res = await request(authedApp.getHttpServer())
        .post('/transactions/send')
        .set('Idempotency-Key', 'my-unique-key')
        .send({ destination: VALID_STELLAR_ADDRESS, amount: '10.5' })
        .expect(201);

      expect(res.body.hash).toBe('cached-tx-hash');
      expect(mockRedisService.get).toHaveBeenCalledWith(`tx:idem:${USER_ID}:my-unique-key`);
      expect(mockPrisma.user.findUnique).toHaveBeenCalled();
    });

    it('returns 422 when rolling daily transaction volume limit is reached', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        stellarPublicKey: 'GPUBLICKEY',
        encryptedStellarSecret: 'encrypted-secret',
      });

      mockRedisService.get.mockResolvedValueOnce('49995');

      await request(authedApp.getHttpServer())
        .post('/transactions/send')
        .send({ destination: VALID_STELLAR_ADDRESS, amount: '10' })
        .expect(422);
    });
  });
});
