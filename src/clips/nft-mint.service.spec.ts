import { BadRequestException, NotFoundException } from '@nestjs/common';
import { NftMintService } from './nft-mint.service';

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

  const stellarMock = {
    networkPassphrase: 'Test SDF Network ; September 2015',
    rpcUrl: 'https://soroban-testnet.stellar.org',
    network: 'testnet',
    validateAddress: jest.fn().mockReturnValue({ valid: true }),
  };

  const metricsMock = { incrementNftMints: jest.fn() };
  const circuitBreakerMock = {
    execute: jest.fn().mockImplementation((_config, fn) => fn()),
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

    const uploadSpy = jest
      .spyOn(service as any, 'uploadMetadataToIpfs')
      .mockResolvedValue('ipfs://bafyTestCid123');

    prismaMock.clip.update.mockResolvedValue({});

    const result = await service.uploadMetadataToIPFS(5);

    expect(uploadSpy).toHaveBeenCalledTimes(1);
    const [metadata, clipId] = uploadSpy.mock.calls[0];

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
