import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface RoyaltyClaimRecordInput {
  tokenId: number;
  recipient: string;
  amount: string;
  assetContractId?: string | null;
  txHash: string;
  ledger?: number | null;
  eventIndex?: number | null;
  claimedAt: Date;
}

export interface RoyaltyClaimHistoryResult {
  data: Array<{
    id: number;
    tokenId: number;
    recipient: string;
    amount: string;
    assetContractId: string | null;
    txHash: string;
    ledger: number | null;
    claimedAt: Date;
    createdAt: Date;
  }>;
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

/**
 * Persists and serves royalty claim history (Issue #840).
 * Records are written by the Soroban indexer when `RoyaltyClaimed` is observed.
 */
@Injectable()
export class RoyaltyClaimHistoryService {
  private readonly logger = new Logger(RoyaltyClaimHistoryService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Idempotent insert — duplicate `txHash` is ignored.
   */
  async recordClaim(input: RoyaltyClaimRecordInput): Promise<boolean> {
    try {
      await this.prisma.royaltyClaim.create({
        data: {
          tokenId: input.tokenId,
          recipient: input.recipient,
          amount: input.amount,
          assetContractId: input.assetContractId ?? null,
          txHash: input.txHash,
          ledger: input.ledger ?? null,
          eventIndex: input.eventIndex ?? null,
          claimedAt: input.claimedAt,
        },
      });
      return true;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        this.logger.debug(
          `Skipping duplicate royalty claim txHash=${input.txHash}`,
        );
        return false;
      }
      throw err;
    }
  }

  async getHistory(
    tokenId: number,
    page = 1,
    limit = 20,
  ): Promise<RoyaltyClaimHistoryResult> {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(100, Math.max(1, limit));
    const skip = (safePage - 1) * safeLimit;

    const [total, rows] = await Promise.all([
      this.prisma.royaltyClaim.count({ where: { tokenId } }),
      this.prisma.royaltyClaim.findMany({
        where: { tokenId },
        orderBy: { claimedAt: 'desc' },
        skip,
        take: safeLimit,
      }),
    ]);

    return {
      data: rows.map((row) => ({
        id: row.id,
        tokenId: row.tokenId,
        recipient: row.recipient,
        amount: row.amount,
        assetContractId: row.assetContractId,
        txHash: row.txHash,
        ledger: row.ledger,
        claimedAt: row.claimedAt,
        createdAt: row.createdAt,
      })),
      meta: {
        total,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.max(1, Math.ceil(total / safeLimit)),
      },
    };
  }
}
