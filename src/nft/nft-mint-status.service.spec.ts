import { NotFoundException } from '@nestjs/common';
import { NftMintStatusService } from './nft-mint-status.service';

describe('NftMintStatusService', () => {
  let service: NftMintStatusService;

  /** Minimal Prisma mock — only the fields accessed by NftMintStatusService. */
  let prisma: {
    clip: { findUnique: jest.Mock };
    nftMintStatus: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      upsert: jest.Mock;
    };
  };

  const clipId = 10;

  const baseStatus = {
    id: 1,
    clipId,
    stage: 'none',
    txHash: null,
    retryCount: 0,
    nextRetryAt: null,
    failureReason: null,
    permanentFailure: false,
    metadataUri: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };

  beforeEach(() => {
    prisma = {
      clip: { findUnique: jest.fn().mockResolvedValue({ id: clipId }) },
      nftMintStatus: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(baseStatus),
        update: jest.fn().mockResolvedValue(baseStatus),
        upsert: jest.fn().mockResolvedValue(baseStatus),
      },
    };
    service = new NftMintStatusService(prisma as any);
  });

  // ── getOrCreate ──────────────────────────────────────────────────────────

  describe('getOrCreate', () => {
    it('throws NotFoundException when the clip does not exist', async () => {
      prisma.clip.findUnique.mockResolvedValue(null);
      await expect(service.getOrCreate(clipId)).rejects.toThrow(NotFoundException);
    });

    it('returns the existing status without creating a new one', async () => {
      prisma.nftMintStatus.findUnique.mockResolvedValue(baseStatus);

      const result = await service.getOrCreate(clipId);

      expect(result).toEqual(baseStatus);
      expect(prisma.nftMintStatus.create).not.toHaveBeenCalled();
    });

    it('creates a new none-stage status when none exists', async () => {
      const result = await service.getOrCreate(clipId);

      expect(prisma.nftMintStatus.create).toHaveBeenCalledWith({
        data: { clipId, stage: 'none' },
      });
      expect(result.stage).toBe('none');
    });
  });

  // ── Stage transitions ────────────────────────────────────────────────────

  describe('markUploaded', () => {
    it('upserts with stage=upload and the supplied metadataUri', async () => {
      const uri = 'ipfs://abc123';
      prisma.nftMintStatus.upsert.mockResolvedValue({ ...baseStatus, stage: 'upload', metadataUri: uri });

      const result = await service.markUploaded(clipId, uri);

      expect(prisma.nftMintStatus.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ stage: 'upload', metadataUri: uri }),
        }),
      );
      expect(result.stage).toBe('upload');
      expect(result.metadataUri).toBe(uri);
    });
  });

  describe('markPrepared', () => {
    it('upserts with stage=prepare', async () => {
      prisma.nftMintStatus.upsert.mockResolvedValue({ ...baseStatus, stage: 'prepare' });

      const result = await service.markPrepared(clipId);

      expect(result.stage).toBe('prepare');
      expect(prisma.nftMintStatus.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: expect.objectContaining({ stage: 'prepare' }) }),
      );
    });
  });

  describe('markSubmitted', () => {
    it('upserts with stage=submit and the supplied txHash', async () => {
      const hash = '0xtxhash';
      prisma.nftMintStatus.upsert.mockResolvedValue({ ...baseStatus, stage: 'submit', txHash: hash });

      const result = await service.markSubmitted(clipId, hash);

      expect(result.stage).toBe('submit');
      expect(result.txHash).toBe(hash);
    });
  });

  describe('markConfirmed', () => {
    it('upserts with stage=confirm', async () => {
      prisma.nftMintStatus.upsert.mockResolvedValue({ ...baseStatus, stage: 'confirm' });

      const result = await service.markConfirmed(clipId);

      expect(result.stage).toBe('confirm');
    });
  });

  describe('markFailed', () => {
    it('upserts with stage=fail, reason, and permanentFailure=false by default', async () => {
      prisma.nftMintStatus.upsert.mockResolvedValue({
        ...baseStatus,
        stage: 'fail',
        failureReason: 'RPC error',
        permanentFailure: false,
      });

      const result = await service.markFailed(clipId, 'RPC error');

      expect(result.stage).toBe('fail');
      expect(result.failureReason).toBe('RPC error');
      expect(result.permanentFailure).toBe(false);
    });

    it('marks permanently failed when permanentFailure=true', async () => {
      prisma.nftMintStatus.upsert.mockResolvedValue({
        ...baseStatus,
        stage: 'fail',
        permanentFailure: true,
        failureReason: 'Max retries exceeded',
      });

      const result = await service.markFailed(clipId, 'Max retries exceeded', true);

      expect(result.permanentFailure).toBe(true);
      expect(prisma.nftMintStatus.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ permanentFailure: true }),
        }),
      );
    });
  });

  // ── recordRetryAttempt ───────────────────────────────────────────────────

  describe('recordRetryAttempt', () => {
    it('throws NotFoundException when status not found', async () => {
      prisma.nftMintStatus.findUnique.mockResolvedValue(null);
      await expect(service.recordRetryAttempt(clipId, new Date())).rejects.toThrow(
        NotFoundException,
      );
    });

    it('increments retryCount by 1 and sets nextRetryAt', async () => {
      const nextAt = new Date(Date.now() + 30_000);
      prisma.nftMintStatus.findUnique.mockResolvedValue({ ...baseStatus, retryCount: 1 });
      prisma.nftMintStatus.update.mockResolvedValue({ ...baseStatus, retryCount: 2, nextRetryAt: nextAt });

      const result = await service.recordRetryAttempt(clipId, nextAt);

      expect(prisma.nftMintStatus.update).toHaveBeenCalledWith({
        where: { clipId },
        data: { retryCount: 2, nextRetryAt: nextAt },
      });
      expect(result.retryCount).toBe(2);
      expect(result.nextRetryAt).toEqual(nextAt);
    });
  });
});
