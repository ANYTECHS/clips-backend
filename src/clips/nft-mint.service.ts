import { Injectable, Logger } from '@nestjs/common';

/**
 * BullMQ processor-level service for the nft-mint queue.
 * Actual minting logic is delegated to NftService in the nft module.
 */
@Injectable()
export class NftMintService {
  private readonly logger = new Logger(NftMintService.name);

  processJob(data: {
    clipId: number;
    creatorWallet: string;
    metadataUri?: string;
    royaltyBps?: number;
  }): void {
    this.logger.log(`NFT mint job received for clip ${data.clipId}`);
  }
}
