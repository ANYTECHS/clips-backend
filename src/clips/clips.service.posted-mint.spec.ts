import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ClipsService } from './clips.service';
import { PrismaService } from '../prisma/prisma.service';
import { POSTED_CLIP_MINT_ERROR } from './clip-post-status.util';

describe('ClipsService — posted clips cannot be minted (Issue #764)', () => {
  let service: ClipsService;
  let prisma: { clip: { findUnique: jest.Mock; update: jest.Mock } };

  const mintableClip = {
    id: 1,
    nftStatus: 'none',
    mintAddress: null,
    postStatus: null,
    postedAt: null,
    clipPosts: [],
  };

  beforeEach(async () => {
    prisma = {
      clip: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClipsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<ClipsService>(ClipsService);
  });

  describe('preventPostedMint', () => {
    it('allows a clip that has not been posted', async () => {
      prisma.clip.findUnique.mockResolvedValue(mintableClip);

      await expect(service.preventPostedMint(1)).resolves.toBeUndefined();
    });

    it('rejects a clip posted via postStatus with a 400', async () => {
      prisma.clip.findUnique.mockResolvedValue({
        ...mintableClip,
        postStatus: { tiktok: 'posted' },
      });

      await expect(service.preventPostedMint(1)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.preventPostedMint(1)).rejects.toThrow(
        POSTED_CLIP_MINT_ERROR,
      );
    });

    it('rejects a clip with a published clipPost row', async () => {
      prisma.clip.findUnique.mockResolvedValue({
        ...mintableClip,
        clipPosts: [{ status: 'published' }],
      });

      await expect(service.preventPostedMint(1)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects a clip that has a postedAt timestamp', async () => {
      prisma.clip.findUnique.mockResolvedValue({
        ...mintableClip,
        postedAt: new Date('2026-01-01T00:00:00Z'),
      });

      await expect(service.preventPostedMint(1)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws 404 when the clip does not exist', async () => {
      prisma.clip.findUnique.mockResolvedValue(null);

      await expect(service.preventPostedMint(99)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('preventDoubleMint', () => {
    it('also rejects posted clips, so batch minting is covered', async () => {
      // findByIdOrThrow, then the preventPostedMint lookup.
      prisma.clip.findUnique
        .mockResolvedValueOnce({ ...mintableClip, postStatus: 'posted' })
        .mockResolvedValueOnce({ ...mintableClip, postStatus: 'posted' });

      await expect(service.preventDoubleMint(1)).rejects.toThrow(
        POSTED_CLIP_MINT_ERROR,
      );
    });

    it('lets an unposted, unminted clip through', async () => {
      prisma.clip.findUnique
        .mockResolvedValueOnce(mintableClip)
        .mockResolvedValueOnce(mintableClip);

      await expect(service.preventDoubleMint(1)).resolves.toBeUndefined();
    });
  });
});
