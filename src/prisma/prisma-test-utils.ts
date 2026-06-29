import { PrismaClient } from '@prisma/client';

export interface PrismaTestDatabaseConfig {
  url?: string;
}

export function getPrismaTestDatabaseUrl(config: PrismaTestDatabaseConfig = {}): string {
  const url = config.url ?? process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

  if (!url) {
    throw new Error(
      'Prisma test database URL must be set in TEST_DATABASE_URL or DATABASE_URL.',
    );
  }

  return url;
}

export function createPrismaTestClient(
  config: PrismaTestDatabaseConfig = {},
): PrismaClient {
  return new PrismaClient({
    datasources: {
      db: {
        url: getPrismaTestDatabaseUrl(config),
      },
    },
  });
}

export async function cleanupPrismaTestDatabase(
  prisma: PrismaClient,
): Promise<void> {
  const tables = await prisma.$queryRaw<
    Array<{ tablename: string }>
  >`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename <> '_prisma_migrations'
  `;

  if (tables.length === 0) {
    return;
  }

  const truncateSql = tables
    .map((table) => `"${table.tablename}"`)
    .join(', ');

  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${truncateSql} RESTART IDENTITY CASCADE;`,
  );
}

class TestRollbackError<T> extends Error {
  constructor(public readonly result: T) {
    super('Prisma test transaction rollback');
  }
}

export async function runPrismaTestTransaction<T>(
  prisma: PrismaClient,
  callback: (tx: PrismaClient) => Promise<T>,
): Promise<T> {
  try {
    await prisma.$transaction(async (tx) => {
      const result = await callback(tx);
      throw new TestRollbackError(result);
    });

    throw new Error('Expected test transaction to roll back, but it committed.');
  } catch (error) {
    if (error instanceof TestRollbackError) {
      return error.result;
    }
    throw error;
  }
}

export function usePrismaTestDatabase(prisma: PrismaClient): void {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterEach(async () => {
    await cleanupPrismaTestDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });
}

export function setupPrismaTestClient(
  config: PrismaTestDatabaseConfig = {},
): PrismaClient {
  const prisma = createPrismaTestClient(config);
  usePrismaTestDatabase(prisma);
  return prisma;
}
