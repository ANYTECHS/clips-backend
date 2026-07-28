import { Injectable } from '@nestjs/common';

export type PayoutApprovalStatus = 'approved' | 'pending_approval';

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
    return this.requiresManualApproval(amount)
      ? 'pending_approval'
      : 'approved';
  }
}
