import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { NftMintGuard } from './nft-mint.guard';

describe('NftMintGuard', () => {
  const prismaMock = {
    clip: {
      findUnique: jest.fn(),
    },
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
    guard = new NftMintGuard(prismaMock as any);
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

    await expect(
      runGuard({ body: { clipId: 1 } }),
    ).resolves.toBe(true);
  });

  it('throws when clipId is missing', async () => {
    await expect(runGuard({ body: {} })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('throws NotFoundException when clip does not exist', async () => {
    prismaMock.clip.findUnique.mockResolvedValue(null);

    await expect(
      runGuard({ body: { clipId: 99 } }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects already minted clips', async () => {
    prismaMock.clip.findUnique.mockResolvedValue({
      ...mintableClip,
      nftStatus: 'minted',
    });

    await expect(
      runGuard({ body: { clipId: 1 } }),
    ).rejects.toThrow('already being minted or has been minted');
  });

  it('rejects clips currently minting', async () => {
    prismaMock.clip.findUnique.mockResolvedValue({
      ...mintableClip,
      nftStatus: 'minting',
    });

    await expect(runGuard({ body: { clipId: 1 } })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects clips with mintAddress set', async () => {
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

    await expect(
      runGuard({ params: { clipId: '1' } }),
    ).resolves.toBe(true);

    expect(prismaMock.clip.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1 } }),
    );
  });
});
