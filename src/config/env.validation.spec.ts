import { validateEnv } from './env.validation';

describe('validateEnv', () => {
  const baseConfig = {
    NODE_ENV: 'development',
    JWT_SECRET: 'dev_jwt_secret',
  };

  it('accepts a minimal development configuration', () => {
    expect(() => validateEnv(baseConfig)).not.toThrow();
  });

  it('rejects invalid BullMQ concurrency values', () => {
    expect(() =>
      validateEnv({
        ...baseConfig,
        BULLMQ_CLIP_GENERATION_CONCURRENCY: 0,
      }),
    ).toThrow(/BULLMQ_CLIP_GENERATION_CONCURRENCY/);
  });

  it('requires critical secrets in production', () => {
    expect(() =>
      validateEnv({
        NODE_ENV: 'production',
        JWT_SECRET: 'dev_jwt_secret',
      }),
    ).toThrow(/ENCRYPTION_SECRET/);
  });

  it('accepts a valid production configuration', () => {
    expect(() =>
      validateEnv({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
        ENCRYPTION_SECRET: 'a-secure-production-secret',
        JWT_SECRET: 'a-secure-jwt-secret',
        SOROBAN_NFT_CONTRACT_ID: 'CABC123',
      }),
    ).not.toThrow();
  });
});
