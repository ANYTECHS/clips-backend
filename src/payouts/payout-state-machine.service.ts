import {
  Injectable,
  Logger,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Payout State Machine
 *
 * Valid state transitions:
 * PENDING → PENDING_REVIEW (when amount >= approval threshold)
 * PENDING → APPROVED (when amount < approval threshold)
 * PENDING_REVIEW → APPROVED (admin approval)
 * PENDING_REVIEW → REJECTED (admin rejection)
 * APPROVED → PROCESSING (payment initiation)
 * PROCESSING → COMPLETED (success)
 * PROCESSING → PENDING_RETRY (temporary failure, retry scheduled)
 * PENDING_RETRY → PROCESSING (retry attempt)
 * Any state → FAILED (permanent failure)
 * PENDING_REVIEW → REJECTED (manual rejection)
 */

export type PayoutStatus =
  | 'pending'
  | 'pending_review'
  | 'approved'
  | 'processing'
  | 'pending_retry'
  | 'completed'
  | 'rejected'
  | 'failed';

export interface StateTransition {
  from: PayoutStatus;
  to: PayoutStatus;
  trigger: string;
}

@Injectable()
export class PayoutStateMachineService {
  private readonly logger = new Logger(PayoutStateMachineService.name);

  private readonly validTransitions: StateTransition[] = [
    // Initial states
    { from: 'pending', to: 'pending_review', trigger: 'submit_for_review' },
    { from: 'pending', to: 'approved', trigger: 'auto_approve' },

    // Review workflow
    { from: 'pending_review', to: 'approved', trigger: 'admin_approve' },
    { from: 'pending_review', to: 'rejected', trigger: 'admin_reject' },

    // Processing workflow
    { from: 'approved', to: 'processing', trigger: 'initiate_payment' },
    { from: 'processing', to: 'completed', trigger: 'confirm_payment' },
    { from: 'processing', to: 'pending_retry', trigger: 'schedule_retry' },
    { from: 'pending_retry', to: 'processing', trigger: 'retry_payment' },

    // Terminal states
    { from: 'processing', to: 'failed', trigger: 'permanent_failure' },
    { from: 'pending_retry', to: 'failed', trigger: 'max_retries_exceeded' },
  ];

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Validate if a state transition is allowed
   */
  isValidTransition(from: PayoutStatus, to: PayoutStatus): boolean {
    return this.validTransitions.some(
      (t) => t.from === from && t.to === to,
    );
  }

  /**
   * Get allowed next states from current state
   */
  getAllowedTransitions(currentStatus: PayoutStatus): PayoutStatus[] {
    return this.validTransitions
      .filter((t) => t.from === currentStatus)
      .map((t) => t.to);
  }

  /**
   * Safely transition payout to new state with validation
   */
  async transitionPayout(
    payoutId: number,
    userId: number,
    newStatus: PayoutStatus,
    additionalData?: {
      rejectionReason?: string;
      failureReason?: string;
      approvedAt?: Date;
      nextRetryAt?: Date;
      retryCount?: number;
      lastAttemptAt?: Date;
    },
  ): Promise<any> {
    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
      select: { id: true, userId: true, status: true, amount: true },
    });

    if (!payout || payout.userId !== userId) {
      throw new BadRequestException('Payout not found');
    }

    const currentStatus = payout.status as PayoutStatus;

    if (!this.isValidTransition(currentStatus, newStatus)) {
      throw new ConflictException(
        `Cannot transition payout from ${currentStatus} to ${newStatus}. ` +
          `Allowed states: ${this.getAllowedTransitions(currentStatus).join(', ')}`,
      );
    }

    this.logger.log(
      `Transitioning payout ${payoutId} from ${currentStatus} to ${newStatus}`,
    );

    const updateData: any = { status: newStatus };

    if (newStatus === 'approved' && !additionalData?.approvedAt) {
      updateData.approvedAt = new Date();
    } else if (additionalData?.approvedAt) {
      updateData.approvedAt = additionalData.approvedAt;
    }

    if (newStatus === 'rejected' && additionalData?.rejectionReason) {
      updateData.rejectedAt = new Date();
      updateData.rejectionReason = additionalData.rejectionReason;
    }

    if (newStatus === 'failed' && additionalData?.failureReason) {
      updateData.failureReason = additionalData.failureReason;
    }

    if (additionalData?.nextRetryAt) {
      updateData.nextRetryAt = additionalData.nextRetryAt;
    }

    if (additionalData?.lastAttemptAt) {
      updateData.lastAttemptAt = additionalData.lastAttemptAt;
    }

    if (
      additionalData?.retryCount !== undefined &&
      additionalData.retryCount >= 0
    ) {
      updateData.retryCount = additionalData.retryCount;
    }

    return this.prisma.payout.update({
      where: { id: payoutId },
      data: updateData,
    });
  }

  /**
   * Get payout with full context for state inspection
   */
  async getPayoutWithStatus(payoutId: number, userId: number) {
    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
      select: {
        id: true,
        userId: true,
        amount: true,
        status: true,
        retryCount: true,
        lastAttemptAt: true,
        nextRetryAt: true,
        rejectionReason: true,
        failureReason: true,
        approvedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!payout || payout.userId !== userId) {
      throw new BadRequestException('Payout not found');
    }

    return payout;
  }
}
