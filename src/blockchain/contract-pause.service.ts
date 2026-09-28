import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ContractPauseStatusDto } from './dto/contract-pause.dto';

/** Duration of the timelock before a scheduled pause becomes active (24 h). */
const TIMELOCK_MS = 24 * 60 * 60 * 1000;

/**
 * Manages the Soroban NFT contract pause lifecycle with a 24-hour timelock.
 *
 * Flow:
 *  1. Admin calls schedulePause()  → creates a ContractPauseSchedule row.
 *  2. 24 hours must elapse before the pause is "activatable".
 *  3. The SorobanIndexerService calls activatePendingPause() when it sees a
 *     `Paused` event on-chain — that event is the actual activation signal.
 *  4. Admin calls cancelPause() at any time before activation to abort.
 *  5. When an `Unpaused` event is indexed the record is left as-is; the absence
 *     of an active (non-cancelled, non-null activatedAt) row means not paused.
 *
 * Mint / transfer guard:
 *  Call assertNotPaused() at the start of any service method that should be
 *  blocked while the contract is paused.
 */
@Injectable()
export class ContractPauseService {
  private readonly logger = new Logger(ContractPauseService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Schedule a pause with a 24-hour timelock.
   * Throws if there is already a pending or active pause.
   */
  async schedulePause(
    adminAddress: string,
    reason?: string,
  ): Promise<ContractPauseStatusDto> {
    this.assertAdmin(adminAddress);

    // Reject if there is already an active pause.
    if (await this.isPaused()) {
      throw new BadRequestException('Contract is already paused.');
    }

    // Reject if there is a pending (not yet activated, not cancelled) request.
    const existing = await this.findPending();
    if (existing) {
      throw new BadRequestException(
        `A pause is already scheduled for ${existing.scheduledFor.toISOString()}. Cancel it first.`,
      );
    }

    const requestedAt = new Date();
    const scheduledFor = new Date(requestedAt.getTime() + TIMELOCK_MS);

    const record = await this.prisma.contractPauseSchedule.create({
      data: {
        requestedBy: adminAddress,
        requestedAt,
        scheduledFor,
        reason: reason ?? null,
      },
    });

    this.logger.log(
      `Pause scheduled by ${adminAddress}. Active after: ${scheduledFor.toISOString()}`,
    );

    return this.toStatusDto({
      isPaused: false,
      hasPendingPause: true,
      record,
    });
  }

  /**
   * Cancel a pending pause before it becomes active.
   * Throws if there is no pending pause or if it is already activated.
   */
  async cancelPause(adminAddress: string): Promise<ContractPauseStatusDto> {
    this.assertAdmin(adminAddress);

    const pending = await this.findPending();
    if (!pending) {
      throw new NotFoundException('No pending pause request found to cancel.');
    }

    if (pending.activatedAt) {
      throw new BadRequestException(
        'Cannot cancel a pause that has already been activated.',
      );
    }

    const updated = await this.prisma.contractPauseSchedule.update({
      where: { id: pending.id },
      data: {
        cancelledAt: new Date(),
        cancelledBy: adminAddress,
      },
    });

    this.logger.log(`Pause cancelled by ${adminAddress}.`);

    return this.toStatusDto({ isPaused: false, hasPendingPause: false, record: updated });
  }

  /**
   * Returns true when there is an activated, non-cancelled pause record.
   */
  async isPaused(): Promise<boolean> {
    const active = await this.prisma.contractPauseSchedule.findFirst({
      where: {
        activatedAt: { not: null },
        cancelledAt: null,
      },
      orderBy: { activatedAt: 'desc' },
    });
    return active !== null;
  }

  /**
   * Returns the current pause status as a response DTO.
   */
  async getPauseStatus(): Promise<ContractPauseStatusDto> {
    // Prefer the most recently activated (non-cancelled) record.
    const active = await this.prisma.contractPauseSchedule.findFirst({
      where: { activatedAt: { not: null }, cancelledAt: null },
      orderBy: { activatedAt: 'desc' },
    });

    if (active) {
      return this.toStatusDto({ isPaused: true, hasPendingPause: false, record: active });
    }

    // Fall back to the pending (not yet activated, not cancelled) record.
    const pending = await this.findPending();
    if (pending) {
      return this.toStatusDto({ isPaused: false, hasPendingPause: true, record: pending });
    }

    return this.toStatusDto({ isPaused: false, hasPendingPause: false, record: null });
  }

  /**
   * Called by the Soroban indexer when a `Paused` event is observed on-chain.
   *
   * Activates the pending pause only when:
   *  - There is a pending (non-cancelled, non-activated) schedule row.
   *  - The 24-hour timelock has elapsed (scheduledFor <= now).
   *
   * Returns true when the activation succeeds, false otherwise.
   */
  async activatePendingPause(): Promise<boolean> {
    const pending = await this.findPending();
    if (!pending) {
      this.logger.warn(
        'activatePendingPause called but no pending schedule found — ignoring.',
      );
      return false;
    }

    const now = new Date();
    if (pending.scheduledFor > now) {
      this.logger.warn(
        `Paused event received before timelock expired ` +
          `(scheduledFor=${pending.scheduledFor.toISOString()}, now=${now.toISOString()}) — activation blocked.`,
      );
      return false;
    }

    await this.prisma.contractPauseSchedule.update({
      where: { id: pending.id },
      data: { activatedAt: now },
    });

    this.logger.log(`Contract pause ACTIVATED (id=${pending.id}).`);
    return true;
  }

  /**
   * Called by the Soroban indexer when an `Unpaused` event is observed.
   * Marks the active pause record as cancelled so subsequent isPaused() calls
   * return false.
   */
  async deactivatePause(): Promise<void> {
    const active = await this.prisma.contractPauseSchedule.findFirst({
      where: { activatedAt: { not: null }, cancelledAt: null },
      orderBy: { activatedAt: 'desc' },
    });

    if (!active) {
      this.logger.warn(
        'deactivatePause called but no active pause found — ignoring.',
      );
      return;
    }

    await this.prisma.contractPauseSchedule.update({
      where: { id: active.id },
      data: { cancelledAt: new Date() },
    });

    this.logger.log(`Contract pause DEACTIVATED (id=${active.id}).`);
  }

  /**
   * Throws a 403 ForbiddenException if the contract is currently paused.
   * Call this at the top of mint / transfer service methods.
   */
  async assertNotPaused(): Promise<void> {
    if (await this.isPaused()) {
      throw new ForbiddenException(
        'Contract is paused. Minting and transfers are blocked.',
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /** Returns the first pending (not cancelled, not yet activated) schedule. */
  private async findPending() {
    return this.prisma.contractPauseSchedule.findFirst({
      where: { activatedAt: null, cancelledAt: null },
      orderBy: { requestedAt: 'desc' },
    });
  }

  /**
   * Validates the caller is the configured admin.
   * The admin address is read from ADMIN_STELLAR_ADDRESS env var.
   */
  private assertAdmin(address: string): void {
    const adminAddress = process.env.ADMIN_STELLAR_ADDRESS?.trim();
    if (!adminAddress) {
      throw new ForbiddenException(
        'ADMIN_STELLAR_ADDRESS is not configured — admin operations are disabled.',
      );
    }
    if (address !== adminAddress) {
      throw new ForbiddenException(
        'Caller is not authorized to perform pause operations.',
      );
    }
  }

  private toStatusDto(opts: {
    isPaused: boolean;
    hasPendingPause: boolean;
    record: {
      requestedAt: Date;
      scheduledFor: Date;
      activatedAt: Date | null;
      cancelledAt: Date | null;
      cancelledBy?: string | null;
      reason: string | null;
      requestedBy: string;
    } | null;
  }): ContractPauseStatusDto {
    const { isPaused, hasPendingPause, record } = opts;
    return {
      isPaused,
      hasPendingPause,
      requestedAt: record?.requestedAt.toISOString() ?? null,
      scheduledFor: record?.scheduledFor.toISOString() ?? null,
      activatedAt: record?.activatedAt?.toISOString() ?? null,
      cancelledAt: record?.cancelledAt?.toISOString() ?? null,
      reason: record?.reason ?? null,
      requestedBy: record?.requestedBy ?? null,
    };
  }
}
