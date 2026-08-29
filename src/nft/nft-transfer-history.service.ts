import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import StellarSdk from '@stellar/stellar-sdk';
import { PrismaService } from '../prisma/prisma.service';
import { StellarService } from '../stellar/stellar.service';
import {
  GetNftTransfersQueryDto,
  PaginatedNftTransfersResponseDto,
} from './dto/nft-transfer-history.dto';

const TRANSFER_TOPIC = 'Transfer';
const POLL_INTERVAL_MS = 30_000;

/**
 * Indexes Soroban NFT Transfer events and serves paginated history (Issue #841).
 */
@Injectable()
export class NftTransferHistoryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NftTransferHistoryService.name);
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastCursor: string | undefined;
  private indexing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly stellarService: StellarService,
  ) {}

  private get CONTRACT_ID(): string {
    return (
      process.env.SOROBAN_NFT_CONTRACT_ID ||
      'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEU4'
    );
  }

  onModuleInit() {
    if (process.env.NFT_TRANSFER_INDEXER_DISABLED === 'true') {
      this.logger.warn('NFT transfer indexer disabled via NFT_TRANSFER_INDEXER_DISABLED');
      return;
    }
    // Defer first poll so app boot is not blocked
    setTimeout(() => this.pollTransferEvents(), 5_000);
    this.pollTimer = setInterval(() => this.pollTransferEvents(), POLL_INTERVAL_MS);
    this.logger.log('NFT transfer event indexer started');
  }

  onModuleDestroy() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /**
   * Paginated transfer history for a token, ordered by transferredAt descending.
   */
  async getTransfers(
    tokenId: number,
    query: GetNftTransfersQueryDto,
  ): Promise<PaginatedNftTransfersResponseDto> {
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
    const cursor = Math.max(query.cursor ?? 0, 0);

    const [total, rows] = await Promise.all([
      this.prisma.nftTransfer.count({ where: { tokenId } }),
      this.prisma.nftTransfer.findMany({
        where: { tokenId },
        orderBy: { transferredAt: 'desc' },
        skip: cursor,
        take: limit,
      }),
    ]);

    const end = cursor + rows.length;
    const nextCursor = end < total ? end : null;

    return {
      tokenId,
      transfers: rows.map((r) => ({
        id: r.id,
        tokenId: r.tokenId,
        fromAddress: r.fromAddress,
        toAddress: r.toAddress,
        txHash: r.txHash,
        transferredAt: r.transferredAt.toISOString(),
        salePrice: r.salePrice != null ? r.salePrice.toString() : null,
      })),
      nextCursor,
      total,
      limit,
      cursor,
    };
  }

  /**
   * Persist a transfer (used by indexer and tests).
   */
  async recordTransfer(input: {
    tokenId: number;
    fromAddress: string;
    toAddress: string;
    txHash: string;
    transferredAt: Date;
    salePrice?: bigint | null;
    contractId?: string;
  }) {
    return this.prisma.nftTransfer.upsert({
      where: {
        txHash_tokenId: {
          txHash: input.txHash,
          tokenId: input.tokenId,
        },
      },
      create: {
        tokenId: input.tokenId,
        fromAddress: input.fromAddress,
        toAddress: input.toAddress,
        txHash: input.txHash,
        transferredAt: input.transferredAt,
        salePrice: input.salePrice ?? null,
        contractId: input.contractId ?? this.CONTRACT_ID,
      },
      update: {},
    });
  }

  /**
   * Poll Soroban RPC for Transfer contract events and store them.
   */
  async pollTransferEvents(): Promise<number> {
    if (this.indexing) {
      return 0;
    }
    this.indexing = true;
    let stored = 0;

    try {
      const server = new StellarSdk.rpc.Server(this.stellarService.rpcUrl);
      const topicFilter = StellarSdk.nativeToScVal(TRANSFER_TOPIC);

      const request: Record<string, unknown> = {
        filters: [
          {
            type: 'contract',
            contractIds: [this.CONTRACT_ID],
            topics: [[topicFilter.toXDR('base64')]],
          },
        ],
        pagination: {
          limit: 100,
          ...(this.lastCursor ? { cursor: this.lastCursor } : {}),
        },
      };

      // Prefer getEvents when available on the RPC server instance
      const getEvents = (server as unknown as {
        getEvents?: (req: unknown) => Promise<{
          events?: Array<Record<string, unknown>>;
          cursor?: string;
          latestLedger?: number;
        }>;
      }).getEvents;

      if (!getEvents) {
        this.logger.debug('RPC getEvents unavailable; skipping transfer poll');
        return 0;
      }

      const response = await getEvents.call(server, request);
      const events = response?.events ?? [];

      for (const event of events) {
        const parsed = this.parseTransferEvent(event);
        if (!parsed) continue;

        try {
          await this.recordTransfer({
            ...parsed,
            contractId: this.CONTRACT_ID,
          });
          stored += 1;
        } catch (err) {
          this.logger.warn(
            `Failed to store transfer event: ${err instanceof Error ? err.message : err}`,
          );
        }
      }

      if (response?.cursor) {
        this.lastCursor = response.cursor;
      }

      if (stored > 0) {
        this.logger.log(`Indexed ${stored} NFT transfer event(s)`);
      }
    } catch (err) {
      this.logger.warn(
        `Transfer event poll failed: ${err instanceof Error ? err.message : err}`,
      );
    } finally {
      this.indexing = false;
    }

    return stored;
  }

  private parseTransferEvent(event: Record<string, unknown>): {
    tokenId: number;
    fromAddress: string;
    toAddress: string;
    txHash: string;
    transferredAt: Date;
    salePrice?: bigint | null;
  } | null {
    try {
      const txHash =
        (event.txHash as string) ||
        (event.transactionHash as string) ||
        (event.id as string)?.split(':')[0];
      if (!txHash) return null;

      let tokenId: number | undefined;
      let fromAddress: string | undefined;
      let toAddress: string | undefined;
      let salePrice: bigint | null = null;

      // Topic layout: ["Transfer", token_id, from, to] (common Soroban pattern)
      const topics = (event.topic ?? event.topics) as unknown[] | undefined;
      if (Array.isArray(topics) && topics.length >= 4) {
        tokenId = Number(this.scValishToNative(topics[1]));
        fromAddress = String(this.scValishToNative(topics[2]));
        toAddress = String(this.scValishToNative(topics[3]));
      }

      const value = event.value ?? event.data;
      if (value != null) {
        const native = this.scValishToNative(value);
        if (typeof native === 'bigint' || typeof native === 'number') {
          salePrice = BigInt(native);
        } else if (native && typeof native === 'object') {
          const obj = native as Record<string, unknown>;
          if (obj.token_id != null) tokenId = Number(obj.token_id);
          if (obj.from != null) fromAddress = String(obj.from);
          if (obj.to != null) toAddress = String(obj.to);
          if (obj.sale_price != null) salePrice = BigInt(obj.sale_price as number);
        }
      }

      if (
        tokenId == null ||
        !Number.isFinite(tokenId) ||
        !fromAddress ||
        !toAddress
      ) {
        return null;
      }

      const ledgerClose =
        (event.ledgerClosedAt as string) ||
        (event.createdAt as string) ||
        new Date().toISOString();

      return {
        tokenId,
        fromAddress,
        toAddress,
        txHash,
        transferredAt: new Date(ledgerClose),
        salePrice,
      };
    } catch {
      return null;
    }
  }

  private scValishToNative(value: unknown): unknown {
    if (value == null) return value;
    if (typeof value === 'string') {
      try {
        const scVal = StellarSdk.xdr.ScVal.fromXDR(value, 'base64');
        return StellarSdk.scValToNative(scVal);
      } catch {
        return value;
      }
    }
    if (typeof value === 'object' && value !== null && 'toXDR' in value) {
      try {
        return StellarSdk.scValToNative(value as never);
      } catch {
        return value;
      }
    }
    return value;
  }
}
