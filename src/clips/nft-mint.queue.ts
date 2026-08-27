/**
 * BullMQ queue name and priority constants for the nft-mint queue.
 * Jobs on this queue interact with the Stellar Soroban NFT contract.
 */
export const NFT_MINT_QUEUE = 'nft-mint';
export const NFT_MINT_JOB = 'mint-nft';

/**
 * NFT mint jobs are medium priority — they are user-initiated but less
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
export const NFT_MINT_QUEUE = 'nft-mint';
export const NFT_MINT_JOB = 'mint-nft';
export const NFT_MINT_QUEUE_PRIORITY = 4;
export interface NftMintJobData { clipId: number; walletAddress: string; metadataUri: string; royaltyBps?: number; userId: number }
export const NFT_MINT_JOB_OPTIONS = { attempts: 3, backoff: { type: 'exponential' as const, delay: 2000 }, removeOnComplete: false, removeOnFail: false, priority: NFT_MINT_QUEUE_PRIORITY } as const;
/**
 * NFT Mint queue name and priority constant.
 * Used by BullMQ queue registration across the application.
 */
export const NFT_MINT_QUEUE = 'nft-mint';
export const NFT_MINT_QUEUE_PRIORITY = 3;
