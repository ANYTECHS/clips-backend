import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type MintStage = 'none' | 'upload' | 'prepare' | 'submit' | 'confirm' | 'fail';

export interface MintStatusResult {
  id: number;
  clipId: number;
  stage: MintStage;
  txHash: string | null;
  retryCount: number;
  nextRetryAt: Date | null;
  failureReason: string | null;
  permanentFailure: boolean;
  metadataUri: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * NftMintStatusService
 *
 * Provides a single source of truth for the complete NFT minting lifecycle.
 * Each clip has at most one NftMintStatus row; this service creates it on
 * first access and updates it as stages progress.
 *
 * Lifecycle stages:
 *   none → upload → prepare → submit → confirm
 *                                    ↘ fail (retryable or permanent)
 *
 * Closes #849.
 */
@Injectable()
export class NftMintStatusService {
  private readonly logger = new Logger(NftMintStatusService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Fetch the current mint status for a clip.
   * Creates a 'none' record if one doesn't exist yet.
   * Throws NotFoundException when the clip itself does not exist.
   */
  async getOrCreate(clipId: number): Promise<MintStatusResult> {
    // Verify clip exists first
    const clip = await this.prisma.clip.findUnique({ where: { id: clipId } });
    if (!clip) throw new NotFoundException(`Clip ${clipId} not found`);

    const existing = await this.prisma.nftMintStatus.findUnique({
      where: { clipId },
    });
    if (existing) return existing as MintStatusResult;

    const created = await this.prisma.nftMintStatus.create({
      data: { clipId, stage: 'none' },
    });
    this.logger.log(`Created initial NftMintStatus (stage=none) for clip ${clipId}`);
    return created as MintStatusResult;
  }

  /**
   * Advance to the 'upload' stage and record the IPFS metadataUri.
   * Called immediately after IPFS upload succeeds.
   */
  async markUploaded(clipId: number, metadataUri: string): Promise<MintStatusResult> {
    this.logger.log(`Clip ${clipId} mint stage → upload (uri=${metadataUri})`);
    return this.upsert(clipId, { stage: 'upload', metadataUri }) as Promise<MintStatusResult>;
  }

  /**
   * Advance to the 'prepare' stage (unsigned Soroban transaction built).
   */
  async markPrepared(clipId: number): Promise<MintStatusResult> {
    this.logger.log(`Clip ${clipId} mint stage → prepare`);
    return this.upsert(clipId, { stage: 'prepare' }) as Promise<MintStatusResult>;
  }

  /**
   * Advance to the 'submit' stage and record the on-chain txHash.
   * Called after the signed transaction is broadcast to the Stellar network.
   */
  async markSubmitted(clipId: number, txHash: string): Promise<MintStatusResult> {
    this.logger.log(`Clip ${clipId} mint stage → submit (txHash=${txHash})`);
    return this.upsert(clipId, { stage: 'submit', txHash }) as Promise<MintStatusResult>;
  }

  /**
   * Advance to the 'confirm' stage.
   * Called after on-chain confirmation is received from the Stellar network.
   */
  async markConfirmed(clipId: number): Promise<MintStatusResult> {
    this.logger.log(`Clip ${clipId} mint stage → confirm`);
    return this.upsert(clipId, { stage: 'confirm' }) as Promise<MintStatusResult>;
  }

  /**
   * Record a failure.
   * @param permanentFailure - when true, the transaction will not be retried
   *   (max retries exhausted or non-recoverable error).
   */
  async markFailed(
    clipId: number,
    failureReason: string,
    permanentFailure = false,
  ): Promise<MintStatusResult> {
    this.logger.warn(
      `Clip ${clipId} mint stage → fail (permanent=${permanentFailure}): ${failureReason}`,
    );
    return this.upsert(clipId, {
      stage: 'fail',
      failureReason,
      permanentFailure,
    }) as Promise<MintStatusResult>;
  }

  /**
   * Increment the retry counter and set the next allowed retry timestamp.
   * Should be called alongside markFailed for retryable failures.
   */
  async recordRetryAttempt(clipId: number, nextRetryAt: Date): Promise<MintStatusResult> {
    const status = await this.prisma.nftMintStatus.findUnique({ where: { clipId } });
    if (!status) {
      throw new NotFoundException(`NftMintStatus for clip ${clipId} not found`);
    }

    const updated = await this.prisma.nftMintStatus.update({
      where: { clipId },
      data: {
        retryCount: status.retryCount + 1,
        nextRetryAt,
      },
    });
    this.logger.log(
      `Clip ${clipId} retry attempt ${updated.retryCount}, next at ${nextRetryAt.toISOString()}`,
    );
    return updated as MintStatusResult;
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private async upsert(
    clipId: number,
    data: Partial<{
      stage: MintStage;
      txHash: string;
      metadataUri: string;
      failureReason: string;
      permanentFailure: boolean;
    }>,
  ) {
    return this.prisma.nftMintStatus.upsert({
      where: { clipId },
      create: { clipId, stage: 'none', ...data },
      update: data,
    });
  }
}
