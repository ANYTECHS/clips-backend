import { BadRequestException } from '@nestjs/common';
import { IpfsUploadService } from './ipfs-upload.service';
import { CircuitBreakerService } from '../common/circuit-breaker/circuit-breaker.service';
import { ConfigService } from '../config/config.service';

describe('IpfsUploadService', () => {
  const circuitBreakerMock = {
    execute: jest.fn().mockImplementation((_config, fn) => fn()),
  };

  const createService = (configOverrides: Partial<ConfigService> = {}) => {
    const config = {
      ipfsProvider: 'pinata',
      pinataJwt: 'test-pinata-jwt',
      ipfsApiUrl: 'https://api.pinata.cloud/pinning/pinJSONToIPFS',
      nftStorageApiKey: 'test-nft-storage-key',
      ...configOverrides,
    } as ConfigService;

    return new IpfsUploadService(
      circuitBreakerMock as unknown as CircuitBreakerService,
      config,
    );
  };

  const metadata = {
    name: 'Clip #1',
    description: 'Test clip',
    image: 'https://cdn.example.com/thumb.jpg',
    animation_url: 'https://cdn.example.com/video.mp4',
    attributes: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  it('uploads metadata via Pinata and returns ipfs URI', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ IpfsHash: 'bafyPinataCid' }),
    });

    const service = createService();
    const result = await service.uploadMetadata(metadata, 1);

    expect(result).toBe('ipfs://bafyPinataCid');
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

  it('throws when Pinata credentials are missing', async () => {
    const service = createService({ pinataJwt: '' });

    await expect(service.uploadMetadata(metadata, 2)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('uploads metadata via nft.storage when configured', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ value: { cid: 'bafyNftStorageCid' } }),
    });

    const service = createService({ ipfsProvider: 'nftstorage' });
    const result = await service.uploadMetadata(metadata, 3);

    expect(result).toBe('ipfs://bafyNftStorageCid');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.nft.storage/upload',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-nft-storage-key',
        }),
      }),
    );
  });

  it('throws when nft.storage API key is missing', async () => {
    const service = createService({
      ipfsProvider: 'nftstorage',
      nftStorageApiKey: '',
    });

    await expect(service.uploadMetadata(metadata, 4)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
