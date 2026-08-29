import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import StellarSdk from '@stellar/stellar-sdk';
import { StellarService } from '../stellar/stellar.service';
import {
  CircuitBreakerService,
  CircuitBreakerConfig,
} from '../common/circuit-breaker/circuit-breaker.service';
import { RoyaltyConfigurationService } from './royalty-configuration.service';
import { ClaimRoyaltiesResponseDto } from './dto/claim-royalties.dto';

/**
 * Builds unsigned Soroban `claim_royalties` transactions and queries
 * claimable balances (Issue #839).
 *
 * On-chain `claim_royalties` transfers the owed amount, resets the accrued
 * balance to zero (preventing double claims), and emits `RoyaltyClaimed`.
 */
@Injectable()
export class ClaimRoyaltyService {
  private readonly logger = new Logger(ClaimRoyaltyService.name);

  private readonly sorobanCircuitBreakerConfig: CircuitBreakerConfig = {
    name: 'soroban-claim-royalty',
    failureThreshold: 5,
    recoveryTimeout: 30000,
    samplingDuration: 60000,
  };

  constructor(
    private readonly stellarService: StellarService,
    private readonly circuitBreakerService: CircuitBreakerService,
    private readonly royaltyConfigurationService: RoyaltyConfigurationService,
  ) {}

  private get CONTRACT_ID(): string {
    const id = process.env.SOROBAN_NFT_CONTRACT_ID?.trim();
    if (!id) {
      throw new BadRequestException('SOROBAN_NFT_CONTRACT_ID not configured');
    }
    return id;
  }

  /**
   * Query on-chain claimable royalties for `(token_id, recipient [, asset])`.
   * Returns balance in stroops (integer).
   */
  async getClaimableBalance(
    tokenId: number,
    recipient: string,
    assetContractId?: string,
  ): Promise<number> {
    const server = new StellarSdk.rpc.Server(this.stellarService.rpcUrl);
    const contract = new StellarSdk.Contract(this.CONTRACT_ID);

    const callArgs = [
      StellarSdk.nativeToScVal(BigInt(tokenId), { type: 'u64' }),
      StellarSdk.Address.fromString(recipient).toScVal(),
    ];

    const resolvedAsset = this.resolveAssetContractId(assetContractId);
    if (resolvedAsset) {
      callArgs.push(StellarSdk.Address.fromString(resolvedAsset).toScVal());
    }

    const op = contract.call('get_claimable_royalties', ...callArgs);

    const dummyAccount = new StellarSdk.Account(
      'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN',
      '0',
    );

    const tx = new StellarSdk.TransactionBuilder(dummyAccount, {
      fee: '100',
      networkPassphrase: this.stellarService.networkPassphrase,
    })
      .addOperation(op)
      .setTimeout(StellarSdk.TimeoutInfinite)
      .build();

    let simulation: Awaited<ReturnType<typeof server.simulateTransaction>>;
    try {
      simulation = await this.circuitBreakerService.execute(
        this.sorobanCircuitBreakerConfig,
        async () => server.simulateTransaction(tx),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Failed to query claimable royalties for token ${tokenId}: ${msg}`,
      );
      throw new InternalServerErrorException(
        `Failed to query claimable royalties: ${msg}`,
      );
    }

    if ((simulation as { error?: string }).error) {
      throw new BadRequestException(
        `Contract returned error: ${(simulation as { error: string }).error}`,
      );
    }

    const results = (simulation as { results?: Array<{ xdr: string }> }).results;
    if (!results?.[0]?.xdr) {
      return 0;
    }

    const returnValue = StellarSdk.xdr.ScVal.fromXDR(results[0].xdr, 'base64');
    const native = StellarSdk.scValToNative(returnValue);
    return this.toStroopNumber(native);
  }

  /**
   * Prepare an unsigned `claim_royalties(token_id [, asset])` XDR.
   * Rejects when claimable balance is zero to prevent useless double-claim txs.
   */
  async prepareClaimRoyaltiesTx(
    tokenId: number,
    walletAddress: string,
    assetContractId?: string,
  ): Promise<ClaimRoyaltiesResponseDto> {
    const addrValidation = this.stellarService.validateAddress(walletAddress);
    if (!addrValidation.valid) {
      throw new BadRequestException(addrValidation.message);
    }

    if (!Number.isInteger(tokenId) || tokenId <= 0) {
      throw new BadRequestException(
        `Invalid token ID: ${tokenId}. Expected a positive integer.`,
      );
    }

    const resolvedAsset = this.resolveAssetContractId(assetContractId);
    const claimableBalance = await this.getClaimableBalance(
      tokenId,
      walletAddress,
      resolvedAsset,
    );

    if (claimableBalance <= 0) {
      throw new BadRequestException(
        `No claimable royalties for token ${tokenId}`,
      );
    }

    const server = new StellarSdk.rpc.Server(this.stellarService.rpcUrl);
    const sourceAccount = await this.circuitBreakerService.execute(
      this.sorobanCircuitBreakerConfig,
      async () => server.getAccount(walletAddress),
    );

    const contract = new StellarSdk.Contract(this.CONTRACT_ID);
    const callArgs = [
      StellarSdk.nativeToScVal(BigInt(tokenId), { type: 'u64' }),
    ];
    if (resolvedAsset) {
      callArgs.push(StellarSdk.Address.fromString(resolvedAsset).toScVal());
    }

    const op = contract.call('claim_royalties', ...callArgs);

    const tx = new StellarSdk.TransactionBuilder(sourceAccount, {
      fee: '10000',
      networkPassphrase: this.stellarService.networkPassphrase,
    })
      .addOperation(op)
      .setTimeout(StellarSdk.TimeoutInfinite)
      .build();

    this.logger.log(
      `Claim royalties XDR prepared — token: ${tokenId}, recipient: ${walletAddress}, amount: ${claimableBalance}`,
    );

    return {
      xdr: tx.toXDR(),
      tokenId,
      recipient: walletAddress,
      claimableBalance,
      contractId: this.CONTRACT_ID,
      network: this.stellarService.network,
    };
  }

  private resolveAssetContractId(assetContractId?: string): string | undefined {
    if (assetContractId?.trim()) {
      return assetContractId.trim();
    }
    return this.royaltyConfigurationService.getRoyaltyAsset().contractId;
  }

  private toStroopNumber(value: unknown): number {
    if (value == null) return 0;
    if (typeof value === 'bigint') return Number(value);
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  }
}
