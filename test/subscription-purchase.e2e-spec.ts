// End-to-End test for subscription purchase flow
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { StellarPaymentService } from '../src/subscriptions/stellar-payment.service';

// Mock implementation of StellarPaymentService
const mockStellarPaymentService = {
  createPaymentIntent: jest.fn(async (userId: number, dto: any) => {
    return {
      id: 'intent-1',
      userId,
      memo: 'memo-123',
      destination: 'GDESTINATION',
      plan: dto.plan,
      asset: dto.asset,
      amount: dto.amount,
      walletId: dto.walletId,
    };
  }),
  getPendingPaymentIntents: jest.fn(async (userId: number) => {
    return [{ id: 'intent-1', userId, memo: 'memo-123' }];
  }),
  verifyPayment: jest.fn(async (paymentIntentId: string, transactionHash: string) => {
    return true;
  }),
};

describe('Subscription Purchase Flow (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(StellarPaymentService)
      .useValue(mockStellarPaymentService)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should create a payment intent, retrieve pending intents, and verify payment', async () => {
    // 1. Create payment intent
    const createRes = await request(app.getHttpServer())
      .post('/subscriptions/create-stellar')
      .send({ plan: 'pro', asset: 'xlm', amount: 10, walletId: '1' })
      .expect(201);

    expect(createRes.body).toHaveProperty('memo');
    expect(createRes.body).toHaveProperty('destination', 'GDESTINATION');

    const memo = createRes.body.memo;

    // 2. Retrieve pending intents
    const pendingRes = await request(app.getHttpServer())
      .get('/subscriptions/stellar/pending')
      .expect(200);

    expect(pendingRes.body).toBeInstanceOf(Array);
    expect(pendingRes.body.some((i: any) => i.memo === memo)).toBe(true);

    // 3. Verify payment
    const verifyRes = await request(app.getHttpServer())
      .post('/subscriptions/stellar/verify')
      .query({ paymentIntentId: createRes.body.id, transactionHash: 'tx-hash-123' })
      .expect(200);

    expect(verifyRes.body).toEqual({ verified: true });
  });
});
