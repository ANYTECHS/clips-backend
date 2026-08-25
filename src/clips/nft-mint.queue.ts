export const NFT_MINT_QUEUE = 'nft-mint';
export const NFT_MINT_JOB = 'mint-nft';
export const NFT_MINT_QUEUE_PRIORITY = 4;
export interface NftMintJobData { clipId: number; walletAddress: string; metadataUri: string; royaltyBps?: number; userId: number }
export const NFT_MINT_JOB_OPTIONS = { attempts: 3, backoff: { type: 'exponential' as const, delay: 2000 }, removeOnComplete: false, removeOnFail: false, priority: NFT_MINT_QUEUE_PRIORITY } as const;
