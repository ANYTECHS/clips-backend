import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { NftFreezeAdminGuard } from './guards/nft-freeze-admin.guard';

describe('AdminGuard for NFT freeze operations', () => {
  const originalAdminSecret = process.env.ADMIN_SECRET;
  const guard = new NftFreezeAdminGuard();

  afterEach(() => {
    if (originalAdminSecret === undefined) {
      delete process.env.ADMIN_SECRET;
    } else {
      process.env.ADMIN_SECRET = originalAdminSecret;
    }
  });

  function context(secret?: string): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ headers: { 'x-admin-secret': secret } }),
      }),
    } as ExecutionContext;
  }

  it.each([undefined, 'wrong-secret'])('rejects an unauthorized admin call', (secret) => {
    process.env.ADMIN_SECRET = 'expected-secret';

    expect(() => guard.canActivate(context(secret))).toThrow(ForbiddenException);
  });

