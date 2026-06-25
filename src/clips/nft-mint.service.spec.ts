import { BadRequestException, NotFoundException } from '@nestjs/common';
import { NftMintService } from './nft-mint.service';
import { IpfsUploadService } from '../nft/ipfs-upload.service';
import { ConfigService } from '../config/config.service';

// Mock the entire Stellar SDK so non-configurable class properties can be replaced
jest.mock('@stellar/stellar-sdk', () => {
  const mockOp = { type: 'invokeHostFunction' };
  const mockTx = { toXDR: jest.fn().mockReturnValue('xdr-string') };
  const mockBuilder = {
    addOperation: jest.fn().mockReturnThis(),
    setTimeout: jest.fn().mockReturnThis(),
    build: jest.fn().mockReturnValue(mockTx),
  };
  const mockContract = { call: jest.fn().mockReturnValue(mockOp) };

  return {
    __esModule: true,
    default: {
      rpc: { Server: jest.fn() },
      Contract: jest.fn().mockReturnValue(mockContract),
      TransactionBuilder: jest.fn().mockReturnValue(mockBuilder),
      Account: jest.fn().mockReturnValue({}),
      Address: { fromString: jest.fn().mockReturnValue({ toScVal: jest.fn() }) },
      nativeToScVal: jest.fn().mockReturnValue({}),
      scValToNative: jest.fn(),
      xdr: { ScVal: { fromXDR: jest.fn().mockReturnValue({}) } },
      TimeoutInfinite: 0,
    },
  };
});

import StellarSdk from '@stellar/stellar-sdk';

const VALID_WALLET = 'GDV76E6XN6A3Q3WXVZ4KPRQ7L6E6XN6A3Q3WXVZ4KPRQ7L6E6XN6';

const prismaMock = {
  clip: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
};

const stellarMock = {
  validateAddress: jest.fn().mockReturnValue({ valid: true }),
  networkPassphrase: 'Test SDF Network ; September 2015',
  rpcUrl: 'https://soroban-testnet.stellar.org',
  network: 'testnet',
};

const metricsMock = {
  incrementNftMints: jest.fn(),
};

const circuitBreakerMock = {
  execute: jest.fn().mockImplementation((_config: unknown, fn: () => unknown) => fn()),
};

function makeService(): NftMintService {
  return new NftMintService(
    prismaMock as any,
    stellarMock as any,
    metricsMock as any,
    circuitBreakerMock as any,
    configMock,
    ipfsUploadMock as unknown as IpfsUploadService,
    nftOwnershipMock as any,
    royaltyConfigMock as any,
  );
}

const baseClip = {
  id: 5,
  title: 'Amazing Clip',
  caption: 'A test clip',
  clipUrl: 'https://cdn.example.com/video.mp4',
  thumbnail: 'https://cdn.example.com/thumb.jpg',
  duration: 27,
  viralityScore: 88,
  createdAt: new Date('2026-03-01T00:00:00.000Z'),
  postStatus: { tiktok: true },
  nftStatus: null,
  metadataUri: null,
  royaltyBps: null,
  mintAddress: null,
  clipPosts: [],
};

const configMock = {
  creatorRoyaltyBps: 1000,
  platformRoyaltyBps: 100,
  platformWallet: 'GDV76E6XN6A3Q3WXVZ4KPRQ7L6E6XN6A3Q3WXVZ4KPRQ7L6E6XN6',
  sorobanNftContractId: '',
} as ConfigService;

const ipfsUploadMock = {
  uploadMetadata: jest.fn(),
};

const nftOwnershipMock = {
  verifyNFTOwnership: jest.fn(),
};

const royaltyConfigMock = {
  getCreatorRoyaltyBps: jest.fn().mockReturnValue(1000),
  buildRoyaltyMap: jest.fn(),
};

describe('NftMintService.uploadMetadataToIPFS', () => {
  let service: NftMintService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = makeService();
  });

  it('throws NotFoundException when clip does not exist', async () => {
    prismaMock.clip.findUnique.mockResolvedValue(null);
    await expect(service.uploadMetadataToIPFS(101)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws BadRequestException when clipUrl is missing', async () => {
    prismaMock.clip.findUnique.mockResolvedValue({ id: 2, clipUrl: '' });
    await expect(service.uploadMetadataToIPFS(2)).rejects.toBeInstanceOf(BadRequestException);
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
    expect(result).toEqual({ clipId: 5, cid: 'bafyTestCid123', metadataUri: 'ipfs://bafyTestCid123' });
  });
});

// ─── prepareMintTx ──────────────────────────────────────────────────────────

describe('NftMintService.prepareMintTx', () => {
  let service: NftMintService;
  beforeEach(() => { service = makeService(); });

  it('throws BadRequestException for invalid wallet address', async () => {
    stellarMock.validateAddress.mockReturnValueOnce({ valid: false, message: 'bad address' });
    await expect(service.prepareMintTx(5, 'invalid')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws NotFoundException when clip does not exist', async () => {
    prismaMock.clip.findUnique.mockResolvedValue(null);
    await expect(service.prepareMintTx(99, VALID_WALLET)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws BadRequestException when clip is already minted', async () => {
    prismaMock.clip.findUnique.mockResolvedValue({ ...baseClip, nftStatus: 'minted' });
    await expect(service.prepareMintTx(5, VALID_WALLET)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws BadRequestException when clip already has a mintAddress', async () => {
    prismaMock.clip.findUnique.mockResolvedValue({ ...baseClip, mintAddress: 'CONTRACT_ID' });
    await expect(service.prepareMintTx(5, VALID_WALLET)).rejects.toThrow('already been minted on-chain');
  });

  it('throws BadRequestException when clip is in minting state', async () => {
    prismaMock.clip.findUnique.mockResolvedValue({ ...baseClip, nftStatus: 'minting' });
    await expect(service.prepareMintTx(5, VALID_WALLET)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws BadRequestException when clipUrl is missing', async () => {
    prismaMock.clip.findUnique.mockResolvedValue({ ...baseClip, clipUrl: null });
    await expect(service.prepareMintTx(5, VALID_WALLET)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns xdr and metadata when clip is ready', async () => {
    prismaMock.clip.findUnique.mockResolvedValue({ ...baseClip, metadataUri: 'ipfs://abc123' });
    prismaMock.clip.update.mockResolvedValue({});

    // Mock rpc.Server to return a fake account
    const fakeAccount = { accountId: () => VALID_WALLET, sequenceNumber: () => '0', incrementSequenceNumber: jest.fn() };
    (StellarSdk.rpc.Server as jest.Mock).mockImplementation(() => ({
      getAccount: jest.fn().mockResolvedValue(fakeAccount),
    }));
    circuitBreakerMock.execute.mockImplementation((_config, fn) => fn());

    const result = await service.prepareMintTx(5, VALID_WALLET);

    expect(result).toMatchObject({
      xdr: 'xdr-string',
      clipId: 5,
      tokenId: 5,
      metadataUri: 'ipfs://abc123',
      to: VALID_WALLET,
    });
    expect(prismaMock.clip.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { nftStatus: 'minting' },
    });
  });

  it('sets nftStatus to failed and rethrows on unexpected error', async () => {
    prismaMock.clip.findUnique.mockResolvedValue({ ...baseClip, metadataUri: 'ipfs://abc' });
    prismaMock.clip.update.mockResolvedValue({});
    circuitBreakerMock.execute.mockRejectedValue(new Error('RPC error'));

    await expect(service.prepareMintTx(5, VALID_WALLET)).rejects.toBeInstanceOf(BadRequestException);
    expect(prismaMock.clip.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { nftStatus: 'failed' },
    });
    expect(metricsMock.incrementNftMints).toHaveBeenCalledWith('failure');
  });
});

// ─── confirmMint ─────────────────────────────────────────────────────────────

describe('NftMintService.confirmMint', () => {
  let service: NftMintService;
  beforeEach(() => { service = makeService(); });

  it('updates clip to minted status and returns success', async () => {
    prismaMock.clip.findUnique.mockResolvedValue({
      id: 5,
      nftStatus: 'minting',
      mintAddress: null,
    });
    prismaMock.clip.update.mockResolvedValue({
      id: 5,
      mintAddress: 'CONTRACT_ID',
      nftStatus: 'minted',
    });

    const result = await service.confirmMint(5, 'CONTRACT_ID');

    expect(prismaMock.clip.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { nftStatus: 'minted', mintAddress: 'CONTRACT_ID', mintedAt: expect.any(Date) },
    });
    expect(result).toEqual({
      success: true,
      clip: { id: 5, mintAddress: 'CONTRACT_ID', nftStatus: 'minted' },
    });
    expect(metricsMock.incrementNftMints).toHaveBeenCalledWith('success');
  });

  it('throws BadRequestException and increments failure when prisma update fails', async () => {
    prismaMock.clip.update.mockRejectedValue(new Error('DB error'));
    await expect(service.confirmMint(5, 'CONTRACT_ID')).rejects.toBeInstanceOf(BadRequestException);
    expect(metricsMock.incrementNftMints).toHaveBeenCalledWith('failure');
  });

  it('rejects confirmMint when clip is already finalized', async () => {
    prismaMock.clip.findUnique.mockResolvedValue({
      id: 5,
      nftStatus: 'minted',
      mintAddress: 'CONTRACT_ID',
    });

    await expect(service.confirmMint(5, 'CONTRACT_ID')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects confirmMint when clip is missing', async () => {
    prismaMock.clip.findUnique.mockResolvedValue(null);

    await expect(service.confirmMint(5, 'CONTRACT_ID')).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ─── verifyNFTOwnership ──────────────────────────────────────────────────────

describe('NftMintService.verifyNFTOwnership', () => {
  let service: NftMintService;
  beforeEach(() => {
    service = makeService();
    (StellarSdk.rpc.Server as jest.Mock).mockImplementation(() => ({
      simulateTransaction: jest.fn(),
    }));
  });

  it('returns owned:false with error when ownership verification returns error', async () => {
    nftOwnershipMock.verifyNFTOwnership.mockResolvedValue({ isOwner: false, error: 'Network error' });
    const result = await service.verifyNFTOwnership('5', VALID_WALLET);
    expect(result.owned).toBe(false);
    expect(result.error).toBe('Network error');
  });

  it('returns owned:false when ownership returns error', async () => {
    nftOwnershipMock.verifyNFTOwnership.mockResolvedValue({ isOwner: false, error: 'Simulation failed' });
    const result = await service.verifyNFTOwnership('5', VALID_WALLET);
    expect(result.owned).toBe(false);
    expect(result.error).toContain('Simulation failed');
  });

  it('returns owned:false when ownership returns not owner', async () => {
    nftOwnershipMock.verifyNFTOwnership.mockResolvedValue({ isOwner: false });
    const result = await service.verifyNFTOwnership('5', VALID_WALLET);
    expect(result.owned).toBe(false);
  });

  it('returns owned:true when ownership verification succeeds', async () => {
    nftOwnershipMock.verifyNFTOwnership.mockResolvedValue({ isOwner: true });
    const result = await service.verifyNFTOwnership('5', VALID_WALLET);
    expect(result.owned).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('returns owned:false when ownership returns different owner', async () => {
    nftOwnershipMock.verifyNFTOwnership.mockResolvedValue({ isOwner: false });
    const result = await service.verifyNFTOwnership('5', VALID_WALLET);
    expect(result.owned).toBe(false);
  });
});
