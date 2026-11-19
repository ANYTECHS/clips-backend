import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AdminContractService } from './admin-contract.service';
import { RefreshMetadataResponseDto } from './dto/refresh-metadata.dto';

const COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Backend-authorized metadata refresh with 30-day cooldown (Issue #837).
 * Wraps AdminContractService and records refresh attempts for cooldown enforcement.
 */
@Injectable()
export class NftMetadataRefreshService {
  private readonly logger = new Logger(NftMetadataRefreshService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly adminContractService: AdminContractService,
  ) {}

  async prepareRefreshWithCooldown(
    tokenId: number,
    adminAddress: string,
    metadata: Record<string, string | number | boolean>,
  ): Promise<RefreshMetadataResponseDto> {
    await this.assertCooldownElapsed(tokenId);

    const result = await this.adminContractService.prepareRefreshMetadataTx(
      tokenId,
      adminAddress,
      metadata,
    );

    // Record the refresh preparation so subsequent calls hit the cooldown.
    // On-chain confirmation may later update txHash via a separate confirm flow.
    await this.prisma.nftMetadataRefresh.create({
      data: {
        tokenId,
        adminAddress,
        refreshedAt: new Date(),
      },
    });

    this.logger.log(
      `Metadata refresh prepared for token ${tokenId} by ${adminAddress.slice(0, 8)}…`,
    );

    return result;
  }

  /**
   * Confirm a submitted refresh (optional) and attach the tx hash.
   */
  async confirmRefresh(tokenId: number, txHash: string): Promise<void> {
    const latest = await this.prisma.nftMetadataRefresh.findFirst({
      where: { tokenId },
      orderBy: { refreshedAt: 'desc' },
    });
    if (latest && !latest.txHash) {
      await this.prisma.nftMetadataRefresh.update({
        where: { id: latest.id },
        data: { txHash },
      });
    }
  }

  private async assertCooldownElapsed(tokenId: number): Promise<void> {
    const latest = await this.prisma.nftMetadataRefresh.findFirst({
      where: { tokenId },
      orderBy: { refreshedAt: 'desc' },
    });

    if (!latest) {
      return;
    }

    const elapsed = Date.now() - latest.refreshedAt.getTime();
    if (elapsed < COOLDOWN_MS) {
      const daysLeft = Math.ceil((COOLDOWN_MS - elapsed) / (24 * 60 * 60 * 1000));
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `Metadata refresh is subject to a 30-day cooldown. Try again in ~${daysLeft} day(s).`,
          error: 'Too Many Requests',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
