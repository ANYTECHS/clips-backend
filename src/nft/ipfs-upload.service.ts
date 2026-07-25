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

export interface NftRoyaltyInfo {
  bps: number;
  percent: number;
  recipient?: string;
}

export interface NftMetadata {
  name: string;
  description: string;
  image: string;
  animation_url: string;
  external_url?: string;
  attributes: NftMetadataAttribute[];
  /** OpenSea-compatible creator royalty in basis points (e.g. 1000 = 10%). */
  seller_fee_basis_points: number;
  /** Optional royalty recipient (Stellar G... address when known). */
  fee_recipient?: string;
  /** Explicit royalty block for marketplaces / mint clients. */
  royalty: NftRoyaltyInfo;
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
   * Validates that metadata satisfies NFT standards before upload.
   * Throws BadRequestException when required fields are absent or any
   * attribute contains an empty trait_type or a null/undefined value.
   */
  validateMetadata(metadata: NftMetadata): void {
    if (!metadata.name?.trim()) {
      throw new BadRequestException(
        'NFT metadata is missing required field: name',
      );
    }
    if (!metadata.description?.trim()) {
      throw new BadRequestException(
        'NFT metadata is missing required field: description',
      );
    }
    if (!metadata.image?.trim()) {
      throw new BadRequestException(
        'NFT metadata is missing required field: image',
      );
    }
    if (!metadata.animation_url?.trim()) {
      throw new BadRequestException(
        'NFT metadata is missing required field: animation_url',
      );
    }
    if (!Array.isArray(metadata.attributes)) {
      throw new BadRequestException(
        'NFT metadata attributes must be an array',
      );
    }
    for (const attr of metadata.attributes) {
      if (!attr.trait_type?.trim()) {
        throw new BadRequestException(
          'NFT metadata attribute has an empty trait_type',
        );
      }
      if (attr.value === null || attr.value === undefined) {
        throw new BadRequestException(
          `NFT metadata attribute "${attr.trait_type}" has a null or undefined value`,
        );
      }
    }
    if (
      typeof metadata.seller_fee_basis_points !== 'number' ||
      !Number.isFinite(metadata.seller_fee_basis_points) ||
      metadata.seller_fee_basis_points < 0
    ) {
      throw new BadRequestException(
        'NFT metadata is missing required royalty field: seller_fee_basis_points',
      );
    }
    if (
      !metadata.royalty ||
      typeof metadata.royalty.bps !== 'number' ||
      typeof metadata.royalty.percent !== 'number'
    ) {
      throw new BadRequestException(
        'NFT metadata is missing required royalty info (royalty.bps / royalty.percent)',
      );
    }
  }

  /**
   * Upload NFT metadata JSON to IPFS via Pinata or nft.storage.
   * Returns an ipfs:// URI for the pinned content.
   */
  async uploadMetadata(
    metadata: NftMetadata,
    clipId: number,
  ): Promise<string> {
    this.validateMetadata(metadata);
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
