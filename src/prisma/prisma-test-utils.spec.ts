import { PrismaClient } from '@prisma/client';
import {
  cleanupPrismaTestDatabase,
  createPrismaTestClient,
  getPrismaTestDatabaseUrl,
  runPrismaTestTransaction,
} from './prisma-test-utils';

const mockConnect = jest.fn();
const mockDisconnect = jest.fn();
const mockQueryRaw = jest.fn();
const mockExecuteRawUnsafe = jest.fn();
const mockTransaction = jest.fn();

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    $connect: mockConnect,
    $disconnect: mockDisconnect,
    $queryRaw: mockQueryRaw,
    $executeRawUnsafe: mockExecuteRawUnsafe,
    $transaction: mockTransaction,
  })),
}));

describe('prisma-test-utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.TEST_DATABASE_URL;
    delete process.env.DATABASE_URL;
  });

  it('uses TEST_DATABASE_URL when set', () => {
    process.env.TEST_DATABASE_URL = 'postgres://test-db';

    expect(getPrismaTestDatabaseUrl()).toBe('postgres://test-db');
  });

  it('falls back to DATABASE_URL when TEST_DATABASE_URL is not set', () => {
    process.env.DATABASE_URL = 'postgres://fallback-db';

    expect(getPrismaTestDatabaseUrl()).toBe('postgres://fallback-db');
  });

  it('throws when no test database url is configured', () => {
    expect(() => getPrismaTestDatabaseUrl()).toThrow(
      'Prisma test database URL must be set in TEST_DATABASE_URL or DATABASE_URL.',
    );
  });

  it('creates a Prisma client using the test database url', () => {
    process.env.TEST_DATABASE_URL = 'postgres://test-db';

    createPrismaTestClient();

    expect(PrismaClient).toHaveBeenCalledWith({
      datasources: {
        db: {
          url: 'postgres://test-db',
        },
      },
    });
  });

  it('truncates public tables and resets identity columns', async () => {
    process.env.TEST_DATABASE_URL = 'postgres://test-db';
    mockQueryRaw.mockResolvedValue([{ tablename: 'users' }, { tablename: 'payouts' }]);
    const prisma = createPrismaTestClient();

    await cleanupPrismaTestDatabase(prisma as unknown as PrismaClient);

    expect(mockExecuteRawUnsafe).toHaveBeenCalledWith(
      'TRUNCATE TABLE "users", "payouts" RESTART IDENTITY CASCADE;',
    );
  });

  it('runPrismaTestTransaction rolls back and returns the callback result', async () => {
    process.env.TEST_DATABASE_URL = 'postgres://test-db';
    mockTransaction.mockImplementation(async (callback: any) => callback({}));
    const prisma = createPrismaTestClient();

    const result = await runPrismaTestTransaction(
      prisma as unknown as PrismaClient,
      async () => 'rolled back',
    );

    expect(mockTransaction).toHaveBeenCalled();
    expect(result).toBe('rolled back');
  });
});
