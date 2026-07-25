import { BadRequestException, NotFoundException } from '@nestjs/common';
import { NftMintService } from './nft-mint.service';
import { IpfsUploadService } from '../nft/ipfs-upload.service';
import { ConfigService } from '../config/config.service';

// ── Mock @stellar/stellar-sdk at module level so Contract() never validates ──
// Shared mock functions so tests can control return values directly.
const mockScValToNative = jest.fn();
const mockFromXDR = jest.fn().mockReturnValue({});

jest.mock('@stellar/stellar-sdk', () => {
  const mockTx = {
    toXDR: jest.fn().mockReturnValue('mock-xdr'),
    sign: jest.fn(),
  };
  const mockBuilder = {
    addOperation: jest.fn().mockReturnThis(),
    setTimeout: jest.fn().mockReturnThis(),
    build: jest.fn().mockReturnValue(mockTx),
  };

  // Build the shared shape used by both default and named exports
  const sdkShape = {
    rpc: {
      Server: jest.fn().mockImplementation(() => ({
        getAccount: jest.fn().mockResolvedValue({}),
        simulateTransaction: jest.fn(),
      })),
    },
    Contract: jest.fn().mockImplementation(() => ({
      call: jest.fn().mockReturnValue({}),
    })),
    Account: jest.fn().mockImplementation(() => ({})),
    TransactionBuilder: jest.fn().mockImplementation(() => mockBuilder),
    TimeoutInfinite: 0,
    Address: {
      fromString: jest.fn().mockReturnValue({ toScVal: jest.fn().mockReturnValue({}) }),
    },
    nativeToScVal: jest.fn().mockReturnValue({}),
    // Will be overwritten after module creation with the shared reference
    scValToNative: jest.fn(),
    xdr: {
      ScVal: {
        fromXDR: jest.fn().mockReturnValue({}),
      },
    },
  };

  return {
    __esModule: true,
    default: sdkShape,
    ...sdkShape,
  };
});

// ── Shared mocks ──────────────────────────────────────────────────────────────

const VALID_WALLET = 'GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGMQ6NX4XUQN7Q6XHPVMUF';

const configMock = {
  sorobanNftContractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEU4',
  platformWallet: VALID_WALLET,
  platformRoyaltyBps: 100,
  creatorRoyaltyBps: 1000,
};

// ── NftMintService uploadMetadataToIPFS ───────────────────────────────────────

describe('NftMintService uploadMetadataToIPFS', () => {
  const prismaMock = {
    clip: {
      findUnique: jest.fn(),
      update: jest.fn(),
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
  getPlatformWallet: jest.fn().mockReturnValue('GDV76E6XN6A3Q3WXVZ4KPRQ7L6E6XN6A3Q3WXVZ4KPRQ7L6E6XN6'),
  buildRoyaltyMap: jest.fn(),
};

describe('NftMintService.uploadMetadataToIPFS', () => {
  let service: NftMintService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = makeService();
  });

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
      seller_fee_basis_points: 1000,
      fee_recipient: 'GDV76E6XN6A3Q3WXVZ4KPRQ7L6E6XN6A3Q3WXVZ4KPRQ7L6E6XN6',
      royalty: {
        bps: 1000,
        percent: 10,
        recipient: 'GDV76E6XN6A3Q3WXVZ4KPRQ7L6E6XN6A3Q3WXVZ4KPRQ7L6E6XN6',
      },
    });

    const attrs: Array<{ trait_type: string; value: string | number }> =
      (metadata as any).attributes;

    // Standard human-readable trait names
    expect(attrs).toEqual(
      expect.arrayContaining([
        { trait_type: 'Clip Duration', value: 27 },
        { trait_type: 'Virality Score', value: 88 },
        { trait_type: 'Creation Date', value: '2026-03-01T00:00:00.000Z' },
        { trait_type: 'Royalty BPS', value: 1000 },
        { trait_type: 'Royalty Percent', value: 10 },
        { trait_type: 'Platforms Posted To', value: 'tiktok' },
      ]),
    );

    // Legacy camelCase names must no longer be present
    expect(attrs.map((a) => a.trait_type)).not.toContain('clipDuration');
    expect(attrs.map((a) => a.trait_type)).not.toContain('viralityScore');
    expect(attrs.map((a) => a.trait_type)).not.toContain('createdAt');
    expect(attrs.map((a) => a.trait_type)).not.toContain('royaltyBps');
    expect(attrs.map((a) => a.trait_type)).not.toContain('royaltyPercent');
    expect(attrs.map((a) => a.trait_type)).not.toContain('platformsPosted');

    expect(prismaMock.clip.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { metadataUri: 'ipfs://bafyTestCid123' },
    });
    expect(result).toEqual({ clipId: 5, cid: 'bafyTestCid123', metadataUri: 'ipfs://bafyTestCid123' });
  });

  it('defaults Virality Score to 0 when viralityScore is null', async () => {
    prismaMock.clip.findUnique.mockResolvedValue({
      id: 7,
      title: 'Clip',
      caption: null,
      clipUrl: 'https://cdn.example.com/v.mp4',
      thumbnail: null,
      duration: 15,
      viralityScore: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      postStatus: null,
    });
    ipfsUploadMock.uploadMetadata.mockResolvedValue('ipfs://bafyNullVirality');
    prismaMock.clip.update.mockResolvedValue({});

    await service.uploadMetadataToIPFS(7);

    const [meta] = ipfsUploadMock.uploadMetadata.mock.calls[0];
    const virality = (meta as any).attributes.find(
      (a: any) => a.trait_type === 'Virality Score',
    );
    expect(virality).toBeDefined();
    expect(virality.value).toBe(0);
  });

  it('sets Platforms Posted To to empty string when no platforms are posted', async () => {
    prismaMock.clip.findUnique.mockResolvedValue({
      id: 8,
      title: 'No Platforms',
      caption: 'A clip',
      clipUrl: 'https://cdn.example.com/v.mp4',
      thumbnail: null,
      duration: 10,
      viralityScore: 50,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      postStatus: null,
    });
    ipfsUploadMock.uploadMetadata.mockResolvedValue('ipfs://bafyNoPlatforms');
    prismaMock.clip.update.mockResolvedValue({});

    await service.uploadMetadataToIPFS(8);

    const [meta] = ipfsUploadMock.uploadMetadata.mock.calls[0];
    const platforms = (meta as any).attributes.find(
      (a: any) => a.trait_type === 'Platforms Posted To',
    );
    expect(platforms).toBeDefined();
    expect(platforms.value).toBe('');
  });

  it('joins multiple platforms with comma-space separator', async () => {
    prismaMock.clip.findUnique.mockResolvedValue({
      id: 9,
      title: 'Multi Platform',
      caption: 'A clip',
      clipUrl: 'https://cdn.example.com/v.mp4',
      thumbnail: null,
      duration: 30,
      viralityScore: 75,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      postStatus: { tiktok: true, instagram: true, youtube: true },
    });
    ipfsUploadMock.uploadMetadata.mockResolvedValue('ipfs://bafyMulti');
    prismaMock.clip.update.mockResolvedValue({});

    await service.uploadMetadataToIPFS(9);

    const [meta] = ipfsUploadMock.uploadMetadata.mock.calls[0];
    const platforms = (meta as any).attributes.find(
      (a: any) => a.trait_type === 'Platforms Posted To',
    );
    expect(platforms.value).toContain(', ');
    expect(platforms.value).not.toContain('none');
  });

  it('generates standards-compliant metadata with all required top-level fields', async () => {
    prismaMock.clip.findUnique.mockResolvedValue({
      id: 10,
      title: 'Standards Clip',
      caption: 'Testing standards',
      clipUrl: 'https://cdn.example.com/v.mp4',
      thumbnail: 'https://cdn.example.com/t.jpg',
      duration: 60,
      viralityScore: 90,
      createdAt: new Date('2026-06-01T00:00:00.000Z'),
      postStatus: {},
    });
    ipfsUploadMock.uploadMetadata.mockResolvedValue('ipfs://bafyStandards');
    prismaMock.clip.update.mockResolvedValue({});

    await service.uploadMetadataToIPFS(10);

    const [meta] = ipfsUploadMock.uploadMetadata.mock.calls[0];
    expect(meta).toHaveProperty('name');
    expect(meta).toHaveProperty('description');
    expect(meta).toHaveProperty('image');
    expect(meta).toHaveProperty('animation_url');
    expect(meta).toHaveProperty('attributes');
    expect(meta).toHaveProperty('seller_fee_basis_points');
    expect(meta).toHaveProperty('royalty');
    expect(Array.isArray((meta as any).attributes)).toBe(true);
  });

  it('uploads enriched metadata to IPFS and uses the resulting CID as metadataUri', async () => {
    const expectedCid = 'bafyEnrichedCid456';
    prismaMock.clip.findUnique.mockResolvedValue({
      id: 11,
      title: 'Enriched',
      caption: 'Enriched clip',
      clipUrl: 'https://cdn.example.com/v.mp4',
      thumbnail: null,
      duration: 45,
      viralityScore: 92,
      createdAt: new Date('2026-06-25T12:00:00.000Z'),
      postStatus: { TikTok: true, Instagram: true, YouTube: true },
    });
    ipfsUploadMock.uploadMetadata.mockResolvedValue(`ipfs://${expectedCid}`);
    prismaMock.clip.update.mockResolvedValue({});

    const result = await service.uploadMetadataToIPFS(11);

    expect(result.cid).toBe(expectedCid);
    expect(result.metadataUri).toBe(`ipfs://${expectedCid}`);
    expect(prismaMock.clip.update).toHaveBeenCalledWith({
      where: { id: 11 },
      data: { metadataUri: `ipfs://${expectedCid}` },
    });
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
      data: { nftStatus: 'minting', royaltyBps: 1000 },
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
    expect(result.error).toBeUndefined();
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

// ── NftMintService verifyNFTOwnership ─────────────────────────────────────────

describe('NftMintService verifyNFTOwnership', () => {
  const prismaMock = { clip: { findUnique: jest.fn(), update: jest.fn() } };

  const stellarMock = {
    networkPassphrase: 'Test SDF Network ; September 2015',
    rpcUrl: 'https://soroban-testnet.stellar.org',
    network: 'testnet',
    validateAddress: jest.fn().mockReturnValue({ valid: true }),
  };

  const metricsMock = { incrementNftMints: jest.fn() };

  let circuitBreakerMock: { execute: jest.Mock };
  let service: NftMintService;

  // The service does `import StellarSdk from '@stellar/stellar-sdk'` (default import).
  // With __esModule:true, require().default is what the service binds to.
  // We control scValToNative via sdk.default.scValToNative.
  let sdk: any;

  beforeAll(() => {
    sdk = require('@stellar/stellar-sdk');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    sdk.default.xdr.ScVal.fromXDR.mockReturnValue({});
    circuitBreakerMock = {
      execute: jest.fn().mockImplementation((_config, fn) => fn()),
    };
    service = new NftMintService(
      prismaMock as any,
      stellarMock as any,
      metricsMock as any,
      circuitBreakerMock as any,
      configMock as any,
    );
  });

  it('returns owned=true when contract returns matching wallet address', async () => {
    circuitBreakerMock.execute.mockImplementationOnce(async () => ({
      error: null,
      results: [{ xdr: 'AAAAAA==' }],
    }));
    sdk.default.scValToNative.mockReturnValue(VALID_WALLET);

    const result = await service.verifyNFTOwnership('42', VALID_WALLET);
    expect(result.owned).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('returns owned=false when contract returns a different wallet address', async () => {
    circuitBreakerMock.execute.mockImplementationOnce(async () => ({
      error: null,
      results: [{ xdr: 'AAAAAA==' }],
    }));
    sdk.default.scValToNative.mockReturnValue('GDIFFERENTADDRESS000000000000000000000000000000000000000');

    const result = await service.verifyNFTOwnership('42', VALID_WALLET);
    expect(result.owned).toBe(false);
    expect(result.error).toMatch(/does not own/i);
  });

  it('returns owned=false with error when simulation returns an error field', async () => {
    circuitBreakerMock.execute.mockImplementationOnce(async () => ({
      error: 'Contract error',
      results: [],
    }));

    const result = await service.verifyNFTOwnership('1', VALID_WALLET);
    expect(result.owned).toBe(false);
    expect(result.error).toContain('Simulation failed');
  });

  it('returns owned=false with error when simulation returns no results', async () => {
    circuitBreakerMock.execute.mockImplementationOnce(async () => ({
      error: null,
      results: [],
    }));

    const result = await service.verifyNFTOwnership('1', VALID_WALLET);
    expect(result.owned).toBe(false);
    expect(result.error).toContain('No simulation results');
  });

  it('returns owned=false when circuit breaker throws ServiceUnavailableException', async () => {
    circuitBreakerMock.execute.mockRejectedValueOnce(
      Object.assign(new Error('Open'), { name: 'ServiceUnavailableException' }),
    );

    const result = await service.verifyNFTOwnership('1', VALID_WALLET);
    expect(result.owned).toBe(false);
    expect(result.error).toMatch(/temporarily unavailable/i);
  });

  it('returns owned=false and captures error message on unexpected error', async () => {
    circuitBreakerMock.execute.mockRejectedValueOnce(new Error('Network timeout'));

    const result = await service.verifyNFTOwnership('5', VALID_WALLET);
    expect(result.owned).toBe(false);
    expect(result.error).toContain('Network timeout');
  });
});
