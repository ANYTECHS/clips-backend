/**
 * BullMQ queue name and priority constants for the nft-mint queue.
 * Jobs on this queue interact with the Stellar Soroban NFT contract.
 *
 * Dedicated queue (Issue #923): NFT minting involves blockchain transactions
 * and is isolated from video processing workloads so clip generation never
 * blocks minting. Mint jobs have independent retry behavior.
 */
export const NFT_MINT_QUEUE = 'nft-mint';
export const NFT_MINT_JOB = 'mint-nft';

/**
 * NFT mint jobs are medium priority - they are user-initiated but less
 * time-sensitive than clip generation.
 */
export const NFT_MINT_QUEUE_PRIORITY = 4;

export interface NftMintJobData {
  clipId: number;
  walletAddress: string;
  metadataUri: string;
  royaltyBps?: number;
  userId: number;
}

/**
 * Transaction states for an NFT mint job.
 * Returned by the mint status endpoint alongside the BullMQ jobId.
 */
export const NFT_MINT_TX_STATES = [
  'queued',
  'active',
  'completed',
  'failed',
  'delayed',
] as const;

export type NftMintTxState = (typeof NFT_MINT_TX_STATES)[number];

/**
 * Deterministic jobId for a clip mint request.
 * Enqueuing with the same jobId prevents duplicate mint jobs for the same
 * clip - BullMQ treats a second add with an existing jobId as a duplicate
 * (HTTP 409 duplicate-mint response).
 */
export function getNftMintJobId(clipId: number): string {
  return `nft-mint-clip-${clipId}`;
}

export const NFT_MINT_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 2000,
  },
  removeOnComplete: false,
  removeOnFail: false,
  priority: NFT_MINT_QUEUE_PRIORITY,
} as const;

/**
 * Deduplication options for enqueuing a mint job.
 * Usage: queue.add(NFT_MINT_JOB, data, getNftMintDedupOptions(clipId)).
 * BullMQ drops a second add with the same id (surfaced as HTTP 409 duplicate-mint).
 */
export function getNftMintDedupOptions(clipId: number) {
  return { deduplication: { id: getNftMintJobId(clipId) } } as const;
}
