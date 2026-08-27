import { Injectable } from '@nestjs/common';

export type PayoutApprovalStatus = 'approved' | 'pending_approval' | 'pending_review';

@Injectable()
export class PayoutApprovalService {
  private readonly approvalThreshold: number;

  constructor() {
    this.approvalThreshold = parseFloat(
      process.env.PAYOUT_APPROVAL_THRESHOLD ?? '500',
    );
  }

  getApprovalThreshold(): number {
    return this.approvalThreshold;
  }

  requiresManualApproval(amount: number): boolean {
    return amount >= this.approvalThreshold;
  }

  resolveInitialStatus(amount: number): PayoutApprovalStatus {
    if (!this.requiresManualApproval(amount)) {
      return 'approved';
    }
    return 'pending_review';
  }

  canApprove(status: string): boolean {
    return ['pending', 'pending_review', 'pending_approval'].includes(status);
  }

  canReject(status: string): boolean {
    return ['pending', 'pending_review', 'pending_approval', 'approved'].includes(status);
  }
}
