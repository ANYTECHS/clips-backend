import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  CircuitBreakerConfig,
  CircuitBreakerService,
} from '../common/circuit-breaker/circuit-breaker.service';
import { ConfigService } from '../config/config.service';
import { IpfsProvider, NftMetadata } from './nft-metadata.types';

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

  async uploadMetadata(
    metadata: NftMetadata,
    clipId: number,
  ): Promise<string> {
    const provider = this.config.ipfsProvider;

    return this.circuitBreakerService.execute(
      this.circuitBreakerConfig,
      async () => {
        if (provider === 'nftstorage') {
          return this.uploadViaNftStorage(metadata, clipId);
        }
        return this.uploadViaPinata(metadata, clipId);
      },
    );
  }

  private async uploadViaPinata(
    metadata: NftMetadata,
    clipId: number,
  ): Promise<string> {
    const pinataJwt = this.config.pinataJwt;
    const ipfsApiUrl = this.config.ipfsApiUrl;

    if (!pinataJwt) {
      throw new BadRequestException(
        'Missing PINATA_JWT or IPFS_JWT for NFT metadata upload',
      );
    }

    const body = ipfsApiUrl.includes('pinata.cloud')
      ? {
          pinataMetadata: { name: `clip-${clipId}-metadata` },
          pinataContent: metadata,
        }
      : metadata;

    const response = await fetch(ipfsApiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${pinataJwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const message = await response.text();
      throw new BadRequestException(
        `IPFS metadata upload failed (${response.status}): ${message.slice(0, 300)}`,
      );
    }

    const payload = (await response.json()) as {
      IpfsHash?: string;
      cid?: string;
      hash?: string;
    };

    const cid = payload.IpfsHash ?? payload.cid ?? payload.hash;
    if (!cid) {
      throw new BadRequestException(
        'IPFS metadata upload response missing CID',
      );
    }

    this.logger.log(`Uploaded metadata for clip ${clipId} to Pinata: ${cid}`);
    return `ipfs://${cid}`;
  }

  private async uploadViaNftStorage(
    metadata: NftMetadata,
    clipId: number,
  ): Promise<string> {
    const apiKey = this.config.nftStorageApiKey;

    if (!apiKey) {
      throw new BadRequestException(
        'Missing NFT_STORAGE_API_KEY for nft.storage metadata upload',
      );
    }

    const response = await fetch('https://api.nft.storage/upload', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...metadata,
        name: metadata.name || `clip-${clipId}-metadata`,
      }),
    });

    if (!response.ok) {
      const message = await response.text();
      throw new BadRequestException(
        `nft.storage metadata upload failed (${response.status}): ${message.slice(0, 300)}`,
      );
    }

    const payload = (await response.json()) as {
      value?: { cid?: string };
      cid?: string;
    };

    const cid = payload.value?.cid ?? payload.cid;
    if (!cid) {
      throw new BadRequestException(
        'nft.storage metadata upload response missing CID',
      );
    }

    this.logger.log(`Uploaded metadata for clip ${clipId} to nft.storage: ${cid}`);
    return `ipfs://${cid}`;
  }

  getProvider(): IpfsProvider {
    return this.config.ipfsProvider;
  }
}
