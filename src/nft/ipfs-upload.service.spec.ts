import { BadRequestException } from '@nestjs/common';
import { IpfsUploadService, NftMetadata } from './ipfs-upload.service';
import { CircuitBreakerService } from '../common/circuit-breaker/circuit-breaker.service';
import { ConfigService } from '../config/config.service';

describe('IpfsUploadService', () => {
  const circuitBreakerMock = {
    execute: jest.fn().mockImplementation((_config, fn) => fn()),
  };

  const createService = (configOverrides: Partial<ConfigService> = {}) => {
    const config = {
      ipfsProvider: '',
      pinataJwt: 'test-pinata-jwt',
      ipfsApiUrl: 'https://api.pinata.cloud/pinning/pinJSONToIPFS',
      nftStorageApiKey: '',
      ...configOverrides,
    } as ConfigService;

    return new IpfsUploadService(
      circuitBreakerMock as unknown as CircuitBreakerService,
      config,
    );
  };

  const sampleMetadata: NftMetadata = {
    name: 'Clip #1',
    description: 'Test clip',
    image: 'https://cdn.example.com/thumb.jpg',
    animation_url: 'https://cdn.example.com/video.mp4',
    attributes: [{ trait_type: 'royaltyBps', value: 1000 }],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  it('uploads metadata via Pinata and returns ipfs URI', async () => {
    const service = createService();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ IpfsHash: 'bafyPinataCid' }),
    });

    const uri = await service.uploadMetadata(sampleMetadata, 1);

    expect(uri).toBe('ipfs://bafyPinataCid');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.pinata.cloud/pinning/pinJSONToIPFS',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-pinata-jwt',
        }),
      }),
    );
  });

  it('uploads metadata via nft.storage when provider is configured', async () => {
    const service = createService({
      ipfsProvider: 'nftstorage',
      nftStorageApiKey: 'nft-storage-key',
    } as Partial<ConfigService>);

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, value: { cid: 'bafyNftStorageCid' } }),
    });

    const uri = await service.uploadMetadata(sampleMetadata, 2);

    expect(uri).toBe('ipfs://bafyNftStorageCid');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.nft.storage/upload',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer nft-storage-key',
        }),
      }),
    );
  });

  it('throws when Pinata credentials are missing', async () => {
    const service = createService({ pinataJwt: '' } as Partial<ConfigService>);

    await expect(service.uploadMetadata(sampleMetadata, 3)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('throws when nft.storage credentials are missing', async () => {
    const service = createService({
      ipfsProvider: 'nftstorage',
      nftStorageApiKey: '',
    } as Partial<ConfigService>);

    await expect(service.uploadMetadata(sampleMetadata, 4)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('throws when Pinata upload fails', async () => {
    const service = createService();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'internal error',
    });

    await expect(service.uploadMetadata(sampleMetadata, 5)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
