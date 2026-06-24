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

const CACHE_TTL_SECONDS = 300;

export interface BatchRoyaltyInfo {
  tokenId: string;
  recipient: string;
  feeNumerator: number;
  feeDenominator: number;
  royaltyPercentage: string;
}

@Injectable()
export class BatchRoyaltyService {
  private readonly logger = new Logger(BatchRoyaltyService.name);
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

  async getBatchRoyaltyInfo(
    tokenIds: (string | number)[],
    skipCache = false,
  ): Promise<BatchRoyaltyInfo[]> {
    if (!Array.isArray(tokenIds)) {
      throw new BadRequestException('tokenIds must be an array');
    }

    if (tokenIds.length === 0) {
      return [];
    }

    const MAX_BATCH_SIZE = 100;
    if (tokenIds.length > MAX_BATCH_SIZE) {
      throw new BadRequestException(
        `Batch size exceeds maximum of ${MAX_BATCH_SIZE} tokens. Please split your request into smaller batches.`,
      );
    }

    const normalizedIds = tokenIds.map((id) => String(id));
    const cacheKey = CacheKeyBuilder.batchRoyalty(normalizedIds);

    if (!skipCache) {
      const cached = await this.redisService.get(cacheKey);
      if (cached) {
        this.logger.debug(`Cache hit for batch royalty: ${normalizedIds.length} tokens`);
        return JSON.parse(cached) as BatchRoyaltyInfo[];
      }
    }

    const result = await this.queryBatchRoyaltyOnChain(normalizedIds);

    await this.redisService.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(result));

    return result;
  }

  private async queryBatchRoyaltyOnChain(
    tokenIds: string[],
  ): Promise<BatchRoyaltyInfo[]> {
    const server = new StellarSdk.rpc.Server(this.stellarService.rpcUrl);
    const contract = new StellarSdk.Contract(this.CONTRACT_ID);

    const tokenIdsVec = tokenIds.map((id) => {
      const tokenIdNum = parseInt(id, 10);
      if (isNaN(tokenIdNum) || tokenIdNum < 0) {
        throw new BadRequestException(
          `Invalid token ID: "${id}". Expected a non-negative integer.`,
        );
      }
      return StellarSdk.nativeToScVal(BigInt(tokenIdNum), { type: 'u128' });
    });

    const tokenIdsScVal = StellarSdk.nativeToScVal(tokenIdsVec, { type: 'Vec' });

    const op = contract.call('batch_royalty_info', tokenIdsScVal);

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
      this.logger.error(`Soroban simulation failed for batch_royalty_info: ${msg}`);
      throw new InternalServerErrorException(
        `Failed to query batch royalty from contract: ${msg}`,
      );
    }

    if ((simulation as { error?: string }).error) {
      throw new InternalServerErrorException(
        `Contract returned error: ${(simulation as { error: string }).error}`,
      );
    }

    const results = (simulation as { results?: Array<{ xdr: string }> }).results;

    if (!results?.[0]?.xdr) {
      throw new InternalServerErrorException(
        'No return value from batch_royalty_info contract call',
      );
    }

    const returnValue = StellarSdk.xdr.ScVal.fromXDR(results[0].xdr, 'base64');
    const batchResults = StellarSdk.scValToNative(returnValue) as Array<{
      token_id: bigint;
      recipient: string;
      fee_numerator: number;
      fee_denominator: number;
    }>;

    return batchResults.map((item) => {
      const percentage =
        item.fee_denominator > 0
          ? ((item.fee_numerator / item.fee_denominator) * 100).toFixed(2)
          : '0.00';

      return {
        tokenId: item.token_id.toString(),
        recipient: item.recipient,
        feeNumerator: item.fee_numerator,
        feeDenominator: item.fee_denominator,
        royaltyPercentage: `${percentage}%`,
      };
    });
  }

  async clearCache(tokenIds: (string | number)[]): Promise<void> {
    const normalizedIds = tokenIds.map((id) => String(id));
    const cacheKey = CacheKeyBuilder.batchRoyalty(normalizedIds);

    await this.redisService.del(cacheKey);
    this.logger.debug(`Cleared cache for batch: ${normalizedIds.join(',')}`);
  }
}
