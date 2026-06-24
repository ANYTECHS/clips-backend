import { BadRequestException, NotFoundException } from '@nestjs/common';
import { NftMintService } from './nft-mint.service';

describe('NftMintService uploadMetadataToIPFS', () => {
  const prismaMock = {
    clip: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const stellarMock = {
    networkPassphrase: 'Test SDF Network ; September 2015',
    rpcUrl: 'https://soroban-testnet.stellar.org',
    network: 'testnet',
    validateAddress: jest.fn().mockReturnValue({ valid: true }),
  };

  const metricsMock = {
    incrementNftMints: jest.fn(),
  };

  const circuitBreakerMock = {
    execute: jest.fn().mockImplementation((_config, fn) => fn()),
  };

  const configMock = {
    creatorRoyaltyBps: 1000,
    platformRoyaltyBps: 100,
    platformWallet: 'GDV76E6XN6A3Q3WXVZ4KPRQ7L6E6XN6A3Q3WXVZ4KPRQ7L6E6XN6',
    sorobanNftContractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEU4',
  };

  const ipfsUploadMock = {
    uploadMetadata: jest.fn(),
  };

  let service: NftMintService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new NftMintService(
      prismaMock as any,
      stellarMock as any,
      metricsMock as any,
      circuitBreakerMock as any,
      configMock as any,
      ipfsUploadMock as any,
    );
  });

  it('throws NotFoundException when clip does not exist', async () => {
    prismaMock.clip.findUnique.mockResolvedValue(null);

    await expect(service.uploadMetadataToIPFS(101)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('throws BadRequestException when clipUrl is missing', async () => {
    prismaMock.clip.findUnique.mockResolvedValue({
      id: 2,
      clipUrl: '',
    });

    await expect(service.uploadMetadataToIPFS(2)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('uploads metadata, persists metadataUri, and returns cid', async () => {
    prismaMock.clip.findUnique.mockResolvedValue({
      id: 5,
      title: 'Amazing Clip',
      caption: 'A test clip',
      clipUrl: 'https://cdn.example.com/video.mp4',
      thumbnail: 'https://cdn.example.com/thumb.jpg',
      duration: 27,
      viralityScore: 88,
      createdAt: new Date('2026-03-01T00:00:00.000Z'),
      postStatus: { tiktok: true },
    });

    ipfsUploadMock.uploadMetadata.mockResolvedValue('ipfs://bafyTestCid123');
    prismaMock.clip.update.mockResolvedValue({});

    const result = await service.uploadMetadataToIPFS(5);

    expect(ipfsUploadMock.uploadMetadata).toHaveBeenCalledTimes(1);
    const [metadata, clipId] = ipfsUploadMock.uploadMetadata.mock.calls[0];

    expect(clipId).toBe(5);
    expect(metadata as any).toMatchObject({
      name: 'Amazing Clip',
      description: 'A test clip',
      image: 'https://cdn.example.com/thumb.jpg',
      animation_url: 'https://cdn.example.com/video.mp4',
    });
    expect((metadata as any).attributes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ trait_type: 'royaltyBps', value: 1000 }),
        expect.objectContaining({ trait_type: 'royaltyPercent', value: 10 }),
      ]),
    );

    expect(prismaMock.clip.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { metadataUri: 'ipfs://bafyTestCid123' },
    });

    expect(result).toEqual({
      clipId: 5,
      cid: 'bafyTestCid123',
      metadataUri: 'ipfs://bafyTestCid123',
    });
  });
});
