import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { StellarService } from '../stellar/stellar.service';
import { RedisService } from '../redis/redis.service';
import StellarSdk from '@stellar/stellar-sdk';
import { CacheKeyBuilder } from './cache-key.util';
import Redis from 'ioredis';
import { CircuitBreakerService, CircuitBreakerConfig } from '../common/circuit-breaker/circuit-breaker.service';

const CACHE_TTL_SECONDS = 300; // 5 minutes

export interface RoyaltyInfo {
  royaltyBps: number;
  recipient: string;
}

@Injectable()
export class RoyaltyQueryService {
  private readonly logger = new Logger(RoyaltyQueryService.name);
  private readonly redis: Redis;

  private readonly CONTRACT_ID =
    process.env.SOROBAN_NFT_CONTRACT_ID ||
    'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEU4';

  private readonly sorobanCircuitBreakerConfig: CircuitBreakerConfig = {
    name: 'soroban-royalty-query',
    failureThreshold: 5,
    recoveryTimeout: 30000,
    samplingDuration: 60000,
  };

  constructor(
    private readonly stellarService: StellarService,
    private readonly circuitBreakerService: CircuitBreakerService,
  ) {
    this.redis = new Redis({
      host: process.env.REDIS_HOST ?? 'localhost',
      port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
      lazyConnect: true,
    });
  }

  /**
   * Returns royalty info for a given NFT mint address (token ID).
   * Result is cached in Redis for 5 minutes.
   */
  async getRoyaltyInfo(mintAddress: string): Promise<RoyaltyInfo> {
    const cacheKey = CacheKeyBuilder.royalty(mintAddress);

    const cached = await this.redis.get(cacheKey);
    if (cached) {
      this.logger.debug(`Cache hit for royalty:${mintAddress}`);
      return JSON.parse(cached) as RoyaltyInfo;
    }

    const result = await this.queryOnChainRoyalty(mintAddress);

    await this.redis.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(result));

    return result;
  }

  private async queryOnChainRoyalty(mintAddress: string): Promise<RoyaltyInfo> {
    // mintAddress is the numeric token ID assigned during minting (= clip.id)
    const tokenIdNum = parseInt(mintAddress, 10);
    if (isNaN(tokenIdNum) || tokenIdNum <= 0) {
      throw new BadRequestException(
        `Invalid mint address: "${mintAddress}". Expected a numeric token ID.`,
      );
    }

    const server = new StellarSdk.rpc.Server(this.stellarService.rpcUrl);
    const contract = new StellarSdk.Contract(this.CONTRACT_ID);

    const op = contract.call(
      'get_royalties',
      StellarSdk.nativeToScVal(BigInt(tokenIdNum), { type: 'u128' }),
    );

    // Use a well-known funded testnet/mainnet account only for read-only simulation.
    // The sequence number "0" is acceptable because simulateTransaction ignores it.
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
      // Simulate transaction with circuit breaker protection
      simulation = await this.circuitBreakerService.execute(
        this.sorobanCircuitBreakerConfig,
        async () => server.simulateTransaction(tx),
      );
    } catch (err) {
      // Handle ServiceUnavailableException from circuit breaker
      if (err.name === 'ServiceUnavailableException') {
        this.logger.error(`Soroban service unavailable during royalty query for ${mintAddress}`);
        throw new InternalServerErrorException(
          'Soroban service temporarily unavailable. Please try again later.',
        );
      }

      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Soroban simulation failed for token ${mintAddress}: ${msg}`);
      throw new InternalServerErrorException(
        `Failed to query royalty from contract: ${msg}`,
      );
    }

    if ((simulation as { error?: string }).error) {
      throw new BadRequestException(
        `Contract returned error: ${(simulation as { error: string }).error}`,
      );
    }

    const results = (
      simulation as { results?: Array<{ xdr: string }> }
    ).results;

    if (!results?.[0]?.xdr) {
      throw new InternalServerErrorException(
        'No return value from get_royalties contract call',
      );
    }

    const returnValue = StellarSdk.xdr.ScVal.fromXDR(results[0].xdr, 'base64');
    const royaltyMap = StellarSdk.scValToNative(returnValue) as Map<string, bigint> | Record<string, bigint>;

    // Extract first (creator) entry from the royalty map
    const entries: [string, bigint][] =
      royaltyMap instanceof Map
        ? Array.from(royaltyMap.entries())
        : (Object.entries(royaltyMap) as [string, bigint][]);

    if (entries.length === 0) {
      return { royaltyBps: 0, recipient: '' };
    }

    const [recipient, bps] = entries[0];
    return {
      royaltyBps: Number(bps),
      recipient,
    };
  }
}
