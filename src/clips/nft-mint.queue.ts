/**
 * NFT-mint queue — Soroban contract calls for minting clips as NFTs.
 * Medium-low priority: blockchain operations can be deferred slightly.
 */
export const NFT_MINT_QUEUE = 'nft-mint';
export const NFT_MINT_JOB = 'mint-nft';
export const NFT_MINT_QUEUE_PRIORITY = 4;

export interface NftMintJobData {
  clipId: number;
  userId: number;
  creatorWallet: string;
  metadataUri?: string;
  royaltyBps?: number;
}
