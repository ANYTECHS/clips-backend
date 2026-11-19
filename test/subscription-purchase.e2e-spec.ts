import { Test, TestingModule } from '@nestjs/testing';
import { CanActivate, ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { SubscriptionsController } from '../src/subscriptions/subscriptions.controller';
import { StellarPaymentService } from '../src/subscriptions/stellar-payment.service';
import { LoginGuard } from '../src/auth/guards/login.guard';

const mockStellarPaymentService = {
  createPaymentIntent: jest.fn(async (userId: number, dto: any) => ({
    id: 'intent-1',
    userId,
    memo: 'memo-123',
    destination: 'GDESTINATION',
    plan: dto.plan,
    asset: dto.asset,
    amount: dto.amount,
    walletId: dto.walletId,
  })),
  getPendingPaymentIntents: jest.fn(async (userId: number) => [
    { id: 'intent-1', userId, memo: 'memo-123' },
  ]),
  verifyPayment: jest.fn(async () => true),
};

describe('Subscription Purchase Flow (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const allow: CanActivate = {
      canActivate: (ctx: ExecutionContext) => {
        const req = ctx.switchToHttp().getRequest();
        req.user = { id: 1, userId: 1 };
        return true;
      },
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [SubscriptionsController],
      providers: [
        { provide: StellarPaymentService, useValue: mockStellarPaymentService },
      ],
    })
      .overrideGuard(LoginGuard)
      .useValue(allow)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('should create a payment intent, retrieve pending intents, and verify payment', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/subscriptions/create-stellar')
      .send({ plan: 'pro', asset: 'xlm', amount: 10, walletId: '1' })
      .expect(201);

    expect(createRes.body).toHaveProperty('memo');
    expect(createRes.body).toHaveProperty('destination', 'GDESTINATION');

    const memo = createRes.body.memo;

    const pendingRes = await request(app.getHttpServer())
      .get('/subscriptions/stellar/pending')
      .expect(200);

    expect(pendingRes.body).toBeInstanceOf(Array);
    expect(pendingRes.body.some((i: any) => i.memo === memo)).toBe(true);

    const verifyRes = await request(app.getHttpServer())
      .post('/subscriptions/stellar/verify')
      .query({ paymentIntentId: createRes.body.id, transactionHash: 'tx-hash-123' })
      .expect(200);

    expect(verifyRes.body).toEqual({ verified: true });
  });
});
