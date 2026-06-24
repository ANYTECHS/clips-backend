import { PayoutApprovalService } from './payout-approval.service';

describe('PayoutApprovalService', () => {
  const originalThreshold = process.env.PAYOUT_APPROVAL_THRESHOLD;

  afterEach(() => {
    if (originalThreshold === undefined) {
      delete process.env.PAYOUT_APPROVAL_THRESHOLD;
    } else {
      process.env.PAYOUT_APPROVAL_THRESHOLD = originalThreshold;
    }
  });

  it('uses the configured approval threshold', () => {
    process.env.PAYOUT_APPROVAL_THRESHOLD = '750';
    const service = new PayoutApprovalService();

    expect(service.getApprovalThreshold()).toBe(750);
    expect(service.requiresManualApproval(750)).toBe(true);
    expect(service.requiresManualApproval(749.99)).toBe(false);
  });

  it('auto-approves payouts below the threshold', () => {
    process.env.PAYOUT_APPROVAL_THRESHOLD = '500';
    const service = new PayoutApprovalService();

    expect(service.resolveInitialStatus(120)).toBe('approved');
  });

  it('marks large payouts as pending approval', () => {
    process.env.PAYOUT_APPROVAL_THRESHOLD = '500';
    const service = new PayoutApprovalService();

    expect(service.resolveInitialStatus(500)).toBe('pending_approval');
  });
});
