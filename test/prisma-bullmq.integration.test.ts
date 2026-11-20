import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { Queue, QueueEvents, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { GracefulShutdownService } from '../src/common/shutdown/graceful-shutdown.service';
import { MetricsService } from '../src/metrics/metrics.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '../src/redis/redis.service';
import { DailyEarningsProcessor } from '../src/earnings/daily-earnings.processor';
import { DailyEarningsAggregationService } from '../src/earnings/daily-earnings-aggregation.service';
import {
  DAILY_EARNINGS_JOB,
  DAILY_EARNINGS_QUEUE,
  DailyEarningsJobData,
} from '../src/earnings/daily-earnings.queue';

const databaseUrl = process.env.PRISMA_BULLMQ_TEST_DATABASE_URL;
const redisUrl = process.env.PRISMA_BULLMQ_TEST_REDIS_URL;
const integrationConfigured = Boolean(databaseUrl && redisUrl);

if (Boolean(databaseUrl) !== Boolean(redisUrl)) {
  throw new Error(
    'Set both PRISMA_BULLMQ_TEST_DATABASE_URL and PRISMA_BULLMQ_TEST_REDIS_URL to run these tests.',
  );
}

const describeIntegration = integrationConfigured ? describe : describe.skip;

function assertIsolatedTargets(): void {
  const parsedDatabaseUrl = new URL(databaseUrl!);
  const databaseName = decodeURIComponent(parsedDatabaseUrl.pathname.slice(1));
  const databaseHost = parsedDatabaseUrl.hostname.replace(/^\[|\]$/g, '');
  const localDatabaseHost = ['localhost', '127.0.0.1', '::1'].includes(
    databaseHost,
  );
  const testDatabaseHost = /(^|[.-])test([.-]|$)/i.test(databaseHost);
  if (
    !['postgres:', 'postgresql:'].includes(parsedDatabaseUrl.protocol) ||
    !/(^|[_-])test([_-]|$)/i.test(databaseName) ||
    !(localDatabaseHost || testDatabaseHost)
  ) {
    throw new Error(
      'PRISMA_BULLMQ_TEST_DATABASE_URL must target a local or test PostgreSQL host and a database whose name contains "test".',
    );
  }

  const parsedRedisUrl = new URL(redisUrl!);
  const redisDatabase = Number(parsedRedisUrl.pathname.slice(1) || 0);
  const redisHost = parsedRedisUrl.hostname.replace(/^\[|\]$/g, '');
  const localHost = ['localhost', '127.0.0.1', '::1'].includes(redisHost);
  const testRedisHost = /(^|[.-])test([.-]|$)/i.test(redisHost);
  if (
    !['redis:', 'rediss:'].includes(parsedRedisUrl.protocol) ||
    !((localHost && redisDatabase > 0) || testRedisHost)
  ) {
    throw new Error(
      'PRISMA_BULLMQ_TEST_REDIS_URL must target a local Redis database other than 0 or a host named for testing.',
    );
  }
}

describeIntegration('Prisma + BullMQ integration', () => {
  let prisma: PrismaClient;
  let queue: Queue;
  let worker: Worker;
  let queueEvents: QueueEvents;
  let redisConnections: IORedis[];
  let queueName: string;
  let queuePrefix: string;
  let createdUserIds: number[];
  let createdCollectionIds: string[];

  beforeAll(async () => {
    assertIsolatedTargets();
    prisma = new PrismaClient({
      datasources: { db: { url: databaseUrl! } },
    });
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    createdUserIds = [];
    createdCollectionIds = [];
    redisConnections = [];
    queueName = `${DAILY_EARNINGS_QUEUE}-integration-${randomUUID()}`;
    queuePrefix = `prisma-bullmq-integration-${randomUUID()}`;

    const makeRedisConnection = () => {
      const connection = new IORedis(redisUrl!, {
        maxRetriesPerRequest: null,
      });
      redisConnections.push(connection);
      return connection;
    };

    queue = new Queue(queueName, {
      connection: makeRedisConnection(),
      prefix: queuePrefix,
    });
    queueEvents = new QueueEvents(queueName, {
      connection: makeRedisConnection(),
      prefix: queuePrefix,
    });

    const metrics = {
      recordJobStart: jest.fn(),
      recordJobCompletion: jest.fn(),
      recordJobFailure: jest.fn(),
    } as unknown as MetricsService;
    const redisService = {
      getClient: () => ({
        set: jest.fn().mockResolvedValue('OK'),
      }),
      del: jest.fn().mockResolvedValue(1),
    } as unknown as RedisService;
    const aggregation = new DailyEarningsAggregationService(
      prisma as unknown as PrismaService,
      redisService,
    );
    const processor = new DailyEarningsProcessor(queue, aggregation, metrics, {
      register: jest.fn(),
      registerQueue: jest.fn(),
    } as unknown as GracefulShutdownService);

    worker = new Worker<DailyEarningsJobData>(
      queueName,
      (job) => processor.process(job),
      {
        connection: makeRedisConnection(),
        prefix: queuePrefix,
        concurrency: 1,
      },
    );

    await Promise.all([
      queue.waitUntilReady(),
      queueEvents.waitUntilReady(),
      worker.waitUntilReady(),
    ]);
  });

  afterEach(async () => {
    try {
      await worker?.close();
      await queueEvents?.close();
      await queue?.obliterate({ force: true });
      await queue?.close();
    } finally {
      for (const connection of redisConnections) {
        connection.disconnect();
      }

      if (createdUserIds.length > 0) {
        await prisma.user.deleteMany({
          where: { id: { in: createdUserIds } },
        });
      }
      if (createdCollectionIds.length > 0) {
        await prisma.nftCollection.deleteMany({
          where: { collectionId: { in: createdCollectionIds } },
        });
      }
    }
  });

  async function createEarningFixture() {
    const user = await prisma.user.create({
      data: {
        email: `bullmq-${randomUUID()}@example.test`,
        name: 'BullMQ integration test',
      },
    });
    createdUserIds.push(user.id);

    const collectionId = `bullmq-test-${randomUUID()}`;
    await prisma.nftCollection.create({
      data: {
        collectionId,
        name: 'BullMQ integration test',
        description: 'Temporary integration fixture',
        type: 'test',
      },
    });
    createdCollectionIds.push(collectionId);

    const video = await prisma.video.create({
      data: {
        userId: user.id,
        sourceUrl: `https://example.test/${randomUUID()}`,
      },
    });
    const clip = await prisma.clip.create({
      data: {
        videoId: video.id,
        collectionId,
        clipUrl: 'https://example.test/clip.mp4',
        startTime: 0,
        endTime: 10,
        duration: 10,
      },
    });

    const earningDate = new Date();
    earningDate.setUTCHours(12, 0, 0, 0);
    await prisma.earning.create({
      data: {
        clipId: clip.id,
        amount: 12.5,
        currency: 'USD',
        date: earningDate,
      },
    });

    const date = earningDate.toISOString().slice(0, 10);
    return {
      user,
      date,
      midnightUtc: new Date(`${date}T00:00:00.000Z`),
    };
  }

  it('creates a queue job, processes it, and persists the daily earnings and summary', async () => {
    const fixture = await createEarningFixture();
    const job = await queue.add(
      DAILY_EARNINGS_JOB,
      { date: fixture.date },
      { attempts: 1, removeOnComplete: false, removeOnFail: false },
    );

    await job.waitUntilFinished(queueEvents, 15_000);

    expect(await job.getState()).toBe('completed');
    await expect(
      prisma.dailyEarning.findUnique({
        where: {
          userId_date_currency: {
            userId: fixture.user.id,
            date: fixture.midnightUtc,
            currency: 'USD',
          },
        },
      }),
    ).resolves.toMatchObject({
      totalAmount: 12.5,
      earningCount: 1,
      clipCount: 1,
    });
    await expect(
      prisma.userEarningsSummary.findUnique({
        where: { userId: fixture.user.id },
      }),
    ).resolves.toMatchObject({
      totalEarned: 12.5,
      availableBalance: 12.5,
    });
  });

  it('retains failed jobs and leaves database records unchanged when processing fails', async () => {
    const fixture = await createEarningFixture();
    const invalidDate = 'not-a-date';
    const job = await queue.add(
      DAILY_EARNINGS_JOB,
      { date: invalidDate },
      { attempts: 1, removeOnComplete: false, removeOnFail: false },
    );

    await expect(job.waitUntilFinished(queueEvents, 15_000)).rejects.toThrow(
      'Invalid date',
    );

    expect(await job.getState()).toBe('failed');
    const failedJob = await queue.getJob(job.id!);
    expect(failedJob?.failedReason).toContain('Invalid date');
    await expect(
      prisma.dailyEarning.findMany({ where: { userId: fixture.user.id } }),
    ).resolves.toHaveLength(0);
    await expect(
      prisma.userEarningsSummary.findUnique({
        where: { userId: fixture.user.id },
      }),
    ).resolves.toBeNull();
  });

  it('rolls back all database writes when a transaction fails', async () => {
    const fixture = await createEarningFixture();
    const originalName = fixture.user.name;

    await expect(
      prisma.$transaction(async (transaction) => {
        await transaction.user.update({
          where: { id: fixture.user.id },
          data: { name: 'uncommitted change' },
        });
        await transaction.userEarningsSummary.create({
          data: { userId: fixture.user.id, totalEarned: 99 },
        });
        throw new Error('force transaction rollback');
      }),
    ).rejects.toThrow('force transaction rollback');

    await expect(
      prisma.user.findUnique({ where: { id: fixture.user.id } }),
    ).resolves.toMatchObject({ name: originalName });
    await expect(
      prisma.userEarningsSummary.findUnique({
        where: { userId: fixture.user.id },
      }),
    ).resolves.toBeNull();
  });
});
