import { Injectable, Logger } from '@nestjs/common';
import StellarSdk from '@stellar/stellar-sdk';
import { StellarService } from '../stellar/stellar.service';
import {
  CircuitBreakerService,
  CircuitBreakerConfig,
} from '../common/circuit-breaker/circuit-breaker.service';

export interface SorobanHealthResponse {
  status: 'healthy' | 'unhealthy';
  network: string;
  contractId: string;
  version: string | null;
  collectionName?: string | null;
  rpcReachable: boolean;
  error?: string;
}

/**
 * Health probe for the configured Soroban NFT contract (Issue #844).
 */
@Injectable()
export class SorobanHealthService {
  private readonly logger = new Logger(SorobanHealthService.name);

  private readonly circuitConfig: CircuitBreakerConfig = {
    name: 'soroban-health',
    failureThreshold: 5,
    recoveryTimeout: 30000,
    samplingDuration: 60000,
  };

  constructor(
    private readonly stellarService: StellarService,
    private readonly circuitBreakerService: CircuitBreakerService,
  ) {}

  async check(): Promise<SorobanHealthResponse> {
    const contractId = process.env.SOROBAN_NFT_CONTRACT_ID?.trim() ?? '';
    const network = this.stellarService.network;

    if (!contractId) {
      return {
        status: 'unhealthy',
        network,
        contractId: '',
        version: null,
        collectionName: null,
        rpcReachable: false,
        error: 'SOROBAN_NFT_CONTRACT_ID is not configured',
      };
    }

    if (!contractId.startsWith('C') || contractId.length < 56) {
      return {
        status: 'unhealthy',
        network,
        contractId,
        version: null,
        collectionName: null,
        rpcReachable: false,
        error: 'Configured contract ID does not look like a valid Soroban address',
      };
    }

    try {
      const [version, collectionName] = await Promise.all([
        this.callViewString('version'),
        this.callViewString('name'),
      ]);

      return {
        status: 'healthy',
        network,
        contractId,
        version,
        collectionName,
        rpcReachable: true,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Soroban health check failed: ${msg}`);
      return {
        status: 'unhealthy',
        network,
        contractId,
        version: null,
        collectionName: null,
        rpcReachable: false,
        error: msg,
      };
    }
  }

  private async callViewString(fnName: string): Promise<string> {
    const contractId = process.env.SOROBAN_NFT_CONTRACT_ID!.trim();
    const server = new StellarSdk.rpc.Server(this.stellarService.rpcUrl);
    const contract = new StellarSdk.Contract(contractId);
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

    const simulation = await this.circuitBreakerService.execute(
      this.circuitConfig,
      async () => server.simulateTransaction(tx),
    );

    if ((simulation as { error?: string }).error) {
      throw new Error((simulation as { error: string }).error);
    }

    const results = (simulation as { results?: Array<{ xdr: string }> }).results;
    if (!results?.[0]?.xdr) {
      throw new Error(`No return value from ${fnName}()`);
    }

    const returnValue = StellarSdk.xdr.ScVal.fromXDR(results[0].xdr, 'base64');
    return String(StellarSdk.scValToNative(returnValue));
  }
}
