import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  Controller,
  Get,
  Post,
  Module,
} from '@nestjs/common';
import request from 'supertest';
import { ThrottlerModule, ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

@Controller('test-throttling')
class TestController {
  @Get('default')
  default() {
    return 'ok';
  }

  @Post('strict')
  @Throttle({ auth: { limit: 5, ttl: 60000 } })
  strict() {
    return 'ok';
  }
}

@Module({
  imports: [
    ThrottlerModule.forRoot({
      throttlers: [
        {
          name: 'default',
          ttl: 60000,
          limit: 10,
        },
        {
          name: 'auth',
          ttl: 60000,
          limit: 5,
        },
      ],
    }),
  ],
  controllers: [TestController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
class ThrottlerTestModule {}

describe('Rate Limiting (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ThrottlerTestModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
  });

  it('should rate limit strict auth endpoint after 5 requests', async () => {
    // 5 requests should pass
    for (let i = 0; i < 5; i++) {
      const response = await request(app.getHttpServer()).post(
        '/test-throttling/strict',
      );
      expect(response.status).toBe(201);
    }
    // 6th request should be rate limited
    const response = await request(app.getHttpServer()).post(
      '/test-throttling/strict',
    );
    expect(response.status).toBe(429);
    expect(
      response.header['retry-after'] ?? response.header['retry-after-auth'],
    ).toBeDefined();
  });

  it('should rate limit default endpoint after 10 requests', async () => {
    // 10 requests should pass
    for (let i = 0; i < 10; i++) {
      const response = await request(app.getHttpServer()).get(
        '/test-throttling/default',
      );
      expect(response.status).toBe(200);
    }
    // 11th request should be rate limited
    const response = await request(app.getHttpServer()).get(
      '/test-throttling/default',
    );
    expect(response.status).toBe(429);
    expect(
      response.header['retry-after'] ?? response.header['retry-after-default'],
    ).toBeDefined();
  });
});
