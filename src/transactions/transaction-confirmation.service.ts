import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { StellarService } from '../stellar/stellar.service';
import {
  TransactionStatus,
  TransactionStatusResponseDto,
} from './dto/transaction-status.dto';

const PENDING_POLL_BATCH = 50;

/**
 * Tracks submitted Soroban / Stellar transactions until confirmed or failed
 * (Issue #846). Stores the hash, polls Horizon, and exposes the latest status
 * via GET /transactions/:hash.
 */
@Injectable()
export class TransactionConfirmationService {
  private readonly logger = new Logger(TransactionConfirmationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stellar: StellarService,
  ) {}

  /**
   * Begin (or refresh) tracking for a submitted transaction hash.
   */
  async track(
    hash: string,
    label?: string,
    userId?: number,
  ): Promise<TransactionStatusResponseDto> {
    const normalized = this.normalizeHash(hash);

    const existing = await this.prisma.trackedTransaction.findUnique({
      where: { hash: normalized },
    });

    if (existing && existing.status !== TransactionStatus.PENDING) {
      return this.toDto(existing);
    }

    const now = new Date();
    const row = await this.prisma.trackedTransaction.upsert({
      where: { hash: normalized },
      create: {
        hash: normalized,
        status: TransactionStatus.PENDING,
        label: label ?? null,
        userId: userId ?? null,
        submittedAt: now,
        lastCheckedAt: now,
      },
      update: {
        label: label ?? existing?.label ?? null,
        lastCheckedAt: now,
      },
    });

    // Immediate poll so the caller may get a non-pending status right away.
    return this.refreshOne(row.hash);
  }

  /**
   * Return the latest known status for a hash, refreshing from the network
   * when still pending.
   */
  async getStatus(hash: string): Promise<TransactionStatusResponseDto> {
    const normalized = this.normalizeHash(hash);
    const row = await this.prisma.trackedTransaction.findUnique({
      where: { hash: normalized },
    });

    if (!row) {
      // Opportunistically look up on Horizon so clients can query any hash.
      const live = await this.stellar.getTransactionStatus(normalized);
      if (!live.found) {
        throw new NotFoundException(
          `No tracked transaction found for hash ${normalized}`,
        );
      }

      const created = await this.prisma.trackedTransaction.create({
        data: {
          hash: normalized,
          status: live.successful
            ? TransactionStatus.CONFIRMED
            : TransactionStatus.FAILED,
          submittedAt: live.confirmedAt ?? new Date(),
          confirmedAt: live.confirmedAt ?? new Date(),
          failureReason: live.successful
            ? null
            : 'Transaction unsuccessful on Horizon',
          lastCheckedAt: new Date(),
        },
      });
      return this.toDto(created);
    }

    if (row.status === TransactionStatus.PENDING) {
      return this.refreshOne(row.hash);
    }

    return this.toDto(row);
  }

  /** Poll all pending transactions (scheduled). */
  @Interval(15_000)
  async pollPending(): Promise<void> {
    const pending = await this.prisma.trackedTransaction.findMany({
      where: { status: TransactionStatus.PENDING },
      take: PENDING_POLL_BATCH,
      orderBy: { lastCheckedAt: 'asc' },
    });

    if (pending.length === 0) {
      return;
    }

    this.logger.debug(`Polling ${pending.length} pending transaction(s)`);
    for (const row of pending) {
      try {
        await this.refreshOne(row.hash);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Failed to refresh tx ${row.hash}: ${msg}`);
      }
    }
  }

  private async refreshOne(hash: string): Promise<TransactionStatusResponseDto> {
    const live = await this.stellar.getTransactionStatus(hash);
    const now = new Date();

    if (!live.found) {
      const updated = await this.prisma.trackedTransaction.update({
        where: { hash },
        data: { lastCheckedAt: now },
      });
      return this.toDto(updated);
    }

    const status = live.successful
      ? TransactionStatus.CONFIRMED
      : TransactionStatus.FAILED;

    const updated = await this.prisma.trackedTransaction.update({
      where: { hash },
      data: {
        status,
        confirmedAt: live.confirmedAt ?? now,
        failureReason: live.successful
          ? null
          : 'Transaction unsuccessful on Horizon',
        lastCheckedAt: now,
      },
    });

    this.logger.log(`Transaction ${hash} → ${status}`);
    return this.toDto(updated);
  }

  private normalizeHash(hash: string): string {
    const trimmed = (hash ?? '').trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(trimmed)) {
      throw new BadRequestException(
        'Transaction hash must be a 64-character hex string',
      );
    }
    return trimmed;
  }

  private toDto(row: {
    hash: string;
    status: string;
    label: string | null;
    submittedAt: Date;
    confirmedAt: Date | null;
    failureReason: string | null;
    lastCheckedAt: Date;
  }): TransactionStatusResponseDto {
    return {
      hash: row.hash,
      status: row.status as TransactionStatus,
      label: row.label,
      submittedAt: row.submittedAt.toISOString(),
      confirmedAt: row.confirmedAt ? row.confirmedAt.toISOString() : null,
      failureReason: row.failureReason,
      lastCheckedAt: row.lastCheckedAt.toISOString(),
    };
  }
}
