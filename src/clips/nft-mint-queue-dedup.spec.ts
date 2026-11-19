import {
  NFT_MINT_JOB_OPTIONS,
  NFT_MINT_QUEUE,
  NFT_MINT_QUEUE_PRIORITY,
  NFT_MINT_TX_STATES,
  getNftMintDedupOptions,
  getNftMintJobId,
} from './nft-mint.queue';

describe('nft-mint queue (Issue #923)', () => {
  it('uses the dedicated nft-mint queue isolated from video processing', () => {
    expect(NFT_MINT_QUEUE).toBe('nft-mint');
  });

  it('has independent retry behavior (attempts + exponential backoff)', () => {
    expect(NFT_MINT_JOB_OPTIONS.attempts).toBe(3);
    expect(NFT_MINT_JOB_OPTIONS.backoff).toEqual({
      type: 'exponential',
      delay: 2000,
    });
    expect(NFT_MINT_QUEUE_PRIORITY).toBe(4);
  });

  it('generates a deterministic jobId per clip for duplicate prevention', () => {
    expect(getNftMintJobId(42)).toBe('nft-mint-clip-42');
    expect(getNftMintJobId(42)).toBe(getNftMintJobId(42));
    expect(getNftMintJobId(42)).not.toBe(getNftMintJobId(43));
  });

  it('returns deduplication options keyed by clip', () => {
    expect(getNftMintDedupOptions(42)).toEqual({
      deduplication: { id: 'nft-mint-clip-42' },
    });
  });

  it('documents transaction states for the mint status endpoint', () => {
    expect([...NFT_MINT_TX_STATES]).toEqual([
      'queued',
      'active',
      'completed',
      'failed',
      'delayed',
    ]);
  });
});
