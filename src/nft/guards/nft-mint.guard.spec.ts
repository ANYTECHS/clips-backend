import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { NftMintGuard } from './nft-mint.guard';
import { LOW_BALANCE_THRESHOLD_XLM } from '../../stellar/stellar.service';

describe('NftMintGuard', () => {
  const prismaMock = {
    clip: {
      findUnique: jest.fn(),
    },
  };

  const stellarServiceMock = {
    validateAddress: jest.fn().mockReturnValue({ valid: true }),
    getAccountBalance: jest.fn().mockResolvedValue(10),
  };

  let guard: NftMintGuard;

  const mintableClip = {
    id: 1,
    nftStatus: 'none',
    mintAddress: null,
    postStatus: null,
    clipUrl: 'https://cdn.example.com/clip.mp4',
    clipPosts: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    stellarServiceMock.validateAddress.mockReturnValue({ valid: true });
    stellarServiceMock.getAccountBalance.mockResolvedValue(10);
    guard = new NftMintGuard(prismaMock as any, stellarServiceMock as any);
  });

  const runGuard = (request: {
    body?: { clipId?: number };
    params?: { clipId?: string; id?: string };
  }) =>
    guard.canActivate({
      switchToHttp: () => ({ getRequest: () => request }),
    } as any);

  it('allows minting when clip is eligible', async () => {
    prismaMock.clip.findUnique.mockResolvedValue(mintableClip);

    await expect(runGuard({ body: { clipId: 1 } })).resolves.toBe(true);
  });

  it('throws when clipId is missing', async () => {
    await expect(runGuard({ body: {} })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('throws NotFoundException when clip does not exist', async () => {
    prismaMock.clip.findUnique.mockResolvedValue(null);

    await expect(runGuard({ body: { clipId: 99 } })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects already minted clips with ConflictException', async () => {
    prismaMock.clip.findUnique.mockResolvedValue({
      ...mintableClip,
      nftStatus: 'minted',
    });

    await expect(runGuard({ body: { clipId: 1 } })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects clips currently minting with ConflictException', async () => {
    prismaMock.clip.findUnique.mockResolvedValue({
      ...mintableClip,
      nftStatus: 'minting',
    });

    await expect(runGuard({ body: { clipId: 1 } })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects clips with mintAddress set with ConflictException', async () => {
    prismaMock.clip.findUnique.mockResolvedValue({
      ...mintableClip,
      mintAddress: 'CABC123',
    });

    await expect(runGuard({ body: { clipId: 1 } })).rejects.toThrow(
      'already been minted on-chain',
    );
  });

  it('rejects posted clips via postStatus', async () => {
    prismaMock.clip.findUnique.mockResolvedValue({
      ...mintableClip,
      postStatus: 'posted',
    });

    await expect(runGuard({ body: { clipId: 1 } })).rejects.toThrow(
      'Posted clips cannot be minted',
    );
  });

  it('rejects posted clips via clipPosts', async () => {
    prismaMock.clip.findUnique.mockResolvedValue({
      ...mintableClip,
      clipPosts: [{ status: 'published' }],
    });

    await expect(runGuard({ body: { clipId: 1 } })).rejects.toThrow(
      'Posted clips cannot be minted',
    );
  });

  it('rejects clips without clipUrl', async () => {
    prismaMock.clip.findUnique.mockResolvedValue({
      ...mintableClip,
      clipUrl: null,
    });

    await expect(runGuard({ body: { clipId: 1 } })).rejects.toThrow(
      'not ready for minting',
    );
  });

  it('reads clipId from route params', async () => {
    prismaMock.clip.findUnique.mockResolvedValue(mintableClip);

    await expect(runGuard({ params: { clipId: '1' } })).resolves.toBe(true);

    expect(prismaMock.clip.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1 } }),
    );
  });

  describe('wallet balance pre-check', () => {
    it('allows minting when wallet balance is sufficient', async () => {
      prismaMock.clip.findUnique.mockResolvedValue(mintableClip);
      stellarServiceMock.getAccountBalance.mockResolvedValue(10);

      await expect(
        runGuard({ body: { clipId: 1, creatorWallet: 'GABC...XYZ' } }),
      ).resolves.toBe(true);

      expect(stellarServiceMock.getAccountBalance).toHaveBeenCalledWith('GABC...XYZ');
    });

    it('rejects minting when wallet balance is below threshold', async () => {
      prismaMock.clip.findUnique.mockResolvedValue(mintableClip);
      stellarServiceMock.getAccountBalance.mockResolvedValue(0.5);

      await expect(
        runGuard({ body: { clipId: 1, creatorWallet: 'GABC...XYZ' } }),
      ).rejects.toThrow('Insufficient wallet balance');
    });

    it('rejects minting when wallet balance is exactly zero', async () => {
      prismaMock.clip.findUnique.mockResolvedValue(mintableClip);
      stellarServiceMock.getAccountBalance.mockResolvedValue(0);

      await expect(
        runGuard({ body: { clipId: 1, creatorWallet: 'GABC...XYZ' } }),
      ).rejects.toThrow('Insufficient wallet balance');
    });

    it('allows minting when Horizon is unreachable (best-effort check)', async () => {
      prismaMock.clip.findUnique.mockResolvedValue(mintableClip);
      stellarServiceMock.getAccountBalance.mockRejectedValue(
        new Error('Horizon timeout'),
      );

      await expect(
        runGuard({ body: { clipId: 1, creatorWallet: 'GABC...XYZ' } }),
      ).resolves.toBe(true);
    });

    it('skips balance check when no wallet address is provided', async () => {
      prismaMock.clip.findUnique.mockResolvedValue(mintableClip);

      await expect(runGuard({ body: { clipId: 1 } })).resolves.toBe(true);
      expect(stellarServiceMock.getAccountBalance).not.toHaveBeenCalled();
    });

    it('skips balance check when wallet address is not a string', async () => {
      prismaMock.clip.findUnique.mockResolvedValue(mintableClip);

      await expect(
        runGuard({ body: { clipId: 1, creatorWallet: 12345 } }),
      ).resolves.toBe(true);
      expect(stellarServiceMock.getAccountBalance).not.toHaveBeenCalled();
    });

    it('uses walletAddress fallback from prepare-mint DTO', async () => {
      prismaMock.clip.findUnique.mockResolvedValue(mintableClip);
      stellarServiceMock.getAccountBalance.mockResolvedValue(5);

      await expect(
        runGuard({ body: { clipId: 1, walletAddress: 'GDEF...UVW' } }),
      ).resolves.toBe(true);

      expect(stellarServiceMock.getAccountBalance).toHaveBeenCalledWith('GDEF...UVW');
    });
  });
});
