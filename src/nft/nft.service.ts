import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { NftConfig } from './nft.config';
import { CreateMintDto } from './dto/mint-clip.dto';

/**
 * A single royalty recipient entry.
 * bps: basis points (100 = 1%).
 */
export interface RoyaltyRecipient {
  wallet: string;
  bps: number;
  label: string;
}

/**
 * The structured mint transaction payload that would be submitted
 * to the Stellar Soroban (or Solana) smart contract.
 *
 * Replace the `buildTransaction` stub with your actual SDK call
 * (e.g. @stellar/stellar-sdk or @solana/web3.js) when the contract
 * is deployed.
 */
export interface MintTransaction {
  clipId: string;
  metadataUri: string;
  royalties: RoyaltyRecipient[];
  /** ISO timestamp when the payload was constructed */
  builtAt: string;
}

export interface MintResult {
  /** Simulated / real on-chain transaction hash */
  txHash: string;
  transaction: MintTransaction;
}

@Injectable()
export class NftService {
  private readonly logger = new Logger(NftService.name);

  constructor(private readonly config: NftConfig) {}

  /**
   * Build and (simulated) submit a mint transaction with multiple royalty
   * recipients: the clip creator and the ClipCash platform.
   *
   * Royalty split example (defaults):
   *   Creator  → 1000 bps (10%)
   *   Platform →  100 bps  (1%)
   *
   * Both values are read from env so they can be changed without a deploy.
   */
  async mintClip(dto: CreateMintDto): Promise<MintResult> {
    this.validateConfig();

    const royalties = this.buildRoyalties(dto.creatorWallet);

    const transaction: MintTransaction = {
      clipId: dto.clipId,
      metadataUri: dto.metadataUri ?? '',
      royalties,
      builtAt: new Date().toISOString(),
    };

    // ── Submit to chain ───────────────────────────────────────────────────────
    // TODO: replace this stub with your actual Stellar / Solana SDK call, e.g.:
    //   const server = new StellarSdk.Server(process.env.STELLAR_RPC_URL);
    //   const txHash = await server.submitTransaction(buildStellarTx(transaction));
    const txHash = await this.submitTransaction(transaction);

    this.logger.log(
      `Minted clip ${dto.clipId} | tx: ${txHash} | royalties: ${JSON.stringify(royalties)}`,
    );

    return { txHash, transaction };
  }

  /**
   * Assemble the royalty recipient list.
   * Order: creator first, platform second (matches most NFT standards).
   */
  buildRoyalties(creatorWallet: string): RoyaltyRecipient[] {
    return [
      {
        wallet: creatorWallet,
        bps: this.config.creatorRoyaltyBps,
        label: 'creator',
      },
      {
        wallet: this.config.platformWallet,
        bps: this.config.platformRoyaltyBps,
        label: 'platform',
      },
    ];
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private validateConfig(): void {
    if (!this.config.platformWallet) {
      throw new BadRequestException(
        'PLATFORM_WALLET_ADDRESS is not configured. Cannot mint NFT.',
      );
    }
    if (this.config.platformRoyaltyBps < 0 || this.config.creatorRoyaltyBps < 0) {
      throw new BadRequestException('Royalty bps values must be non-negative.');
    }
  }

  /**
   * Stub — replace with real chain submission.
   * Returns a fake tx hash for local/dev use.
   */
  private async submitTransaction(tx: MintTransaction): Promise<string> {
    // Simulate async network call
    await Promise.resolve();
    return `sim_tx_${tx.clipId}_${Date.now()}`;
  }
}
