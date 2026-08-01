import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import StellarSdk from '@stellar/stellar-sdk';
import { StellarService } from '../stellar/stellar.service';
import {
  CircuitBreakerService,
  CircuitBreakerConfig,
} from '../common/circuit-breaker/circuit-breaker.service';

/**
 * Builds unsigned admin transactions (pause/unpause) for the ClipCash NFT
 * Soroban contract, and reads the contract's current pause state.
 *
 * The contract admin key is never held server-side: callers sign the
 * returned XDR with their own wallet, matching the prepare-mint flow.
 */
@Injectable()
export class AdminContractService {
  private readonly logger = new Logger(AdminContractService.name);

  private readonly sorobanCircuitBreakerConfig: CircuitBreakerConfig = {
    name: 'soroban-admin-contract',
    failureThreshold: 5,
    recoveryTimeout: 30000,
    samplingDuration: 60000,
  };

  constructor(
    private readonly stellarService: StellarService,
    private readonly circuitBreakerService: CircuitBreakerService,
  ) {}

  private get CONTRACT_ID(): string {
    return (
      process.env.SOROBAN_NFT_CONTRACT_ID ||
      'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEU4'
    );
  }

  async preparePauseTx(adminAddress: string, paused: boolean) {
    const addressCheck = this.stellarService.validateAddress(adminAddress);
    if (!addressCheck.valid) {
      throw new InternalServerErrorException(
        `Invalid admin wallet address: ${addressCheck.message}`,
      );
    }

    const server = new StellarSdk.rpc.Server(this.stellarService.rpcUrl);
    const sourceAccount = await this.circuitBreakerService.execute(
      this.sorobanCircuitBreakerConfig,
      async () => server.getAccount(adminAddress),
    );

    const contract = new StellarSdk.Contract(this.CONTRACT_ID);
    const op = contract.call(paused ? 'pause' : 'unpause');

    const tx = new StellarSdk.TransactionBuilder(sourceAccount, {
      fee: '10000',
      networkPassphrase: this.stellarService.networkPassphrase,
    })
      .addOperation(op)
      .setTimeout(StellarSdk.TimeoutInfinite)
      .build();

    return {
      xdr: tx.toXDR(),
      action: paused ? 'pause' : 'unpause',
      contractId: this.CONTRACT_ID,
      network: this.stellarService.network,
    };
  }

  /**
   * Query the on-chain `get_clip_id(token_id)` view function (Issue #674).
   *
   * Every NFT stores the ClipCash database Clip ID passed at mint time, so
   * this call lets any back-end service verify the NFT ↔ database link
   * without trusting off-chain metadata.
   *
   * Returns `null` when the token does not exist on-chain.
   */
  async getClipId(tokenId: number): Promise<{ tokenId: number; clipId: string | null }> {
    const server = new StellarSdk.rpc.Server(this.stellarService.rpcUrl);
    const contract = new StellarSdk.Contract(this.CONTRACT_ID);
    const op = contract.call(
      'get_clip_id',
      StellarSdk.nativeToScVal(BigInt(tokenId), { type: 'u64' }),
    );

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
      this.logger.error(`Failed to query get_clip_id for token ${tokenId}: ${msg}`);
      throw new InternalServerErrorException(
        `Failed to query clip ID for token ${tokenId}: ${msg}`,
      );
    }

    const results = (simulation as { results?: Array<{ xdr: string }> }).results;
    if (!results?.[0]?.xdr) {
      return { tokenId, clipId: null };
    }

    const returnValue = StellarSdk.xdr.ScVal.fromXDR(results[0].xdr, 'base64');
    const native = StellarSdk.scValToNative(returnValue);
    // Soroban Option<String> is either a string value or null/undefined
    const clipId = native != null ? String(native) : null;

    return { tokenId, clipId };
  }

  async getPauseStatus(): Promise<{ paused: boolean }> {
    const server = new StellarSdk.rpc.Server(this.stellarService.rpcUrl);
    const contract = new StellarSdk.Contract(this.CONTRACT_ID);
    const op = contract.call('is_paused');

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
      this.logger.error(`Failed to query pause status: ${msg}`);
      throw new InternalServerErrorException(
        `Failed to query contract pause status: ${msg}`,
      );
    }

    const results = (simulation as { results?: Array<{ xdr: string }> }).results;
    if (!results?.[0]?.xdr) {
      throw new InternalServerErrorException(
        'No return value from is_paused contract call',
      );
    }

    const returnValue = StellarSdk.xdr.ScVal.fromXDR(results[0].xdr, 'base64');
    return { paused: Boolean(StellarSdk.scValToNative(returnValue)) };
  }

  /**
   * Read the deployed contract's semantic version via the read-only
   * `version()` call (Issue #692).
   */
  async getContractVersion(): Promise<{ contractId: string; version: string }> {
    const server = new StellarSdk.rpc.Server(this.stellarService.rpcUrl);
    const contract = new StellarSdk.Contract(this.CONTRACT_ID);
    const op = contract.call('version');

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
      this.logger.error(`Failed to query contract version: ${msg}`);
      throw new InternalServerErrorException(
        `Failed to query contract version: ${msg}`,
      );
    }

    const results = (simulation as { results?: Array<{ xdr: string }> }).results;
    if (!results?.[0]?.xdr) {
      throw new InternalServerErrorException(
        'No return value from version contract call',
      );
    }

    const returnValue = StellarSdk.xdr.ScVal.fromXDR(results[0].xdr, 'base64');
    return {
      contractId: this.CONTRACT_ID,
      version: String(StellarSdk.scValToNative(returnValue)),
    };
  }
}
