import { Job } from 'bullmq';
import { NftMintProcessor, NftMintJob } from './nft-mint.processor';
import { NFT_MINT_JOB_OPTIONS, NFT_MINT_QUEUE } from './nft-mint.queue';

// Mock missing modules before processor imports resolve them
jest.mock('../metrics/metrics.service', () => ({ MetricsService: class {} }));
jest.mock('../stellar/stellar.service', () => ({ StellarService: class {} }));
jest.mock('@stellar/stellar-sdk', () => ({}));
jest.mock('../common/circuit-breaker/circuit-breaker.service', () => ({
  CircuitBreakerService: class {},
}));
jest.mock('../config/config.service', () => ({ ConfigService: class {} }));

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockNftMintService = { prepareMintTx: jest.fn() };
const mockMetricsService = {
  recordJobStart: jest.fn(),
  recordJobCompletion: jest.fn(),
  recordJobFailure: jest.fn(),
};

function makeProcessor() {
  return new NftMintProcessor(mockNftMintService as any, mockMetricsService as any);
}

function makeJob(overrides: Partial<NftMintJob> = {}): Job<NftMintJob> {
  return {
    id: 'nft-job-1',
    data: {
      clipId: 42,
      walletAddress: 'GABC...XYZ',
      userId: 7,
      ...overrides,
    },
    opts: { attempts: NFT_MINT_JOB_OPTIONS.attempts },
    attemptsMade: 0,
  } as unknown as Job<NftMintJob>;
}

beforeEach(() => jest.clearAllMocks());

// ── process() ─────────────────────────────────────────────────────────────────

describe('NftMintProcessor.process()', () => {
  it('calls prepareMintTx with clipId and walletAddress', async () => {
    mockNftMintService.prepareMintTx.mockResolvedValue({ xdr: 'signed-xdr-string' });
    const processor = makeProcessor();

    await processor.process(makeJob());

    expect(mockNftMintService.prepareMintTx).toHaveBeenCalledWith(42, 'GABC...XYZ');
  });

  it('returns xdr and clipId on success', async () => {
    mockNftMintService.prepareMintTx.mockResolvedValue({ xdr: 'valid-xdr' });
    const processor = makeProcessor();

    const result = await processor.process(makeJob());

    expect(result).toEqual({ xdr: 'valid-xdr', clipId: 42 });
  });

  it('records job start and completion(success) metrics', async () => {
    mockNftMintService.prepareMintTx.mockResolvedValue({ xdr: 'xdr' });
    const processor = makeProcessor();

    await processor.process(makeJob());

    expect(mockMetricsService.recordJobStart).toHaveBeenCalled();
    expect(mockMetricsService.recordJobCompletion).toHaveBeenCalledWith(
      expect.any(String),
      NFT_MINT_QUEUE,
      'success',
    );
    expect(mockMetricsService.recordJobFailure).not.toHaveBeenCalled();
  });

  it('records failure metric and rethrows on error', async () => {
    mockNftMintService.prepareMintTx.mockRejectedValue(new Error('Soroban RPC timeout'));
    const processor = makeProcessor();

    await expect(processor.process(makeJob())).rejects.toThrow('Soroban RPC timeout');

    expect(mockMetricsService.recordJobCompletion).toHaveBeenCalledWith(
      expect.any(String),
      NFT_MINT_QUEUE,
      'failure',
    );
    expect(mockMetricsService.recordJobFailure).toHaveBeenCalled();
  });

  it('throws so BullMQ can retry on transient blockchain failure', async () => {
    mockNftMintService.prepareMintTx.mockRejectedValue(new Error('network error'));
    const processor = makeProcessor();

    await expect(processor.process(makeJob())).rejects.toThrow('network error');
  });
});

// ── onFailed() ────────────────────────────────────────────────────────────────

describe('NftMintProcessor.onFailed()', () => {
  it('records final_failure metric', () => {
    const processor = makeProcessor();
    const job = makeJob();

    processor.onFailed(job, new Error('irreversible failure'));

    expect(mockMetricsService.recordJobFailure).toHaveBeenCalledWith(
      NFT_MINT_QUEUE,
      'final_failure',
    );
  });
});

// ── NFT_MINT_JOB_OPTIONS ──────────────────────────────────────────────────────

describe('NFT_MINT_JOB_OPTIONS', () => {
  it('configures 3 attempts with exponential backoff at 2000ms', () => {
    expect(NFT_MINT_JOB_OPTIONS.attempts).toBe(3);
    expect(NFT_MINT_JOB_OPTIONS.backoff.type).toBe('exponential');
    expect(NFT_MINT_JOB_OPTIONS.backoff.delay).toBe(2000);
  });
});
