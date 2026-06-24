import { ConfigService } from '@nestjs/config';
import { QueueConfigService } from './queue-config.service';

describe('QueueConfigService', () => {
  it('returns safe defaults', () => {
    const service = new QueueConfigService(new ConfigService({}));

    expect(service.connection).toMatchObject({
      host: 'localhost',
      port: 6379,
      db: 0,
    });
    expect(service.runtime).toEqual({
      prefix: 'clips',
      defaultAttempts: 3,
      defaultBackoffDelayMs: 1000,
      removeOnComplete: 1000,
      removeOnFail: 5000,
    });
  });

  it('loads queue settings from environment configuration', () => {
    const service = new QueueConfigService(
      new ConfigService({
        QUEUE_REDIS_HOST: 'queue.internal',
        QUEUE_REDIS_PORT: '6380',
        QUEUE_REDIS_USERNAME: 'worker',
        QUEUE_REDIS_PASSWORD: 'secret',
        QUEUE_REDIS_DB: '2',
        QUEUE_REDIS_TLS: 'true',
        QUEUE_PREFIX: 'clips-test',
        QUEUE_DEFAULT_ATTEMPTS: '7',
        QUEUE_DEFAULT_BACKOFF_DELAY_MS: '2500',
        QUEUE_REMOVE_ON_COMPLETE: '25',
        QUEUE_REMOVE_ON_FAIL: '75',
      }),
    );

    expect(service.connection).toEqual({
      host: 'queue.internal',
      port: 6380,
      username: 'worker',
      password: 'secret',
      db: 2,
      tls: {},
    });
    expect(service.bullOptions).toMatchObject({
      prefix: 'clips-test',
      defaultJobOptions: {
        attempts: 7,
        backoff: { type: 'exponential', delay: 2500 },
        removeOnComplete: 25,
        removeOnFail: 75,
      },
    });
  });

  it('falls back to the shared Redis settings', () => {
    const service = new QueueConfigService(
      new ConfigService({
        REDIS_HOST: 'shared-redis',
        REDIS_PORT: '6381',
        REDIS_PASSWORD: 'shared-secret',
      }),
    );

    expect(service.connection).toMatchObject({
      host: 'shared-redis',
      port: 6381,
      password: 'shared-secret',
    });
  });

  it('rejects invalid numeric settings with a clear error', () => {
    const service = new QueueConfigService(
      new ConfigService({ QUEUE_REDIS_PORT: 'not-a-port' }),
    );

    expect(() => service.connection).toThrow(
      'QUEUE_REDIS_PORT must be an integer greater than or equal to 1',
    );
  });
});
