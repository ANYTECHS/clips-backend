import { Injectable, Logger, BadGatewayException } from '@nestjs/common';
import StellarSdk from '@stellar/stellar-sdk';
import { StellarService } from '../stellar/stellar.service';
import {
  CircuitBreakerConfig,
  CircuitBreakerService,
} from '../common/circuit-breaker/circuit-breaker.service';
import {
  EstimateMintFeeQueryDto,
  EstimateTransferFeeQueryDto,
  SorobanFeeEstimateDto,
} from './dto/soroban-fee-estimate.dto';

export const FEE_ESTIMATION_LIMITATIONS_DISCLAIMER =
  'Fee estimates are approximate and determined by simulation against the current ledger state. ' +
  'Final submission fees may vary due to network congestion, ledger base fee spikes, ' +
  'storage footprint changes, or contract state updates occurring between estimation and signing.';

// Minimum base fee for a classic Stellar transaction envelope (in stroops)
const STELLAR_BASE_FEE_STROOPS = 100n;
const STROOPS_PER_XLM = 10_000_000;

// Default dummy addresses for safe offline simulation when callers omit parameters
const DUMMY_CALLER_ADDRESS =
  'GDFWJ5C2UFWAJ7XF3UXUEV265MVDLD6BFG7PIT2LH23ARPHDYHC6FGL3';
const DUMMY_RECIPIENT_ADDRESS =
  'GBNPOM4M743X245Y44SAK5TWQGBSWI4YCSRSFDH66PEI4U7NMNU23GYM';
const DUMMY_PLATFORM_ADDRESS =
  'GCLK4PGQAX6I74AG6S4EAHI7VILINORO43PMFEZKDAMIPXPKSWWAQ7ID';
const DUMMY_METADATA_URI =
  'ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi';

@Injectable()
export class SorobanFeeEstimationService {
  private readonly logger = new Logger(SorobanFeeEstimationService.name);

  private readonly circuitBreakerConfig: CircuitBreakerConfig = {
    name: 'soroban-fee-estimation',
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
      process.env.SOROBAN_NFT_CONTRACT_ID?.trim() ||
      'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEU4'
    );
  }

  /**
   * Estimate fee for a Soroban NFT mint transaction (Issue #1091).
   *
   * Simulates the mint contract call against current ledger state and calculates
   * approximate stroop cost (base fee + Soroban resource fee).
   */
  async estimate_mint_fee(
    query?: EstimateMintFeeQueryDto,
  ): Promise<SorobanFeeEstimateDto> {
    const minterWallet = query?.walletAddress || DUMMY_CALLER_ADDRESS;
    const clipId = query?.clipId ? String(query.clipId) : '1';
    const collectionId = query?.collectionId || 'default';
    const royaltyBps = 1000;

    const mapOf = (
      entries: Array<[string, StellarSdk.xdr.ScVal]>,
    ): StellarSdk.xdr.ScVal =>
      StellarSdk.xdr.ScVal.scvMap(
        entries.map(
          ([k, v]) =>
            new StellarSdk.xdr.ScMapEntry({
              key: StellarSdk.nativeToScVal(k, { type: 'string' }),
              val: v,
            }),
        ),
      );

    const recipientsVec = StellarSdk.xdr.ScVal.scvVec([
      mapOf([
        ['wallet', StellarSdk.nativeToScVal(minterWallet, { type: 'address' })],
        ['bps', StellarSdk.nativeToScVal(royaltyBps, { type: 'u32' })],
        ['label', StellarSdk.nativeToScVal('creator', { type: 'string' })],
      ]),
      mapOf([
        [
          'wallet',
          StellarSdk.nativeToScVal(DUMMY_PLATFORM_ADDRESS, { type: 'address' }),
        ],
        ['bps', StellarSdk.nativeToScVal(100, { type: 'u32' })],
        ['label', StellarSdk.nativeToScVal('platform', { type: 'string' })],
      ]),
    ]);

    const royaltyExtension = mapOf([['recipients', recipientsVec]]);

    const args: StellarSdk.xdr.ScVal[] = [
      StellarSdk.nativeToScVal(minterWallet, { type: 'address' }),
      StellarSdk.nativeToScVal(clipId, { type: 'string' }),
      StellarSdk.nativeToScVal(collectionId, { type: 'string' }),
      StellarSdk.nativeToScVal(DUMMY_METADATA_URI, { type: 'string' }),
      StellarSdk.nativeToScVal(royaltyBps, { type: 'u32' }),
      royaltyExtension,
    ];

    const contract = new StellarSdk.Contract(this.CONTRACT_ID);
    const operation = contract.call('mint', ...args);

    return this.simulateOperationAndCalculateFee({
      operation,
      sourceAddress: minterWallet,
      operationType: 'mint',
    });
  }

  /**
   * Estimate fee for a Soroban NFT transfer transaction (Issue #1091).
   *
   * Simulates the transfer contract invocation and returns approximate stroop cost.
   */
  async estimate_transfer_fee(
    query?: EstimateTransferFeeQueryDto,
  ): Promise<SorobanFeeEstimateDto> {
    const fromWallet = query?.fromWallet || DUMMY_CALLER_ADDRESS;
    const toWallet = query?.toWallet || DUMMY_RECIPIENT_ADDRESS;
    const tokenId = query?.tokenId !== undefined ? BigInt(query.tokenId) : 1n;

    const contract = new StellarSdk.Contract(this.CONTRACT_ID);
    const operation = contract.call(
      'transfer',
      StellarSdk.nativeToScVal(fromWallet, { type: 'address' }),
      StellarSdk.nativeToScVal(toWallet, { type: 'address' }),
      StellarSdk.nativeToScVal(tokenId, { type: 'u64' }),
    );

    return this.simulateOperationAndCalculateFee({
      operation,
      sourceAddress: fromWallet,
      operationType: 'transfer',
    });
  }

  // CamelCase convenience aliases
  estimateMintFee = this.estimate_mint_fee.bind(this);
  estimateTransferFee = this.estimate_transfer_fee.bind(this);

  /**
   * Internal simulation runner: wraps RPC simulation with circuit breaker,
   * inspects resource fees, handles failures, and structures the response DTO.
   */
  private async simulateOperationAndCalculateFee(params: {
    operation: StellarSdk.xdr.Operation;
    sourceAddress: string;
    operationType: 'mint' | 'transfer';
  }): Promise<SorobanFeeEstimateDto> {
    const { operation, sourceAddress, operationType } = params;

    const dummyAccount = new StellarSdk.Account(sourceAddress, '0');
    const tx = new StellarSdk.TransactionBuilder(dummyAccount, {
      fee: STELLAR_BASE_FEE_STROOPS.toString(),
      networkPassphrase: this.stellarService.networkPassphrase,
    })
      .addOperation(operation)
      .setTimeout(StellarSdk.TimeoutInfinite)
      .build();

    const server = new StellarSdk.rpc.Server(this.stellarService.rpcUrl);

    let simulation: any;
    try {
      simulation = await this.circuitBreakerService.execute(
        this.circuitBreakerConfig,
        async () => server.simulateTransaction(tx),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Failed to simulate ${operationType} transaction for fee estimation: ${msg}`,
      );
      throw new BadGatewayException(
        `Failed to estimate ${operationType} fee from Soroban RPC: ${msg}`,
      );
    }

    if (!simulation) {
      throw new BadGatewayException(
        `Soroban ${operationType} fee estimation simulation returned an empty response`,
      );
    }

    // Inspect simulation error response
    if (
      (StellarSdk.rpc?.Api?.isSimulationError &&
        StellarSdk.rpc.Api.isSimulationError(simulation)) ||
      (typeof simulation === 'object' &&
        'error' in simulation &&
        simulation.error)
    ) {
      const errDetail =
        simulation.error ||
        `Soroban RPC simulation returned an error for ${operationType}`;
      this.logger.warn(`Simulation failed for ${operationType}: ${errDetail}`);
      throw new BadGatewayException(
        `Soroban ${operationType} fee estimation simulation failed: ${errDetail}`,
      );
    }

    // Extract resource fee and calculate total approximate stroops
    const minResourceFeeStr = simulation.minResourceFee || '0';
    let resourceFeeStroops = 0n;
    try {
      resourceFeeStroops = BigInt(minResourceFeeStr);
    } catch {
      resourceFeeStroops = 0n;
    }

    const totalFeeStroops = resourceFeeStroops + STELLAR_BASE_FEE_STROOPS;
    const estimatedFee = totalFeeStroops.toString();
    const estimatedFeeXlm = (Number(totalFeeStroops) / STROOPS_PER_XLM).toFixed(
      7,
    );

    const cpuInstructions = simulation.cost?.cpuInsns
      ? Number(simulation.cost.cpuInsns)
      : undefined;
    const memoryBytes = simulation.cost?.memBytes
      ? Number(simulation.cost.memBytes)
      : undefined;

    return {
      operation: operationType,
      estimatedFee,
      unit: 'stroops',
      network: this.stellarService.network,
      timestamp: new Date().toISOString(),
      limitations: FEE_ESTIMATION_LIMITATIONS_DISCLAIMER,
      estimatedFeeXlm,
      breakdown: {
        baseFeeStroops: STELLAR_BASE_FEE_STROOPS.toString(),
        resourceFeeStroops: resourceFeeStroops.toString(),
        cpuInstructions,
        memoryBytes,
      },
    };
  }
}
