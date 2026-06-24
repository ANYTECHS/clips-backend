import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { NftMintGuard } from './nft-mint.guard';

describe('NftMintGuard', () => {
  const reflector = new Reflector();
  const prismaMock = {
    clip: {
      findUnique: jest.fn(),
    },
  };

  let guard: NftMintGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new NftMintGuard(reflector, prismaMock as any);
  });

  function buildContext(clipId: unknown) {
    return {
      getHandler: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({
          body: { clipId },
        }),
      }),
    } as any;
  }

  it('allows minting when clip is eligible', async () => {
    prismaMock.clip.findUnique.mockResolvedValue({
      id: 1,
      clipUrl: 'https://cdn.example.com/clip.mp4',
      nftStatus: 'none',
      mintAddress: null,
      postStatus: {},
    });

    await expect(guard.canActivate(buildContext(1))).resolves.toBe(true);
  });

  it('rejects already minted clips', async () => {
    prismaMock.clip.findUnique.mockResolvedValue({
      id: 2,
      clipUrl: 'https://cdn.example.com/clip.mp4',
      nftStatus: 'minted',
      mintAddress: 'C123',
      postStatus: {},
    });

    await expect(guard.canActivate(buildContext(2))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects clips that are currently minting', async () => {
    prismaMock.clip.findUnique.mockResolvedValue({
      id: 3,
      clipUrl: 'https://cdn.example.com/clip.mp4',
      nftStatus: 'minting',
      mintAddress: null,
      postStatus: {},
    });

    await expect(guard.canActivate(buildContext(3))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects posted clips', async () => {
    prismaMock.clip.findUnique.mockResolvedValue({
      id: 4,
      clipUrl: 'https://cdn.example.com/clip.mp4',
      nftStatus: 'none',
      mintAddress: null,
      postStatus: { tiktok: true },
    });

    await expect(guard.canActivate(buildContext(4))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('throws NotFoundException when clip does not exist', async () => {
    prismaMock.clip.findUnique.mockResolvedValue(null);

    await expect(guard.canActivate(buildContext(99))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
