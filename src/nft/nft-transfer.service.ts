import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import StellarSdk from '@stellar/stellar-sdk';
import { StellarService } from '../stellar/stellar.service';
import { NftOwnershipService } from './nft-ownership.service';
import { RoyaltyConfigurationService } from './royalty-configuration.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CircuitBreakerConfig,
  CircuitBreakerService,
} from '../common/circuit-breaker/circuit-breaker.service';
import { TransferNftResponseDto } from './dto/transfer-nft.dto';

/**
 * Builds unsigned Soroban `transfer_with_royalty` transactions (Issue #843).
 */
@Injectable()
export class NftTransferService {
  private readonly logger = new Logger(NftTransferService.name);

  private readonly circuitBreakerConfig: CircuitBreakerConfig = {
    name: 'soroban-nft-transfer',
    failureThreshold: 5,
    recoveryTimeout: 30000,
    samplingDuration: 60000,
  };

  constructor(
    private readonly stellarService: StellarService,
    private readonly nftOwnershipService: NftOwnershipService,
    private readonly royaltyConfigurationService: RoyaltyConfigurationService,
    private readonly prisma: PrismaService,
    private readonly circuitBreakerService: CircuitBreakerService,
  ) {}

  private get CONTRACT_ID(): string {
    return (
      process.env.SOROBAN_NFT_CONTRACT_ID ||
      'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEU4'
    );
  }

  /**
   * Validate ownership, recipient, soulbound restrictions, then return unsigned XDR.
   */
  async prepareTransferTx(
    tokenId: number,
    fromWallet: string,
    toWallet: string,
    salePrice: number,
    royaltyBpsOverride?: number,
  ): Promise<TransferNftResponseDto> {
    if (tokenId <= 0) {
      throw new BadRequestException('Token ID must be a positive integer');
    }

    const fromCheck = this.stellarService.validateAddress(fromWallet);
    if (!fromCheck.valid) {
      throw new BadRequestException(
        `Invalid sender Stellar address: ${fromCheck.message}`,
      );
    }

    const toCheck = this.stellarService.validateAddress(toWallet);
    if (!toCheck.valid) {
      throw new BadRequestException(
        `Invalid recipient Stellar address: ${toCheck.message}`,
      );
    }

    if (fromWallet === toWallet) {
      throw new BadRequestException('Sender and recipient must be different');
    }

    const ownership = await this.nftOwnershipService.verifyNFTOwnership(
      tokenId.toString(),
      fromWallet,
    );
    if (!ownership.isOwner) {
      throw new ForbiddenException(
        ownership.error || 'Caller does not own this NFT on-chain',
      );
    }

    const soulbound = await this.isSoulbound(tokenId);
    if (soulbound) {
      throw new BadRequestException('Soulbound NFTs cannot be transferred');
    }

    const royaltyBps = await this.resolveRoyaltyBps(tokenId, royaltyBpsOverride);
    const royaltyAmount =
      this.royaltyConfigurationService.calculateRoyalty(salePrice, royaltyBps);
    const netToSeller = salePrice - royaltyAmount;

    const server = new StellarSdk.rpc.Server(this.stellarService.rpcUrl);
    const sourceAccount = await this.circuitBreakerService.execute(
      this.circuitBreakerConfig,
      async () => server.getAccount(fromWallet),
    );

    const contract = new StellarSdk.Contract(this.CONTRACT_ID);
    const op = contract.call(
      'transfer_with_royalty',
      StellarSdk.nativeToScVal(BigInt(tokenId), { type: 'u64' }),
      StellarSdk.Address.fromString(fromWallet).toScVal(),
      StellarSdk.Address.fromString(toWallet).toScVal(),
      StellarSdk.nativeToScVal(BigInt(salePrice), { type: 'i128' }),
      StellarSdk.nativeToScVal(royaltyBps, { type: 'u32' }),
    );

    const tx = new StellarSdk.TransactionBuilder(sourceAccount, {
      fee: '10000',
      networkPassphrase: this.stellarService.networkPassphrase,
    })
      .addOperation(op)
      .setTimeout(StellarSdk.TimeoutInfinite)
      .build();

    this.logger.log(
      `Prepared transfer XDR for token ${tokenId}: ${fromWallet.slice(0, 8)}… → ${toWallet.slice(0, 8)}…`,
    );

    return {
      xdr: tx.toXDR(),
      action: 'transfer_with_royalty',
      tokenId: tokenId.toString(),
      contractId: this.CONTRACT_ID,
      network: this.stellarService.network,
      royaltyBreakdown: {
        salePrice,
        royaltyBps,
        royaltyAmount,
        netToSeller,
      },
    };
  }

  private async resolveRoyaltyBps(
    tokenId: number,
    override?: number,
  ): Promise<number> {
    if (override !== undefined && override !== null) {
      this.royaltyConfigurationService.validateRoyaltyBps(override);
      return override;
    }

    const clip = await this.prisma.clip.findUnique({
      where: { id: tokenId },
      select: { royaltyBps: true },
    });
    return this.royaltyConfigurationService.getCreatorRoyaltyBps(
      clip?.royaltyBps,
    );
  }

  /**
   * Query on-chain metadata / is_soulbound when available; fall back to false.
   */
  private async isSoulbound(tokenId: number): Promise<boolean> {
    try {
      const server = new StellarSdk.rpc.Server(this.stellarService.rpcUrl);
      const contract = new StellarSdk.Contract(this.CONTRACT_ID);
      const op = contract.call(
        'is_soulbound',
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

      const simulation = await this.circuitBreakerService.execute(
        this.circuitBreakerConfig,
        async () => server.simulateTransaction(tx),
      );

      if ('error' in simulation && simulation.error) {
        return false;
      }

      const results = (simulation as { results?: Array<{ xdr: string }> }).results;
      if (!results?.[0]?.xdr) {
        return false;
      }

      const returnValue = StellarSdk.xdr.ScVal.fromXDR(results[0].xdr, 'base64');
      return Boolean(StellarSdk.scValToNative(returnValue));
    } catch (err) {
      this.logger.warn(
        `is_soulbound check failed for token ${tokenId}: ${err instanceof Error ? err.message : err}`,
      );
      return false;
    }
  }
}
