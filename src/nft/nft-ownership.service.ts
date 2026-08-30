import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { StellarService } from '../stellar/stellar.service';
import { ConfigService } from '../config/config.service';
import {
  CircuitBreakerConfig,
  CircuitBreakerService,
} from '../common/circuit-breaker/circuit-breaker.service';
import {
  createDefaultOwnershipStrategy,
  NFT_OWNERSHIP_STRATEGY,
} from './strategies/nft-ownership-verification.factory';
import type {
  NftOwnershipVerificationStrategy,
  OwnershipVerificationResult,
} from './strategies/nft-ownership-verification.strategy';

@Injectable()
export class NftOwnershipService {
  private readonly logger = new Logger(NftOwnershipService.name);
  private readonly strategy: NftOwnershipVerificationStrategy;

  private readonly circuitBreakerConfig: CircuitBreakerConfig = {
    name: 'soroban-nft-ownership',
    failureThreshold: 5,
    recoveryTimeout: 30000,
    samplingDuration: 60000,
  };

  constructor(
    private readonly stellarService: StellarService,
    private readonly config: ConfigService,
    private readonly circuitBreakerService: CircuitBreakerService,
    @Optional()
    @Inject(NFT_OWNERSHIP_STRATEGY)
    strategy?: NftOwnershipVerificationStrategy,
  ) {
    this.strategy =
      strategy ??
      createDefaultOwnershipStrategy({
        rpcUrl: this.stellarService.rpcUrl,
        networkPassphrase: this.stellarService.networkPassphrase,
      });
  }

  private get contractId(): string {
    return (
      this.config.sorobanNftContractId ||
      'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEU4'
    );
  }

  /**
   * Verify on-chain NFT ownership for a token ID and wallet address.
   * Uses the configured ownership verification strategy (Soroban owner_of).
   */
  async verifyNFTOwnership(
    tokenId: string,
    walletAddress: string,
    contractId?: string,
  ): Promise<OwnershipVerificationResult> {
    this.logger.log(
      `Verifying ownership: tokenId=${tokenId}, wallet=${walletAddress}`,
    );

    try {
      return await this.circuitBreakerService.execute(
        this.circuitBreakerConfig,
        () =>
          this.strategy.verifyOwnership(
            contractId ?? this.contractId,
            tokenId,
            walletAddress,
          ),
      );
    } catch (error) {
      if (error?.name === 'ServiceUnavailableException') {
        this.logger.error(
          'Soroban service unavailable during ownership verification',
        );
        return {
          isOwner: false,
          error:
            'Soroban service temporarily unavailable. Please try again later.',
        };
      }

      const message =
        error instanceof Error
          ? error.message
          : 'Ownership verification failed';
      this.logger.error(`Ownership verification failed: ${message}`);
      return { isOwner: false, error: message };
    }
  }

  /**
   * Get the current owner of an NFT.
   */
  async getOwner(
    tokenId: string,
    contractId?: string,
  ): Promise<string | null> {
    try {
      return await this.circuitBreakerService.execute(
        this.circuitBreakerConfig,
        () => this.strategy.getOwner(contractId ?? this.contractId, tokenId),
      );
    } catch (error) {
      this.logger.error(`Failed to get owner for token ${tokenId}`, error);
      return null;
    }
  }

  /**
   * Get the token IDs owned by a wallet address.
   */
  async getWalletTokenIds(
    walletAddress: string,
    contractId?: string,
  ): Promise<number[]> {
    try {
      return await this.circuitBreakerService.execute(
        this.circuitBreakerConfig,
        () => this.strategy.getWalletTokenIds(contractId ?? this.contractId, walletAddress),
      );
    } catch (error) {
      this.logger.error(`Failed to get token IDs for wallet ${walletAddress}`, error);
      return [];
    }
  }

  /**
   * Lightweight check: returns true when the token has been minted on-chain,
   * false when it has not (Issue #688). Uses an efficient storage lookup via
   * owner_of — no ownership transfer is involved.
   */
  async tokenExists(
    tokenId: string,
    contractId?: string,
  ): Promise<boolean> {
    try {
      return await this.circuitBreakerService.execute(
        this.circuitBreakerConfig,
        () => this.strategy.tokenExists(contractId ?? this.contractId, tokenId),
      );
    } catch (error) {
      this.logger.error(`Failed to check token existence for token ${tokenId}`, error);
      return false;
    }
  }

  /**
   * Get a paginated slice of token IDs owned by a wallet address (Issue #838).
   *
   * Prefers on-chain `get_user_tokens(owner, limit, cursor)` when the strategy
   * supports it, so large collections do not require loading the full token
   * vector into memory. Falls back to ledger iteration + local pagination.
   *
   * @returns Paginated result with tokenIds, nextCursor (null when exhausted), and total count.
   */
  async getUserTokensPaginated(
    walletAddress: string,
    limit: number = 20,
    cursor: number = 0,
    contractId?: string,
  ): Promise<{ tokenIds: number[]; nextCursor: number | null; total: number }> {
    const effectiveLimit = Math.min(Math.max(limit, 1), 100);
    const effectiveCursor = Math.max(cursor, 0);
    const cid = contractId ?? this.contractId;

    try {
      return await this.circuitBreakerService.execute(
        this.circuitBreakerConfig,
        async () => {
          if (typeof this.strategy.getUserTokens === 'function') {
            return this.strategy.getUserTokens(
              cid,
              walletAddress,
              effectiveLimit,
              effectiveCursor,
            );
          }

          const allTokens = await this.strategy.getWalletTokenIds(
            cid,
            walletAddress,
          );
          const total = allTokens.length;
          const start = Math.min(effectiveCursor, total);
          const end = Math.min(start + effectiveLimit, total);
          return {
            tokenIds: allTokens.slice(start, end),
            nextCursor: end < total ? end : null,
            total,
          };
        },
      );
    } catch (error) {
      this.logger.error(
        `Failed to paginate tokens for wallet ${walletAddress}`,
        error,
      );
      return { tokenIds: [], nextCursor: null, total: 0 };
    }
  }
}

export { NFT_OWNERSHIP_STRATEGY };
