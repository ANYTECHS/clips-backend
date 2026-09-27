import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { CurrencyService } from '../common/services/currency.service';
import { PayoutLimitsService } from './payout-limits.service';
import { PayoutApprovalService } from './payout-approval.service';
import { PrismaService } from '../prisma/prisma.service';
import { StellarService } from '../stellar/stellar.service';
import {
  CANCELABLE_PAYOUT_STATUSES,
  OPEN_PAYOUT_STATUSES,
  PAYOUT_STATUSES,
  STELLAR_INITIABLE_PAYOUT_STATUSES,
} from './payouts.constants';

/**
 * All payout request/transition rules live here. Methods either return the
 * validated resource or throw an HTTP exception; none of them mutate payout
 * state, which is owned by PayoutsService and PayoutProcessingService.
 */
@Injectable()
export class PayoutValidationService {
  private readonly logger = new Logger(PayoutValidationService.name);
  private readonly defaultPayoutCurrency =
    process.env.DEFAULT_PAYOUT_CURRENCY ?? 'USD';

  constructor(
    private readonly config: ConfigService,
    private readonly currencyService: CurrencyService,
    private readonly payoutLimitsService: PayoutLimitsService,
    private readonly payoutApprovalService: PayoutApprovalService,
    private readonly stellarService: StellarService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Enforce the minimum Stellar payout threshold (Issue #766).
   *
   * `MIN_STELLAR_PAYOUT` (default 5) is expressed as a *USD equivalent*, so a
   * payout denominated in another currency is converted before comparison —
   * otherwise 5 units of a weaker currency would clear a "5 USD" floor and the
   * micro-payout this threshold exists to prevent would go through anyway.
   */
  async assertMinimumPayout(amount: number, currency?: string): Promise<void> {
    const minimum = this.config.minStellarPayout;
    const payoutCurrency = (currency ?? this.defaultPayoutCurrency).toUpperCase();
    const usdEquivalent = await this.toUsdEquivalent(amount, payoutCurrency);

    if (usdEquivalent < minimum) {
      const requested =
        payoutCurrency === 'USD'
          ? `${amount} USD`
          : `${amount} ${payoutCurrency} (~${usdEquivalent.toFixed(2)} USD)`;

      throw new BadRequestException(
        `Minimum payout amount is ${minimum} USD equivalent. Requested: ${requested}.`,
      );
    }
  }

  private async toUsdEquivalent(amount: number, currency: string): Promise<number> {
    if (currency === 'USD') {
      return amount;
    }

    try {
      const { amount: converted, rate } = await this.currencyService.convert(
        amount,
        currency,
        'USD',
      );

      if (!Number.isFinite(rate) || rate <= 0) {
        throw new Error(`no usable ${currency}->USD rate`);
      }

      return converted;
    } catch (error) {
      this.logger.warn(
        `Could not convert ${amount} ${currency} to USD for the minimum-payout check (` +
          `${error instanceof Error ? error.message : String(error)}); comparing the raw amount against the threshold instead.`,
      );
      return amount;
    }
  }

  assertPayoutLimits(amount: number, currency: string): void {
    const limits = this.payoutLimitsService.getLimits(currency);

    if (amount < limits.min) {
      throw new BadRequestException(
        `Minimum payout for ${currency} is ${limits.min}. Requested amount: ${amount}.`,
      );
    }

    if (amount > limits.max) {
      throw new BadRequestException(
        `Maximum payout for ${currency} is ${limits.max}. Requested amount: ${amount}.`,
      );
    }
  }

  assertSufficientBalance(
    amount: number,
    availableBalance: number,
    currency: string,
  ): void {
    if (amount > availableBalance) {
      throw new BadRequestException(
        `Insufficient balance. Available: ${availableBalance} ${currency}`,
      );
    }
  }

  async ensureNoOpenPayout(userId: number): Promise<void> {
    const existingPending = await this.prisma.payout.findFirst({
      where: { userId, status: { in: [...OPEN_PAYOUT_STATUSES] } },
    });

    if (existingPending) {
      throw new ConflictException(
        'A payout request is already pending for this user',
      );
    }
  }

  async getActiveStellarWallet(userId: number): Promise<{ id: number }> {
    const wallet = await this.prisma.wallet.findFirst({
      where: { userId, chain: 'stellar', deletedAt: null },
    });

    if (!wallet) {
      throw new BadRequestException(
        'No active Stellar wallet found. Please connect a wallet first.',
      );
    }

    return wallet;
  }

  async getDefaultPayoutMethod(userId: number): Promise<{ id: number }> {
    const payoutMethod = await this.prisma.payoutMethod.findFirst({
      where: { userId, isDefault: true, deletedAt: null },
    });

    if (!payoutMethod) {
      throw new BadRequestException(
        'No default payout method found. Please add a payout method first.',
      );
    }

    return payoutMethod;
  }

  assertPayoutState(
    status: string,
    allowed: readonly string[],
    action: string,
  ): void {
    if (!allowed.includes(status)) {
      throw new BadRequestException(
        `${action} requires payout status to be one of: ${allowed.join(', ')} (current: ${status})`,
      );
    }
  }

  assertCanApprove(status: string): void {
    if (!this.payoutApprovalService.canApprove(status)) {
      throw new BadRequestException(`Cannot approve payout in '${status}' status`);
    }
  }

  assertCanReject(status: string): void {
    if (!this.payoutApprovalService.canReject(status)) {
      throw new BadRequestException(`Cannot reject payout in '${status}' status`);
    }
  }

  assertCanCancel(status: string): void {
    if (!(CANCELABLE_PAYOUT_STATUSES as readonly string[]).includes(status)) {
      throw new BadRequestException(
        `Cannot cancel payout in '${status}' status. Only pending payouts can be canceled.`,
      );
    }
  }

  /**
   * Checks that a payout can have an unsigned Stellar transaction prepared
   * for it. Runs every rule that does not require building the transaction.
   */
  async assertStellarInitiable(
    payout: { id: number; userId: number; status: string; method: string; amount: number; currency: string },
    amount: number,
  ): Promise<void> {
    if (!(STELLAR_INITIABLE_PAYOUT_STATUSES as readonly string[]).includes(payout.status)) {
      throw new BadRequestException(
        `Payout must be approved or pending before Stellar initiation (current status: ${payout.status})`,
      );
    }

    if (payout.method !== 'stellar') {
      throw new BadRequestException('Only Stellar payouts can be initiated here');
    }

    if (payout.amount !== amount) {
      throw new BadRequestException('Requested amount does not match payout amount');
    }

    await this.assertMinimumPayout(amount, payout.currency);

    const existingPending = await this.prisma.payout.findFirst({
      where: {
        id: payout.id,
        userId: payout.userId,
        status: PAYOUT_STATUSES.PENDING,
        transactionId: { not: null },
      },
    });

    if (existingPending) {
      throw new ConflictException(
        'A Stellar payout transaction is already pending for this payout',
      );
    }
  }

  assertNotCompleted(status: string): void {
    if (status === PAYOUT_STATUSES.COMPLETED) {
      throw new BadRequestException(`Payout is already in ${status} status`);
    }
  }

  /**
   * Checks that an approved payout can be submitted to the Stellar network.
   * Narrows `wallet` to non-null for the caller.
   */
  async assertProcessable<T extends { status: string; amount: number; currency: string; wallet: unknown }>(
    payout: T,
  ): Promise<T & { wallet: NonNullable<T['wallet']> }> {
    if (payout.status !== PAYOUT_STATUSES.APPROVED) {
      throw new BadRequestException(
        `Payout must be approved before processing (current status: ${payout.status})`,
      );
    }

    if (!payout.wallet) {
      throw new BadRequestException('No wallet associated with this payout');
    }

    await this.assertMinimumPayout(payout.amount, payout.currency);

    return payout as T & { wallet: NonNullable<T['wallet']> };
  }

  getPlatformWalletAddress(): string {
    const platformAddress =
      process.env.STELLAR_WALLET_ADDRESS || process.env.PLATFORM_WALLET_ADDRESS || '';

    if (!platformAddress) {
      throw new BadRequestException('Platform Stellar wallet address is not configured');
    }

    if (!this.stellarService.validateAddress(platformAddress).valid) {
      throw new BadRequestException('Invalid platform Stellar wallet address');
    }

    return platformAddress;
  }

  assertValidDestination(address: string | null | undefined): string {
    if (!address) {
      throw new BadRequestException('No wallet associated with this payout');
    }

    if (!this.stellarService.validateAddress(address).valid) {
      throw new BadRequestException('Invalid destination Stellar address');
    }

    return address;
  }

  assertSufficientPlatformBalance(platformBalance: number, amount: number): void {
    if (platformBalance < amount) {
      throw new BadRequestException(
        `Insufficient platform balance. Available: ${platformBalance} XLM`,
      );
    }
  }
}
