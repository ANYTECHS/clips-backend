import { Injectable, Logger } from '@nestjs/common';
import StellarSdk from '@stellar/stellar-sdk';
import { StellarService } from '../stellar/stellar.service';
import { ConfigService } from '../config/config.service';
import {
  CircuitBreakerConfig,
  CircuitBreakerService,
} from '../common/circuit-breaker/circuit-breaker.service';

export interface NftOwnershipResult {
  isOwner: boolean;
  owned: boolean;
  ownerAddress?: string;
  error?: string;
}

@Injectable()
export class NftOwnershipService {
  private readonly logger = new Logger(NftOwnershipService.name);

  private readonly sorobanCircuitBreakerConfig: CircuitBreakerConfig = {
    name: 'soroban-nft-ownership',
    failureThreshold: 5,
    recoveryTimeout: 30000,
    samplingDuration: 60000,
  };

  constructor(
    private readonly stellarService: StellarService,
    private readonly config: ConfigService,
    private readonly circuitBreakerService: CircuitBreakerService,
  ) {}

  private get contractId(): string {
    return (
      this.config.sorobanNftContractId ||
      'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEU4'
    );
  }

  async verifyNFTOwnership(
    tokenId: string,
    walletAddress: string,
  ): Promise<NftOwnershipResult> {
    this.logger.log(
      `Verifying ownership: tokenId=${tokenId}, wallet=${walletAddress}`,
    );

    try {
      const rpcUrl = this.stellarService.rpcUrl;
      const server = new StellarSdk.rpc.Server(rpcUrl);
      const contract = new StellarSdk.Contract(this.contractId);

      const op = contract.call(
        'owner_of',
        StellarSdk.nativeToScVal(BigInt(tokenId), { type: 'u128' }),
      );

      const sourceAccount = new StellarSdk.Account(walletAddress, '0');
      const tx = new StellarSdk.TransactionBuilder(sourceAccount, {
        fee: '100',
        networkPassphrase: this.stellarService.networkPassphrase,
      })
        .addOperation(op)
        .setTimeout(StellarSdk.TimeoutInfinite)
        .build();

      const simulation = await this.circuitBreakerService.execute(
        this.sorobanCircuitBreakerConfig,
        async () => server.simulateTransaction(tx),
      );

      if (simulation.error) {
        return {
          isOwner: false,
          owned: false,
          error: `Simulation failed: ${simulation.error}`,
        };
      }

      if (!simulation.results || simulation.results.length === 0) {
        return {
          isOwner: false,
          owned: false,
          error: 'No simulation results returned',
        };
      }

      const result = simulation.results[0];
      if (!result.xdr) {
        return {
          isOwner: false,
          owned: false,
          error: 'Missing result XDR',
        };
      }

      const returnValue = StellarSdk.xdr.ScVal.fromXDR(result.xdr, 'base64');
      const ownerAddress = StellarSdk.scValToNative(returnValue) as string;
      const isOwner = ownerAddress === walletAddress;

      return {
        isOwner,
        owned: isOwner,
        ownerAddress,
        error: isOwner ? undefined : 'Caller does not own the NFT on-chain',
      };
    } catch (error) {
      if (error.name === 'ServiceUnavailableException') {
        return {
          isOwner: false,
          owned: false,
          error:
            'Soroban service temporarily unavailable. Please try again later.',
        };
      }

      const message =
        error instanceof Error
          ? error.message
          : 'Ownership verification failed';
      this.logger.error(`Ownership verification failed: ${message}`);
      return {
        isOwner: false,
        owned: false,
        error: message,
      };
    }
  }
}
