import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import StellarSdk from '@stellar/stellar-sdk';
import { StellarService } from '../stellar/stellar.service';
import {
  CircuitBreakerService,
  CircuitBreakerConfig,
} from '../common/circuit-breaker/circuit-breaker.service';
import {
  AdminConfigTxResponseDto,
  AdminConfigValueResponseDto,
} from './dto/admin-config.dto';

/** Local + documented on-chain event name for admin config changes (Issue #835). */
export const CONFIG_UPDATED_EVENT = 'ConfigUpdated';
export const SOROBAN_CONFIG_UPDATED = 'soroban.config.updated';

/**
 * Admin contract configuration for platform fee and default royalty (Issue #835).
 *
 * Builds unsigned `set_platform_fee` / `set_default_royalty` XDRs that only the
 * contract owner can successfully submit on-chain. Emits `ConfigUpdated` locally
 * when a prepare call succeeds; the Soroban contract emits the same event on-chain.
 */
@Injectable()
export class AdminConfigService {
  private readonly logger = new Logger(AdminConfigService.name);

  private readonly sorobanCircuitBreakerConfig: CircuitBreakerConfig = {
    name: 'soroban-admin-config',
    failureThreshold: 5,
    recoveryTimeout: 30000,
    samplingDuration: 60000,
  };

  constructor(
    private readonly stellarService: StellarService,
    private readonly circuitBreakerService: CircuitBreakerService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private get CONTRACT_ID(): string {
    return (
      process.env.SOROBAN_NFT_CONTRACT_ID ||
      'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEU4'
    );
  }

  private assertAdminAddress(adminAddress: string): void {
    const addressCheck = this.stellarService.validateAddress(adminAddress);
    if (!addressCheck.valid) {
      throw new BadRequestException(
        `Invalid admin wallet address: ${addressCheck.message}`,
      );
    }
  }

  private assertBps(value: number, field: string): void {
    if (!Number.isInteger(value) || value < 0 || value > 10_000) {
      throw new BadRequestException(
        `Invalid ${field}: ${value}. Must be an integer between 0 and 10000.`,
      );
    }
  }

  /**
   * Prepare unsigned `set_platform_fee(bps)` — restricted to contract owner on-chain.
   */
  async prepareSetPlatformFee(
    adminAddress: string,
    platformFeeBps: number,
  ): Promise<AdminConfigTxResponseDto> {
    this.assertAdminAddress(adminAddress);
    this.assertBps(platformFeeBps, 'platformFeeBps');

    const result = await this.buildConfigTx(
      adminAddress,
      'set_platform_fee',
      platformFeeBps,
    );

    this.emitConfigUpdated('platform_fee', platformFeeBps, adminAddress);
    return result;
  }

  /**
   * Prepare unsigned `set_default_royalty(bps)` — restricted to contract owner on-chain.
   */
  async prepareSetDefaultRoyalty(
    adminAddress: string,
    defaultRoyaltyBps: number,
  ): Promise<AdminConfigTxResponseDto> {
    this.assertAdminAddress(adminAddress);
    this.assertBps(defaultRoyaltyBps, 'defaultRoyaltyBps');

    const result = await this.buildConfigTx(
      adminAddress,
      'set_default_royalty',
      defaultRoyaltyBps,
    );

    this.emitConfigUpdated('default_royalty', defaultRoyaltyBps, adminAddress);
    return result;
  }

  async getPlatformFee(): Promise<AdminConfigValueResponseDto> {
    const valueBps = await this.callU32View('get_platform_fee');
    return { valueBps, contractId: this.CONTRACT_ID };
  }

  async getDefaultRoyalty(): Promise<AdminConfigValueResponseDto> {
    const valueBps = await this.callU32View('get_default_royalty');
    return { valueBps, contractId: this.CONTRACT_ID };
  }

  private emitConfigUpdated(
    key: 'platform_fee' | 'default_royalty',
    valueBps: number,
    adminAddress: string,
  ): void {
    const payload = {
      event: CONFIG_UPDATED_EVENT,
      key,
      valueBps,
      adminAddress,
      contractId: this.CONTRACT_ID,
      at: new Date().toISOString(),
    };
    this.eventEmitter.emit(SOROBAN_CONFIG_UPDATED, payload);
    this.eventEmitter.emit(CONFIG_UPDATED_EVENT, payload);
    this.logger.log(
      `Emitted ${CONFIG_UPDATED_EVENT} for ${key}=${valueBps} by ${adminAddress}`,
    );
  }

  private async buildConfigTx(
    adminAddress: string,
    method: 'set_platform_fee' | 'set_default_royalty',
    valueBps: number,
  ): Promise<AdminConfigTxResponseDto> {
    const server = new StellarSdk.rpc.Server(this.stellarService.rpcUrl);
    const sourceAccount = await this.circuitBreakerService.execute(
      this.sorobanCircuitBreakerConfig,
      async () => server.getAccount(adminAddress),
    );

    const contract = new StellarSdk.Contract(this.CONTRACT_ID);
    const op = contract.call(
      method,
      StellarSdk.nativeToScVal(valueBps, { type: 'u32' }),
    );

    const tx = new StellarSdk.TransactionBuilder(sourceAccount, {
      fee: '10000',
      networkPassphrase: this.stellarService.networkPassphrase,
    })
      .addOperation(op)
      .setTimeout(StellarSdk.TimeoutInfinite)
      .build();

    return {
      xdr: tx.toXDR(),
      action: method,
      valueBps,
      contractId: this.CONTRACT_ID,
      network: this.stellarService.network,
      emits: CONFIG_UPDATED_EVENT,
    };
  }

  private async callU32View(fnName: string): Promise<number> {
    const server = new StellarSdk.rpc.Server(this.stellarService.rpcUrl);
    const contract = new StellarSdk.Contract(this.CONTRACT_ID);
    const op = contract.call(fnName);

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
      this.logger.error(`Failed to call ${fnName}(): ${msg}`);
      throw new InternalServerErrorException(
        `Failed to query contract ${fnName}(): ${msg}`,
      );
    }

    const results = (simulation as { results?: Array<{ xdr: string }> }).results;
    if (!results?.[0]?.xdr) {
      throw new InternalServerErrorException(
        `No return value from ${fnName}() contract call`,
      );
    }

    const returnValue = StellarSdk.xdr.ScVal.fromXDR(results[0].xdr, 'base64');
    return Number(StellarSdk.scValToNative(returnValue));
  }
}
