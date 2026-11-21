import { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { App } from 'supertest/types';
import request from 'supertest';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { createApiValidationPipe } from '../src/common/pipes/api-validation.pipe';
import { BlockchainController } from '../src/blockchain/blockchain.controller';
import { SorobanIndexerService } from '../src/blockchain/soroban-indexer.service';
import { PayoutsController } from '../src/payouts/payouts.controller';
import { PayoutsService } from '../src/payouts/payouts.service';
import { BalanceService } from '../src/payouts/balance.service';

describe('API validation (integration)', () => {
  let app: INestApplication<App>;
  let openApi: OpenAPIObject;
  const payoutsService = {
    requestPayoutWithDetails: jest.fn(),
    getPayoutById: jest.fn(),
  };
  const indexerService = {
    listEvents: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [PayoutsController, BlockchainController],
      providers: [
        { provide: PayoutsService, useValue: payoutsService },
        { provide: BalanceService, useValue: {} },
        { provide: SorobanIndexerService, useValue: indexerService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context
            .switchToHttp()
            .getRequest<{ user: { userId: number } }>().user = { userId: 42 };
          return true;
        },
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(createApiValidationPipe());
    await app.init();

    openApi = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Validation integration tests')
        .setVersion('1')
        .build(),
    );
  });

  beforeEach(() => {
    jest.clearAllMocks();
    payoutsService.requestPayoutWithDetails.mockResolvedValue({ id: 8 });
    indexerService.listEvents.mockResolvedValue({ data: [], meta: {} });
  });

  afterAll(async () => {
    await app?.close();
  });

  it('documents the request DTO and both documented 400 error variants', () => {
    expect(openApi).toHaveProperty([
      'components',
      'schemas',
      'CreatePayoutDto',
      'properties',
      'amount',
    ]);
    expect(openApi).toHaveProperty([
      'components',
      'schemas',
      'CreatePayoutDto',
      'properties',
      'currency',
    ]);
    expect(openApi).toHaveProperty([
      'components',
      'schemas',
      'CreatePayoutDto',
      'properties',
      'method',
    ]);
    expect(openApi).toHaveProperty([
      'components',
      'schemas',
      'ValidationErrorResponseDto',
      'properties',
      'details',
    ]);
    expect(openApi).toHaveProperty(
      [
        'paths',
        '/payouts/request',
        'post',
        'requestBody',
        'content',
        'application/json',
        'schema',
        '$ref',
      ],
      '#/components/schemas/CreatePayoutDto',
    );
    expect(openApi).toHaveProperty(
      [
        'paths',
        '/payouts/request',
        'post',
        'responses',
        '400',
        'content',
        'application/json',
        'schema',
        'oneOf',
        0,
        '$ref',
      ],
      '#/components/schemas/ValidationErrorResponseDto',
    );
    expect(openApi).toHaveProperty(
      [
        'paths',
        '/blockchain/events',
        'get',
        'responses',
        '400',
        'content',
        'application/json',
        'schema',
        '$ref',
      ],
      '#/components/schemas/ValidationErrorResponseDto',
    );
    expect(openApi).toHaveProperty([
      'paths',
      '/payouts/{id}',
      'get',
      'responses',
      '400',
      'content',
      'application/json',
      'schema',
      'properties',
      'statusCode',
    ]);
  });

  it('returns the standard validation response for malformed request bodies', async () => {
    const response = await request(app.getHttpServer())
      .post('/payouts/request')
      .send({ amount: 'not-a-number', currency: 'USD', method: 'stellar' })
      .expect(400);

    expect(response.body as unknown).toHaveProperty('statusCode', 400);
    expect(response.body as unknown).toHaveProperty(
      'message',
      'Validation failed',
    );
    expect(response.body as unknown).toHaveProperty('error', 'Bad Request');
    expect(response.body as unknown).toHaveProperty(
      'details.0.field',
      'amount',
    );
    expect(response.body as unknown).toHaveProperty('details.0.errors');
    expect(payoutsService.requestPayoutWithDetails).not.toHaveBeenCalled();
  });

  it('rejects properties not declared by the request DTO', async () => {
    const response = await request(app.getHttpServer())
      .post('/payouts/request')
      .send({
        amount: 100,
        currency: 'USD',
        method: 'stellar',
        unexpected: true,
      })
      .expect(400);

    expect(response.body as unknown).toHaveProperty(
      'details.0.field',
      'unexpected',
    );
    expect(response.body as unknown).toHaveProperty('details.0.errors');
    expect(payoutsService.requestPayoutWithDetails).not.toHaveBeenCalled();
  });

  it('returns a Bad Request response for invalid list query parameters', async () => {
    const response = await request(app.getHttpServer())
      .get('/blockchain/events?page=invalid&limit=10')
      .expect(400);

    expect(response.body as unknown).toHaveProperty('statusCode', 400);
    expect(response.body as unknown).toHaveProperty(
      'message',
      'Validation failed',
    );
    expect(response.body as unknown).toHaveProperty('error', 'Bad Request');
    expect(response.body as unknown).toHaveProperty('details.0.field', 'page');
    expect(response.body as unknown).toHaveProperty('details.0.errors');
    expect(indexerService.listEvents).not.toHaveBeenCalled();
  });

  it('returns a Bad Request response for an invalid route parameter', async () => {
    const response = await request(app.getHttpServer())
      .get('/payouts/not-an-id')
      .expect(400);

    expect(response.body as unknown).toEqual({
      statusCode: 400,
      message: 'Validation failed (numeric string is expected)',
      error: 'Bad Request',
    });
    expect(payoutsService.getPayoutById).not.toHaveBeenCalled();
  });

  it('passes a valid body to the payout handler and returns its response', async () => {
    await request(app.getHttpServer())
      .post('/payouts/request')
      .send({ amount: 100, currency: 'USD', method: 'stellar' })
      .expect(201)
      .expect({ id: 8 });

    expect(payoutsService.requestPayoutWithDetails).toHaveBeenCalledWith(
      42,
      100,
      'USD',
      'stellar',
      undefined,
    );
  });

  it('passes valid query parameters to the blockchain events handler', async () => {
    await request(app.getHttpServer())
      .get('/blockchain/events?page=2&limit=10&tokenId=22')
      .expect(200)
      .expect({ data: [], meta: {} });

    expect(indexerService.listEvents).toHaveBeenCalledWith({
      type: undefined,
      tokenId: 22,
      page: 2,
      limit: 10,
    });
  });
});
