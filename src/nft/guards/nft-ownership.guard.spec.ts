import { ForbiddenException } from '@nestjs/common';
import { NftOwnershipGuard } from './nft-ownership.guard';
import { NftOwnershipService } from '../nft-ownership.service';

describe('NftOwnershipGuard', () => {
  const ownershipService = {
    verifyNFTOwnership: jest.fn(),
  };

  let guard: NftOwnershipGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new NftOwnershipGuard(
      ownershipService as unknown as NftOwnershipService,
    );
  });

  const runGuard = (request: Record<string, unknown>) =>
    guard.canActivate({
      switchToHttp: () => ({ getRequest: () => request }),
    } as any);

  it('allows request when wallet owns the NFT', async () => {
    ownershipService.verifyNFTOwnership.mockResolvedValue({ isOwner: true });

    await expect(
      runGuard({
        params: { tokenId: '42' },
        body: { walletAddress: 'GABC' },
      }),
    ).resolves.toBe(true);
  });

  it('throws ForbiddenException when wallet does not own the NFT', async () => {
    ownershipService.verifyNFTOwnership.mockResolvedValue({
      isOwner: false,
      error: 'Caller does not own the NFT on-chain',
    });

    await expect(
      runGuard({
        params: { mintAddress: '42' },
        body: { walletAddress: 'GABC' },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
