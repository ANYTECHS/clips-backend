import {
  Injectable,
  Logger,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IpfsUploadService } from '../nft/ipfs-upload.service';
import { NftMetadataService } from '../nft/nft-metadata.service';
import StellarSdk from '@stellar/stellar-sdk';
import { ConfigService } from '../config/config.service';

export interface PrepareMintResult {
  clipId: number;
  walletAddress: string;
  xdr: string;
  metadataUri: string;
  royaltyBps: number;
}

export interface PrepareTransferResult {
  clipId: number;
  xdr: string;
}

export interface UploadMetadataResult {
  clipId: number;
  cid: string;
  metadataUri: string;
}

export interface RoyaltyShare {
  address: string;
  bps: number;
}

@Injectable()
export class NftMintService {
  private readonly logger = new Logger(NftMintService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ipfsUploadService: IpfsUploadService,
    private readonly nftMetadataService: NftMetadataService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Assert that `userId` owns the clip with `clipId`.
   * Throws NotFoundException or ForbiddenException otherwise.
   */
  async validateClipOwner(
    clipId: number,
    userId: number,
  ): Promise<void> {
    const clip = await this.prisma.clip.findUnique({
      where: { id: clipId },
      include: { video: { select: { userId: true } } },
    });

    if (!clip) {
      throw new NotFoundException(`Clip ${clipId} not found`);
    }

    if (clip.video.userId !== userId) {
      throw new ForbiddenException('You do not own this clip');
    }
  }

  /**
   * Build metadata for a clip and upload to IPFS.
   * Persists the returned metadataUri on the clip record.
   */
  async uploadMetadataToIPFS(clipId: number): Promise<UploadMetadataResult> {
    const clip = await this.prisma.clip.findUnique({
      where: { id: clipId },
      include: {
        royalty: { select: { recipientAddress: true } },
      },
    });

    if (!clip) {
      throw new NotFoundException(`Clip ${clipId} not found`);
    }

    if (!clip.clipUrl) {
      throw new BadRequestException(
        'Clip has no URL — it is not ready for minting',
      );
    }

    const metadata = this.nftMetadataService.build({
      id: clip.id,
      title: clip.title,
      caption: clip.caption,
      clipUrl: clip.clipUrl,
      thumbnail: clip.thumbnail,
      duration: clip.duration,
      viralityScore: clip.viralityScore,
      createdAt: clip.createdAt,
      royaltyBps: clip.royaltyBps ?? 1000,
      royaltyRecipient: clip.royalty?.recipientAddress ?? null,
    });

    const metadataUri = await this.ipfsUploadService.uploadMetadata(metadata, clipId);
    const cid = metadataUri.replace('ipfs://', '');

    await this.prisma.clip.update({
      where: { id: clipId },
      data: { metadataUri },
    });

    this.logger.log(`Metadata for clip ${clipId} uploaded: ${metadataUri}`);
    return { clipId, cid, metadataUri };
  }

  /**
   * Build an unsigned Soroban `mint` transaction XDR for the given clip.
   * The wallet must sign and submit this transaction to finalize minting.
   */
  async prepareMintTx(
    clipId: number,
    walletAddress: string,
  ): Promise<PrepareMintResult> {
    const clip = await this.prisma.clip.findUnique({ where: { id: clipId } });

    if (!clip) {
      throw new NotFoundException(`Clip ${clipId} not found`);
    }

    const metadataUri =
      clip.metadataUri ??
      (await this.uploadMetadataToIPFS(clipId)).metadataUri;

    await this.prisma.clip.update({
      where: { id: clipId },
      data: { nftStatus: 'minting' },
    });

    // Build the unsigned XDR — the Soroban contract call for `mint`
    const xdr = await this.buildMintXdr(clipId, walletAddress, metadataUri);

    return {
      clipId,
      walletAddress,
      xdr,
      metadataUri,
      royaltyBps: clip.royaltyBps ?? 1000,
    };
  }

  /**
   * Record a successfully submitted mint transaction.
   * Updates clip.mintAddress + clip.nftStatus to "minted".
   */
  async confirmMint(clipId: number, mintAddress: string): Promise<void> {
    if (!mintAddress?.trim()) {
      throw new BadRequestException('mintAddress is required');
    }

    await this.prisma.clip.update({
      where: { id: clipId },
      data: {
        mintAddress,
        nftStatus: 'minted',
        mintedAt: new Date(),
      },
    });

    this.logger.log(`Clip ${clipId} confirmed minted at ${mintAddress}`);
  }

  /**
   * Build an unsigned Soroban `burn` transaction XDR.
   */
  async prepareBurnTx(
    clipId: number,
    walletAddress: string,
  ): Promise<PrepareTransferResult> {
    const clip = await this.prisma.clip.findUnique({ where: { id: clipId } });
    if (!clip) throw new NotFoundException(`Clip ${clipId} not found`);
    if (!clip.mintAddress) {
      throw new BadRequestException('Clip has not been minted yet');
    }

    const xdr = await this.buildContractCallXdr('burn', clipId, walletAddress);
    return { clipId, xdr };
  }

  /**
   * Build an unsigned Soroban `set_royalties` transaction XDR.
   */
  async prepareSetRoyaltiesTx(
    clipId: number,
    walletAddress: string,
    shares: RoyaltyShare[],
  ): Promise<PrepareTransferResult> {
    const clip = await this.prisma.clip.findUnique({ where: { id: clipId } });
    if (!clip) throw new NotFoundException(`Clip ${clipId} not found`);

    const xdr = await this.buildContractCallXdr(
      'set_royalties',
      clipId,
      walletAddress,
      shares,
    );
    return { clipId, xdr };
  }

  /**
   * Build an unsigned Soroban `claim_royalties` transaction XDR.
   */
  async prepareClaimRoyaltiesTx(
    clipId: number,
    walletAddress: string,
  ): Promise<PrepareTransferResult> {
    const clip = await this.prisma.clip.findUnique({ where: { id: clipId } });
    if (!clip) throw new NotFoundException(`Clip ${clipId} not found`);

    const xdr = await this.buildContractCallXdr(
      'claim_royalties',
      clipId,
      walletAddress,
    );
    return { clipId, xdr };
  }

  // ── Private XDR helpers ────────────────────────────────────────────────────

  private async buildMintXdr(
    clipId: number,
    walletAddress: string,
    metadataUri: string,
  ): Promise<string> {
    const contractId = this.config.sorobanNftContractId;
    if (!contractId) {
      this.logger.warn('SOROBAN_NFT_CONTRACT_ID not set — returning stub XDR');
      return 'STUB_XDR_MINT';
    }

    try {
      const server = new StellarSdk.rpc.Server(
        this.getStellarRpcUrl(),
      );
      const contract = new StellarSdk.Contract(contractId);
      const sourceAccount = new StellarSdk.Account(walletAddress, '0');
      const networkPassphrase = this.getNetworkPassphrase();

      const op = contract.call(
        'mint',
        StellarSdk.nativeToScVal(BigInt(clipId), { type: 'u128' }),
        new StellarSdk.Address(walletAddress).toScVal(),
        StellarSdk.nativeToScVal(metadataUri, { type: 'string' }),
      );

      const tx = new StellarSdk.TransactionBuilder(sourceAccount, {
        fee: '100',
        networkPassphrase,
      })
        .addOperation(op)
        .setTimeout(StellarSdk.TimeoutInfinite)
        .build();

      // Simulate to get the fee and resource estimates
      const simResult = await server.simulateTransaction(tx);
      if (StellarSdk.rpc.Api.isSimulationError(simResult)) {
        throw new BadRequestException(
          `Soroban simulation failed: ${simResult.error}`,
        );
      }

      const assembledTx = StellarSdk.rpc.assembleTransaction(
        tx,
        simResult,
      ).build();

      return assembledTx.toXDR();
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      this.logger.error(`Failed to build mint XDR for clip ${clipId}: ${(err as Error).message}`);
      throw new BadRequestException(
        `Failed to prepare mint transaction: ${(err as Error).message}`,
      );
    }
  }

  private async buildContractCallXdr(
    method: string,
    clipId: number,
    walletAddress: string,
    _extra?: unknown,
  ): Promise<string> {
    const contractId = this.config.sorobanNftContractId;
    if (!contractId) {
      this.logger.warn(`SOROBAN_NFT_CONTRACT_ID not set — returning stub XDR for ${method}`);
      return `STUB_XDR_${method.toUpperCase()}`;
    }

    try {
      const server = new StellarSdk.rpc.Server(this.getStellarRpcUrl());
      const contract = new StellarSdk.Contract(contractId);
      const sourceAccount = new StellarSdk.Account(walletAddress, '0');

      const op = contract.call(
        method,
        StellarSdk.nativeToScVal(BigInt(clipId), { type: 'u128' }),
        new StellarSdk.Address(walletAddress).toScVal(),
      );

      const tx = new StellarSdk.TransactionBuilder(sourceAccount, {
        fee: '100',
        networkPassphrase: this.getNetworkPassphrase(),
      })
        .addOperation(op)
        .setTimeout(StellarSdk.TimeoutInfinite)
        .build();

      const simResult = await server.simulateTransaction(tx);
      if (StellarSdk.rpc.Api.isSimulationError(simResult)) {
        throw new BadRequestException(`Simulation failed: ${simResult.error}`);
      }

      return StellarSdk.rpc.assembleTransaction(tx, simResult).build().toXDR();
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException(
        `Failed to prepare ${method} transaction: ${(err as Error).message}`,
      );
    }
  }

  private getStellarRpcUrl(): string {
    const network = (process.env.STELLAR_NETWORK ?? 'testnet').toLowerCase();
    return network === 'public'
      ? 'https://soroban-rpc.stellar.org'
      : 'https://soroban-testnet.stellar.org';
  }

  private getNetworkPassphrase(): string {
    const network = (process.env.STELLAR_NETWORK ?? 'testnet').toLowerCase();
    return network === 'public'
      ? 'Public Global Stellar Network ; September 2015'
      : 'Test SDF Network ; September 2015';
  }
}
