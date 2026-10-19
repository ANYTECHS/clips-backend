import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Horizon } from '@stellar/stellar-sdk';
import { StellarService } from '../stellar/stellar.service';
import {
  CircuitBreakerService,
  CircuitBreakerConfig,
} from '../common/circuit-breaker/circuit-breaker.service';

export type PayoutVerificationOutcome =
  | 'confirmed'
  | 'failed'
  | 'unknown'
  | 'conflict';

export interface PayoutVerificationResult {
  outcome: PayoutVerificationOutcome;
  found: boolean;
  successful?: boolean;
  confirmedAt?: Date;
  destination?: string;
  transferredAmount?: number;
  expectedDestination?: string;
  expectedAmount?: number;
  conflictReason?: string;
}

/**
 * Verifies Stellar crypto payouts against Horizon (#982).
 * Checks transaction presence/status, payment destination, and transferred amount.
 */
@Injectable()
export class StellarPayoutVerificationService {
  private readonly logger = new Logger(StellarPayoutVerificationService.name);
  private readonly server: Horizon.Server;

  private readonly horizonCircuitBreakerConfig: CircuitBreakerConfig = {
    name: 'stellar-payout-verification-horizon',
    failureThreshold: 5,
    recoveryTimeout: 30000,
    samplingDuration: 60000,
  };

  constructor(
    private readonly stellarService: StellarService,
    private readonly circuitBreakerService: CircuitBreakerService,
  ) {
    this.server = new Horizon.Server(this.stellarService.horizonUrl);
  }

  /**
   * Query Horizon and verify a payout payment operation.
   * Throws NotFoundException when the transaction hash is unknown on-chain.
   * Throws ConflictException when destination or amount does not match expectations.
   */
  async verifyPayoutTransaction(
    txHash: string,
    options?: {
      expectedDestination?: string;
      expectedAmount?: number;
      amountTolerance?: number;
      throwOnNotFound?: boolean;
      throwOnConflict?: boolean;
    },
  ): Promise<PayoutVerificationResult> {
    const throwOnNotFound = options?.throwOnNotFound ?? true;
    const throwOnConflict = options?.throwOnConflict ?? true;
    const tolerance = options?.amountTolerance ?? 0.0000001;

    let tx: Horizon.ServerApi.TransactionRecord;
    try {
      tx = await this.circuitBreakerService.execute(
        this.horizonCircuitBreakerConfig,
        async () => this.server.transactions().transaction(txHash).call(),
      );
    } catch (error: unknown) {
      const status =
        (error as { response?: { status?: number } })?.response?.status ??
        (error as { status?: number })?.status;

      if (status === 404) {
        if (throwOnNotFound) {
          throw new NotFoundException({
            statusCode: 404,
            error: 'Not Found',
            message: 'transaction-not-found',
            details: `Stellar transaction ${txHash} was not found on Horizon`,
          });
        }
        return { outcome: 'unknown', found: false };
      }

      this.logger.warn(
        `Horizon lookup failed for ${txHash}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { outcome: 'unknown', found: false };
    }

    const confirmedAt = tx.created_at ? new Date(tx.created_at) : undefined;

    if (!tx.successful) {
      return {
        outcome: 'failed',
        found: true,
        successful: false,
        confirmedAt,
      };
    }

    const operationsPage = await this.circuitBreakerService.execute(
      this.horizonCircuitBreakerConfig,
      async () => tx.operations().call(),
    );

    const payment = operationsPage.records.find(
      (op) => op.type === 'payment',
    ) as Horizon.ServerApi.PaymentOperationRecord | undefined;

    if (!payment) {
      const conflictReason = 'No payment operation found in transaction';
      if (throwOnConflict) {
        throw new ConflictException({
          statusCode: 409,
          error: 'Conflict',
          message: 'verification-conflict',
          details: conflictReason,
        });
      }
      return {
        outcome: 'conflict',
        found: true,
        successful: true,
        confirmedAt,
        conflictReason,
        expectedDestination: options?.expectedDestination,
        expectedAmount: options?.expectedAmount,
      };
    }

    const destination = payment.to ?? payment.destination;
    const transferredAmount = parseFloat(payment.amount);

    if (
      options?.expectedDestination &&
      destination !== options.expectedDestination
    ) {
      const conflictReason = `Destination mismatch: expected ${options.expectedDestination}, got ${destination}`;
      if (throwOnConflict) {
        throw new ConflictException({
          statusCode: 409,
          error: 'Conflict',
          message: 'verification-conflict',
          details: conflictReason,
        });
      }
      return {
        outcome: 'conflict',
        found: true,
        successful: true,
        confirmedAt,
        destination,
        transferredAmount,
        expectedDestination: options.expectedDestination,
        expectedAmount: options.expectedAmount,
        conflictReason,
      };
    }

    if (
      options?.expectedAmount !== undefined &&
      Math.abs(transferredAmount - options.expectedAmount) > tolerance
    ) {
      const conflictReason = `Amount mismatch: expected ${options.expectedAmount}, got ${transferredAmount}`;
      if (throwOnConflict) {
        throw new ConflictException({
          statusCode: 409,
          error: 'Conflict',
          message: 'verification-conflict',
          details: conflictReason,
        });
      }
      return {
        outcome: 'conflict',
        found: true,
        successful: true,
        confirmedAt,
        destination,
        transferredAmount,
        expectedDestination: options.expectedDestination,
        expectedAmount: options.expectedAmount,
        conflictReason,
      };
    }

    return {
      outcome: 'confirmed',
      found: true,
      successful: true,
      confirmedAt,
      destination,
      transferredAmount,
      expectedDestination: options?.expectedDestination,
      expectedAmount: options?.expectedAmount,
    };
  }
}
