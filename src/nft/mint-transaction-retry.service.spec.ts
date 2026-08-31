import { MintTransactionRetryService } from './mint-transaction-retry.service';
import { NftMintStatusService } from './nft-mint-status.service';

describe('MintTransactionRetryService', () => {
  let service: MintTransactionRetryService;
  let prisma: { nftMintStatus: { findUnique: jest.Mock } };
  let mintStatus: jest.Mocked<NftMintStatusService>;

  const clipId = 5;

  const baseStatus = {
    id: 1,
    clipId,
    stage: 'fail' as const,
    txHash: null,
    retryCount: 0,
    nextRetryAt: null,
    failureReason: null,
    permanentFailure: false,
    metadataUri: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    prisma = { nftMintStatus: { findUnique: jest.fn().mockResolvedValue(baseStatus) } };
    mintStatus = {
      getOrCreate: jest.fn().mockResolvedValue(baseStatus),
      markUploaded: jest.fn(),
      markPrepared: jest.fn(),
      markSubmitted: jest.fn(),
      markConfirmed: jest.fn(),
      markFailed: jest.fn().mockResolvedValue({ ...baseStatus, stage: 'fail' }),
      recordRetryAttempt: jest.fn().mockResolvedValue({ ...baseStatus, retryCount: 1 }),
    } as any;

    // Force known env values
    process.env.MINT_MAX_RETRIES = '3';
    process.env.MINT_RETRY_BASE_DELAY_MS = '1000';
    process.env.MINT_MAX_BACKOFF_MS = '10000';

    service = new MintTransactionRetryService(prisma as any, mintStatus);
  });

  afterEach(() => {
    delete process.env.MINT_MAX_RETRIES;
    delete process.env.MINT_RETRY_BASE_DELAY_MS;
    delete process.env.MINT_MAX_BACKOFF_MS;
  });

  describe('calculateDelay', () => {
    it('attempt 1 returns baseDelay', () => {
      expect(service.calculateDelay(1)).toBe(1000);
    });

    it('attempt 2 returns 2x baseDelay', () => {
      expect(service.calculateDelay(2)).toBe(2000);
    });

    it('attempt 3 returns 4x baseDelay', () => {
      expect(service.calculateDelay(3)).toBe(4000);
    });

    it('is capped at maxBackoffMs', () => {
      expect(service.calculateDelay(20)).toBe(10000); // capped
    });
  });

  describe('handleFailure', () => {
    it('schedules a retry when under max retries', async () => {
      const result = await service.handleFailure(clipId, 'RPC error');
      expect(result.shouldRetry).toBe(true);
      expect(result.isPermanentFailure).toBe(false);
      expect(result.nextRetryAt).toBeInstanceOf(Date);
      expect(mintStatus.recordRetryAttempt).toHaveBeenCalled();
    });

    it('marks permanently failed when retries exhausted', async () => {
      mintStatus.getOrCreate.mockResolvedValue({ ...baseStatus, retryCount: 3 });
      const result = await service.handleFailure(clipId, 'Too many failures');
      expect(result.shouldRetry).toBe(false);
      expect(result.isPermanentFailure).toBe(true);
      expect(mintStatus.markFailed).toHaveBeenCalledWith(clipId, 'Too many failures', true);
      expect(mintStatus.recordRetryAttempt).not.toHaveBeenCalled();
    });
  });

  describe('isEligibleForRetry', () => {
    it('returns false for permanently failed status', async () => {
      prisma.nftMintStatus.findUnique.mockResolvedValue({ ...baseStatus, permanentFailure: true });
      expect(await service.isEligibleForRetry(clipId)).toBe(false);
    });

    it('returns false when still in backoff window', async () => {
      prisma.nftMintStatus.findUnique.mockResolvedValue({
        ...baseStatus,
        stage: 'fail',
        nextRetryAt: new Date(Date.now() + 60000),
      });
      expect(await service.isEligibleForRetry(clipId)).toBe(false);
    });

    it('returns false when already confirmed', async () => {
      prisma.nftMintStatus.findUnique.mockResolvedValue({ ...baseStatus, stage: 'confirm' });
      expect(await service.isEligibleForRetry(clipId)).toBe(false);
    });

    it('returns true when fail stage and backoff has elapsed', async () => {
      prisma.nftMintStatus.findUnique.mockResolvedValue({
        ...baseStatus,
        stage: 'fail',
        nextRetryAt: new Date(Date.now() - 1000),
        permanentFailure: false,
      });
      expect(await service.isEligibleForRetry(clipId)).toBe(true);
    });

    it('returns false when no status found', async () => {
      prisma.nftMintStatus.findUnique.mockResolvedValue(null);
      expect(await service.isEligibleForRetry(clipId)).toBe(false);
    });
  });

  describe('isDuplicateSubmission', () => {
    it('returns true when stage is submit', async () => {
      prisma.nftMintStatus.findUnique.mockResolvedValue({ ...baseStatus, stage: 'submit' });
      expect(await service.isDuplicateSubmission(clipId)).toBe(true);
    });

    it('returns true when stage is confirm', async () => {
      prisma.nftMintStatus.findUnique.mockResolvedValue({ ...baseStatus, stage: 'confirm' });
      expect(await service.isDuplicateSubmission(clipId)).toBe(true);
    });

    it('returns false when stage is fail', async () => {
      prisma.nftMintStatus.findUnique.mockResolvedValue({ ...baseStatus, stage: 'fail' });
      expect(await service.isDuplicateSubmission(clipId)).toBe(false);
    });

    it('returns false when no status found', async () => {
      prisma.nftMintStatus.findUnique.mockResolvedValue(null);
      expect(await service.isDuplicateSubmission(clipId)).toBe(false);
    });
  });

  describe('getMaxRetries', () => {
    it('returns configured max retries', () => {
      expect(service.getMaxRetries()).toBe(3);
    });
  });
});
