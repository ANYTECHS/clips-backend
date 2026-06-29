import { Injectable, Logger } from '@nestjs/common';
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
        this.logger.error('Soroban service unavailable during ownership verification');
        return {
          isOwner: false,
          error:
            'Soroban service temporarily unavailable. Please try again later.',
        };
      }

      const message =
        error instanceof Error ? error.message : 'Ownership verification failed';
      this.logger.error(`Ownership verification failed: ${message}`);
      return { isOwner: false, error: message };
    }
  }
}

export { NFT_OWNERSHIP_STRATEGY };
