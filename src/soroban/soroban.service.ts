import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StellarService } from '../stellar/stellar.service';

/** Mirrors on-chain constants in contracts/nft-contract/src/lib.rs. */
export const CONTRACT_NAME = 'ClipCash NFT';
export const CONTRACT_SYMBOL = 'CLIP';
export const CONTRACT_VERSION = '1.0.0';
/** Approximate Soroban resource fees (stroops) excluding the inclusion fee. */
export const RESOURCE_FEE_STROOPS = { mint: 120_000, transfer: 60_000 } as const;

export type FeeOperation = keyof typeof RESOURCE_FEE_STROOPS;

export const FEE_ESTIMATE_DISCLAIMER =
  'Estimate only. Actual fees depend on network congestion and resource usage at submission time and may change before the transaction is signed.';

@Injectable()
export class SorobanService {
  private readonly logger = new Logger(SorobanService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stellar: StellarService,
  ) {}

  getContractInfo() {
    return {
      name: CONTRACT_NAME,
      symbol: CONTRACT_SYMBOL,
      version: CONTRACT_VERSION,
      owner: process.env.SOROBAN_CONTRACT_ADMIN ?? null,
      platformFee: Number(process.env.PLATFORM_FEE_BPS ?? 0),
    };
  }

  async estimateFee(operation: FeeOperation) {
    let inclusionFee: number;
    try {
      const res = await fetch(`${this.stellar.horizonUrl}/fee_stats`);
      if (!res.ok) throw new Error(`Horizon fee_stats ${res.status}`);
      const stats = (await res.json()) as { fee_charged?: { p50?: string } };
      inclusionFee = Number(stats.fee_charged?.p50 ?? 100);
      if (!Number.isFinite(inclusionFee)) throw new Error('Invalid fee_stats');
    } catch (e) {
      this.logger.warn(`Fee estimation failed: ${(e as Error).message}`);
      throw new ServiceUnavailableException('Fee estimation unavailable');
    }
    return {
      operation,
      estimatedFee: inclusionFee + RESOURCE_FEE_STROOPS[operation],
      unit: 'stroops',
      network: this.stellar.network,
      timestamp: new Date().toISOString(),
      limitations: FEE_ESTIMATE_DISCLAIMER,
    };
  }

  private async findClip(tokenId: number) {
    const clip = await this.prisma.clip.findUnique({
      where: { id: tokenId },
      select: { id: true, nftStatus: true, nftFrozen: true },
    });
    if (!clip || clip.nftStatus === 'none') {
      throw new NotFoundException(`NFT ${tokenId} not found`);
    }
    return clip;
  }

  async setFrozen(tokenId: number, frozen: boolean) {
    const clip = await this.findClip(tokenId);
    if (clip.nftFrozen === frozen) {
      throw new ConflictException(
        `NFT ${tokenId} is already ${frozen ? 'frozen' : 'unfrozen'}`,
      );
    }
    await this.prisma.clip.update({ where: { id: tokenId }, data: { nftFrozen: frozen } });
    this.logger.log(`NFT ${tokenId} ${frozen ? 'frozen' : 'unfrozen'}`);
    return { tokenId, frozen };
  }

  async getFreezeStatus(tokenId: number) {
    const clip = await this.findClip(tokenId);
    return { tokenId, frozen: clip.nftFrozen };
  }
}
