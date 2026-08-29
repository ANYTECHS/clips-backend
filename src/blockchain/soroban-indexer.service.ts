import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import StellarSdk from '@stellar/stellar-sdk';
import { PrismaService } from '../prisma/prisma.service';
import { StellarService } from '../stellar/stellar.service';
import { RoyaltyClaimHistoryService } from '../nft/royalty-claim-history.service';
import {
  CircuitBreakerService,
  CircuitBreakerConfig,
} from '../common/circuit-breaker/circuit-breaker.service';

const INDEXER_ID = 'soroban-nft';
const INDEXED_EVENT_TYPES = new Set([
  'Mint',
  'Transfer',
  'RoyaltyPaid',
  'Burn',
  'RoyaltyClaimed',
]);
const POLL_INTERVAL_MS = 15_000;
const MAX_EVENTS_PER_POLL = 100;
const MAX_FAILURES_BEFORE_BACKOFF = 5;

interface ParsedContractEvent {
  eventType: string;
  tokenId: number | null;
  fromAddress: string | null;
  toAddress: string | null;
  amount: string | null;
  asset: string | null;
  txHash: string;
  eventIndex: number;
  ledger: number;
  payload: Record<string, unknown>;
  claimedAt: Date;
}

/**
 * Polls Soroban RPC for NFT contract events and persists them (Issue #845).
 * Also feeds RoyaltyClaimed into royalty claim history (Issue #840).
 */
@Injectable()
export class SorobanIndexerService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(SorobanIndexerService.name);
  private running = false;
  private pollInFlight = false;

  private readonly circuitConfig: CircuitBreakerConfig = {
    name: 'soroban-indexer',
    failureThreshold: 5,
    recoveryTimeout: 30000,
    samplingDuration: 60000,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly stellarService: StellarService,
    private readonly circuitBreakerService: CircuitBreakerService,
    private readonly royaltyClaimHistoryService: RoyaltyClaimHistoryService,
  ) {}

  onApplicationBootstrap(): void {
    const contractId = process.env.SOROBAN_NFT_CONTRACT_ID?.trim();
    if (!contractId) {
      this.logger.warn(
        'SOROBAN_NFT_CONTRACT_ID unset — Soroban indexer disabled.',
      );
      return;
    }
    this.running = true;
    this.logger.log(
      `Soroban indexer enabled for contract ${contractId} on ${this.stellarService.network}`,
    );
  }

  onApplicationShutdown(): void {
    this.running = false;
  }

  @Interval(POLL_INTERVAL_MS)
  async poll(): Promise<void> {
    if (!this.running || this.pollInFlight) return;
    this.pollInFlight = true;
    try {
      await this.indexOnce();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Indexer poll failed (will retry): ${msg}`);
      await this.recordFailure(msg);
    } finally {
      this.pollInFlight = false;
    }
  }

  /**
   * Single indexing pass — safe to call manually for retries.
   */
  async indexOnce(): Promise<{ processed: number; skipped: number }> {
    const contractId = process.env.SOROBAN_NFT_CONTRACT_ID?.trim();
    if (!contractId) {
      return { processed: 0, skipped: 0 };
    }

    const state = await this.ensureState();
    if (state.failureCount >= MAX_FAILURES_BEFORE_BACKOFF) {
      // Allow retry after backoff window (failureCount reset on success)
      this.logger.warn(
        `Indexer has ${state.failureCount} consecutive failures — retrying anyway`,
      );
    }

    const server = new StellarSdk.rpc.Server(this.stellarService.rpcUrl);

    let latestLedger: number;
    try {
      const health = await this.circuitBreakerService.execute(
        this.circuitConfig,
        async () => server.getHealth(),
      );
      latestLedger = Number(
        (health as { latestLedger?: number }).latestLedger ?? 0,
      );
    } catch (err) {
      // Fallback: try getLatestLedger if available
      try {
        const latest = await this.circuitBreakerService.execute(
          this.circuitConfig,
          async () => (server as any).getLatestLedger(),
        );
        latestLedger = Number(latest?.sequence ?? latest?.ledger ?? 0);
      } catch {
        throw err;
      }
    }

    if (!latestLedger || latestLedger < 1) {
      throw new Error('Unable to determine latest ledger from Soroban RPC');
    }

    // Soroban getEvents requires startLedger within a recent window.
    // Resume from lastLedger+1, or start ~1000 ledgers behind tip on first run.
    const startLedger =
      state.lastLedger > 0
        ? state.lastLedger + 1
        : Math.max(1, latestLedger - 1000);

    if (startLedger > latestLedger) {
      await this.recordSuccess(state.lastLedger);
      return { processed: 0, skipped: 0 };
    }

    const response = await this.circuitBreakerService.execute(
      this.circuitConfig,
      async () =>
        server.getEvents({
          startLedger,
          endLedger: latestLedger,
          filters: [
            {
              type: 'contract',
              contractIds: [contractId],
            },
          ],
          limit: MAX_EVENTS_PER_POLL,
        } as any),
    );

    const events = (response as { events?: unknown[] }).events ?? [];
    let processed = 0;
    let skipped = 0;
    let maxLedger = state.lastLedger;

    for (let i = 0; i < events.length; i++) {
      const raw = events[i] as Record<string, unknown>;
      const parsed = this.parseEvent(raw, i);
      if (!parsed) {
        skipped++;
        continue;
      }

      if (parsed.ledger > maxLedger) {
        maxLedger = parsed.ledger;
      }

      if (!INDEXED_EVENT_TYPES.has(parsed.eventType)) {
        skipped++;
        continue;
      }

      const stored = await this.storeEvent(parsed);
      if (!stored) {
        skipped++;
        continue;
      }
      processed++;

      if (parsed.eventType === 'RoyaltyClaimed') {
        await this.royaltyClaimHistoryService.recordClaim({
          tokenId: parsed.tokenId ?? 0,
          recipient: parsed.toAddress ?? parsed.fromAddress ?? '',
          amount: parsed.amount ?? '0',
          assetContractId: parsed.asset,
          txHash: parsed.txHash,
          ledger: parsed.ledger,
          eventIndex: parsed.eventIndex,
          claimedAt: parsed.claimedAt,
        });
      }
    }

    // Advance cursor even when no matching events so we don't re-scan forever
    const advanceTo =
      events.length > 0
        ? Math.max(maxLedger, startLedger)
        : latestLedger;

    await this.recordSuccess(advanceTo);
    this.logger.debug(
      `Indexer pass complete — processed=${processed} skipped=${skipped} ledger=${advanceTo}`,
    );
    return { processed, skipped };
  }

  async listEvents(opts: {
    type?: string;
    tokenId?: number;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(100, Math.max(1, opts.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Prisma.BlockchainEventWhereInput = {};
    if (opts.type) {
      where.eventType = opts.type;
    }
    if (opts.tokenId != null) {
      where.tokenId = opts.tokenId;
    }

    const [total, rows] = await Promise.all([
      this.prisma.blockchainEvent.count({ where }),
      this.prisma.blockchainEvent.findMany({
        where,
        orderBy: [{ ledger: 'desc' }, { eventIndex: 'desc' }],
        skip,
        take: limit,
      }),
    ]);

    return {
      data: rows.map((row) => ({
        id: row.id,
        eventType: row.eventType,
        tokenId: row.tokenId,
        fromAddress: row.fromAddress,
        toAddress: row.toAddress,
        amount: row.amount,
        asset: row.asset,
        txHash: row.txHash,
        eventIndex: row.eventIndex,
        ledger: row.ledger,
        payload: (row.payload as Record<string, unknown> | null) ?? null,
        createdAt: row.createdAt,
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  private async storeEvent(event: ParsedContractEvent): Promise<boolean> {
    try {
      await this.prisma.blockchainEvent.create({
        data: {
          eventType: event.eventType,
          tokenId: event.tokenId,
          fromAddress: event.fromAddress,
          toAddress: event.toAddress,
          amount: event.amount,
          asset: event.asset,
          txHash: event.txHash,
          eventIndex: event.eventIndex,
          ledger: event.ledger,
          payload: event.payload as Prisma.InputJsonValue,
        },
      });
      return true;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        return false;
      }
      throw err;
    }
  }

  private parseEvent(
    raw: Record<string, unknown>,
    fallbackIndex: number,
  ): ParsedContractEvent | null {
    try {
      const txHash = String(
        raw.txHash ?? raw.transactionHash ?? raw.id ?? '',
      );
      if (!txHash) return null;

      const ledger = Number(raw.ledger ?? raw.ledgerCloseTime ?? 0);
      const eventIndex = Number(
        raw.eventIndex ?? raw.id ?? fallbackIndex,
      );

      const topicVals = this.decodeTopics(raw.topic ?? raw.topics);
      const eventType = String(topicVals[0] ?? '').replace(/^["']|["']$/g, '');
      if (!eventType) return null;

      const valueNative = this.decodeValue(raw.value);
      const payload: Record<string, unknown> = {
        topics: topicVals,
        value: valueNative,
      };

      const tokenId = this.extractTokenId(topicVals, valueNative);
      const fromAddress = this.extractAddress(topicVals, valueNative, [
        'from',
        'owner',
        'payer',
      ]);
      const toAddress = this.extractAddress(topicVals, valueNative, [
        'to',
        'recipient',
        'buyer',
      ]);
      const amount = this.extractAmount(valueNative, topicVals);
      const asset = this.extractAsset(valueNative, topicVals);

      return {
        eventType,
        tokenId,
        fromAddress,
        toAddress,
        amount,
        asset,
        txHash,
        eventIndex: Number.isFinite(eventIndex) ? eventIndex : fallbackIndex,
        ledger: Number.isFinite(ledger) ? ledger : 0,
        payload,
        claimedAt: new Date(),
      };
    } catch (err) {
      this.logger.debug(
        `Failed to parse contract event: ${err instanceof Error ? err.message : err}`,
      );
      return null;
    }
  }

  private decodeTopics(topics: unknown): unknown[] {
    if (!Array.isArray(topics)) return [];
    return topics.map((t) => {
      try {
        if (typeof t === 'string') {
          // May already be symbol/string or XDR
          try {
            const scVal = StellarSdk.xdr.ScVal.fromXDR(t, 'base64');
            return StellarSdk.scValToNative(scVal);
          } catch {
            return t;
          }
        }
        if (t && typeof t === 'object' && 'toXDR' in (t as object)) {
          return StellarSdk.scValToNative(t as any);
        }
        return t;
      } catch {
        return t;
      }
    });
  }

  private decodeValue(value: unknown): unknown {
    if (value == null) return null;
    try {
      if (typeof value === 'string') {
        try {
          const scVal = StellarSdk.xdr.ScVal.fromXDR(value, 'base64');
          return StellarSdk.scValToNative(scVal);
        } catch {
          return value;
        }
      }
      if (typeof value === 'object' && value !== null && 'toXDR' in value) {
        return StellarSdk.scValToNative(value as any);
      }
      return value;
    } catch {
      return value;
    }
  }

  private extractTokenId(
    topics: unknown[],
    value: unknown,
  ): number | null {
    for (const t of topics.slice(1)) {
      const n = this.toPositiveInt(t);
      if (n != null) return n;
    }
    if (value && typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      for (const key of ['token_id', 'tokenId', 'id']) {
        const n = this.toPositiveInt(obj[key]);
        if (n != null) return n;
      }
    }
    return this.toPositiveInt(value);
  }

  private extractAddress(
    topics: unknown[],
    value: unknown,
    keys: string[],
  ): string | null {
    if (value && typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      for (const key of keys) {
        const v = obj[key];
        if (typeof v === 'string' && v.startsWith('G')) return v;
      }
    }
    for (const t of topics) {
      if (typeof t === 'string' && (t.startsWith('G') || t.startsWith('C'))) {
        return t;
      }
    }
    return null;
  }

  private extractAmount(value: unknown, topics: unknown[]): string | null {
    if (value && typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      for (const key of ['amount', 'royalty', 'value', 'paid']) {
        if (obj[key] != null) return String(obj[key]);
      }
    }
    if (typeof value === 'bigint' || typeof value === 'number') {
      return String(value);
    }
    for (const t of topics.slice(1)) {
      if (typeof t === 'bigint' || typeof t === 'number') return String(t);
    }
    return null;
  }

  private extractAsset(value: unknown, topics: unknown[]): string | null {
    if (value && typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      for (const key of ['asset', 'asset_contract', 'token']) {
        const v = obj[key];
        if (typeof v === 'string') return v;
      }
    }
    for (const t of topics) {
      if (typeof t === 'string' && t.startsWith('C')) return t;
    }
    return null;
  }

  private toPositiveInt(v: unknown): number | null {
    if (typeof v === 'bigint') {
      const n = Number(v);
      return n > 0 ? n : null;
    }
    if (typeof v === 'number' && Number.isInteger(v) && v > 0) return v;
    if (typeof v === 'string' && /^\d+$/.test(v)) {
      const n = parseInt(v, 10);
      return n > 0 ? n : null;
    }
    return null;
  }

  private async ensureState() {
    return this.prisma.indexerState.upsert({
      where: { id: INDEXER_ID },
      create: { id: INDEXER_ID, lastLedger: 0 },
      update: {},
    });
  }

  private async recordSuccess(lastLedger: number): Promise<void> {
    await this.prisma.indexerState.upsert({
      where: { id: INDEXER_ID },
      create: {
        id: INDEXER_ID,
        lastLedger,
        failureCount: 0,
        lastError: null,
      },
      update: {
        lastLedger,
        failureCount: 0,
        lastError: null,
      },
    });
  }

  private async recordFailure(error: string): Promise<void> {
    await this.prisma.indexerState.upsert({
      where: { id: INDEXER_ID },
      create: {
        id: INDEXER_ID,
        lastLedger: 0,
        failureCount: 1,
        lastError: error.slice(0, 1000),
      },
      update: {
        failureCount: { increment: 1 },
        lastError: error.slice(0, 1000),
      },
    });
  }
}
