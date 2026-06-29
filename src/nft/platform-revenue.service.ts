import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { StellarService } from '../stellar/stellar.service';
import { RedisService } from '../redis/redis.service';
import StellarSdk from '@stellar/stellar-sdk';
import { CacheKeyBuilder } from './cache-key.util';

const CACHE_TTL_SECONDS = 60; // 1 minute cache for revenue data

export interface PlatformRevenueInfo {
  totalFeesStroops: string;
  totalFeesXLM: string;
  lastUpdated: Date;
}

/**
 * Service for querying platform revenue from the NFT smart contract.
 * Tracks the total accumulated platform fees from all royalty payments.
 */
@Injectable()
export class PlatformRevenueService {
  private readonly logger = new Logger(PlatformRevenueService.name);
  private readonly CONTRACT_ID: string;

  constructor(
    private readonly stellarService: StellarService,
    private readonly redisService: RedisService,
  ) {
    const contractId = process.env.SOROBAN_NFT_CONTRACT_ID;
    if (!contractId) {
      throw new InternalServerErrorException(
        'SOROBAN_NFT_CONTRACT_ID environment variable is required and must be set',
      );
    }
    this.CONTRACT_ID = contractId;
  }

  /**
   * Get the total platform revenue accumulated from all royalty payments.
   * This calls the smart contract's get_platform_revenue() function.
   * Result is cached in Redis for 1 minute to reduce RPC calls.
   */
  async getPlatformRevenue(): Promise<PlatformRevenueInfo> {
    const cacheKey = CacheKeyBuilder.platformRevenue();

    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      this.logger.debug('Cache hit for platform revenue');
      return JSON.parse(cached) as PlatformRevenueInfo;
    }

    const result = await this.queryOnChainRevenue();

    await this.redisService.setex(
      cacheKey,
      CACHE_TTL_SECONDS,
      JSON.stringify(result),
    );

    return result;
  }

  /**
   * Query the smart contract for total platform fees.
   * Calls the get_platform_revenue() view function.
   */
  private async queryOnChainRevenue(): Promise<PlatformRevenueInfo> {
    const server = new StellarSdk.rpc.Server(this.stellarService.rpcUrl);
    const contract = new StellarSdk.Contract(this.CONTRACT_ID);

    // Build the contract call for get_platform_revenue()
    const op = contract.call('get_platform_revenue');

    // Use a dummy account for read-only simulation
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
      simulation = await server.simulateTransaction(tx);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Soroban simulation failed for get_platform_revenue: ${msg}`,
      );
      throw new InternalServerErrorException(
        `Failed to query platform revenue from contract: ${msg}`,
      );
    }

    if ((simulation as { error?: string }).error) {
      throw new InternalServerErrorException(
        `Contract returned error: ${(simulation as { error: string }).error}`,
      );
    }

    const results = (simulation as { results?: Array<{ xdr: string }> })
      .results;

    if (!results?.[0]?.xdr) {
      throw new InternalServerErrorException(
        'No return value from get_platform_revenue contract call',
      );
    }

    const returnValue = StellarSdk.xdr.ScVal.fromXDR(results[0].xdr, 'base64');
    const totalFeesStroops = StellarSdk.scValToNative(returnValue) as bigint;

    // Convert stroops to XLM (1 XLM = 10^7 stroops)
    const totalFeesXLM = (Number(totalFeesStroops) / 10_000_000).toFixed(7);

    return {
      totalFeesStroops: totalFeesStroops.toString(),
      totalFeesXLM,
      lastUpdated: new Date(),
    };
  }

  /**
   * Clear the revenue cache.
   * Useful after a royalty payment is executed to get fresh data.
   */
  async clearCache(): Promise<void> {
    await this.redisService.del(CacheKeyBuilder.platformRevenue());
    this.logger.debug('Platform revenue cache cleared');
  }
}
