import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  CircuitBreakerConfig,
  CircuitBreakerService,
} from '../common/circuit-breaker/circuit-breaker.service';
import { ConfigService } from '../config/config.service';

export interface NftMetadataAttribute {
  trait_type: string;
  value: string | number;
}

export interface NftMetadata {
  name: string;
  description: string;
  image: string;
  animation_url: string;
  external_url?: string;
  attributes: NftMetadataAttribute[];
}

export type IpfsProvider = 'pinata' | 'nftstorage';

interface PinataUploadResponse {
  IpfsHash?: string;
  cid?: string;
  hash?: string;
}

interface NftStorageUploadResponse {
  ok?: boolean;
  value?: { cid?: string };
}

@Injectable()
export class IpfsUploadService {
  private readonly logger = new Logger(IpfsUploadService.name);

  private readonly circuitBreakerConfig: CircuitBreakerConfig = {
    name: 'ipfs-upload',
    failureThreshold: 5,
    recoveryTimeout: 30000,
    samplingDuration: 60000,
  };

  constructor(
    private readonly circuitBreakerService: CircuitBreakerService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Upload NFT metadata JSON to IPFS via Pinata or nft.storage.
   * Returns an ipfs:// URI for the pinned content.
   */
  async uploadMetadata(
    metadata: NftMetadata,
    clipId: number,
  ): Promise<string> {
    const provider = this.resolveProvider();

    return this.circuitBreakerService.execute(
      this.circuitBreakerConfig,
      async () => {
        if (provider === 'nftstorage') {
          return this.uploadViaNftStorage(metadata);
        }
        return this.uploadViaPinata(metadata, clipId);
      },
    );
  }

  private resolveProvider(): IpfsProvider {
    const configured = this.config.ipfsProvider?.toLowerCase();
    if (configured === 'nftstorage' || configured === 'nft.storage') {
      return 'nftstorage';
    }
    if (configured === 'pinata') {
      return 'pinata';
    }

    if (this.config.nftStorageApiKey) {
      return 'nftstorage';
    }

    return 'pinata';
  }

  private async uploadViaPinata(
    metadata: NftMetadata,
    clipId: number,
  ): Promise<string> {
    const jwt = this.config.pinataJwt;
    if (!jwt) {
      throw new BadRequestException(
        'Missing PINATA_JWT or IPFS_JWT for Pinata metadata upload',
      );
    }

    const apiUrl =
      this.config.ipfsApiUrl ??
      'https://api.pinata.cloud/pinning/pinJSONToIPFS';

    const body = apiUrl.includes('pinata.cloud')
      ? {
          pinataMetadata: { name: `clip-${clipId}-metadata` },
          pinataContent: metadata,
        }
      : metadata;

    this.logger.log(`Uploading metadata for clip ${clipId} via Pinata`);

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const message = await response.text();
      throw new BadRequestException(
        `Pinata metadata upload failed (${response.status}): ${message.slice(0, 300)}`,
      );
    }

    const payload = (await response.json()) as PinataUploadResponse;
    const cid = payload.IpfsHash ?? payload.cid ?? payload.hash;
    if (!cid) {
      throw new BadRequestException(
        'Pinata metadata upload response missing CID',
      );
    }

    return `ipfs://${cid}`;
  }

  private async uploadViaNftStorage(metadata: NftMetadata): Promise<string> {
    const apiKey = this.config.nftStorageApiKey;
    if (!apiKey) {
      throw new BadRequestException(
        'Missing NFT_STORAGE_API_KEY for nft.storage metadata upload',
      );
    }

    this.logger.log('Uploading metadata via nft.storage');

    const response = await fetch('https://api.nft.storage/upload', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(metadata),
    });

    if (!response.ok) {
      const message = await response.text();
      throw new BadRequestException(
        `nft.storage metadata upload failed (${response.status}): ${message.slice(0, 300)}`,
      );
    }

    const payload = (await response.json()) as NftStorageUploadResponse;
    const cid = payload.value?.cid;
    if (!cid) {
      throw new BadRequestException(
        'nft.storage metadata upload response missing CID',
      );
    }

    return `ipfs://${cid}`;
  }
}
