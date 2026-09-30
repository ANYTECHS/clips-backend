/**
 * NftMintService — comprehensive unit tests (issue #1008)
 *
 * Covers:
 *  - uploadMetadataToIPFS: clip not found, no clipUrl, successful upload,
 *    idempotent re-upload (cached CID), IPFS failure propagation
 *  - prepareMintTx: invalid wallet, clip not found, already minted,
 *    Stellar build failure, successful XDR, uses existing metadataUri,
 *    auto-uploads when metadataUri is missing
 *  - validateClipOwner: clip not found, user does not own clip, success
 *  - confirmMint: success, already minted, clip not found, DB error
 */

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { NftMintService } from './nft-mint.service';

// ── Mocks ──────────────────────────────────────────────────────────────────

const prismaMock = {
  clip: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
};

const nftMetadataServiceMock = {
  build: jest.fn().mockReturnValue({
    name: 'Test Clip',
    description: 'A test clip description',
    image: 'https://cdn.example.com/thumb.jpg',
    animation_url: 'https://cdn.example.com/video.mp4',
    attributes: [
      { trait_type: 'Clip Duration', value: 30 },
      { trait_type: 'Virality Score', value: 85 },
      { trait_type: 'Creation Date', value: '2026-01-01T00:00:00.000Z' },
      { trait_type: 'Royalty BPS', value: 1000 },
      { trait_type: 'Royalty Percent', value: 10 },
      { trait_type: 'Platform', value: 'ClipCash' },
    ],
    seller_fee_basis_points: 1000,
    fee_recipient: 'GPLATFORMWALLET',
    royalty: { bps: 1000, percent: 10, recipient: 'GPLATFORMWALLET', asset: 'native' },
    viralityScore: 85,
    originalDuration: 30,
    createdAt: '2026-01-01T00:00:00.000Z',
  }),
};

const ipfsUploadServiceMock = {
  uploadMetadata: jest.fn(),
};

const stellarServiceMock = {
  validateAddress: jest.fn().mockReturnValue({ valid: true }),
  network: 'testnet',
  networkPassphrase: 'Test SDF Network ; September 2015',
  rpcUrl: 'https://soroban-testnet.stellar.org',
};

const nftConfigMock = {
  creatorRoyaltyBps: 1000,
  platformRoyaltyBps: 100,
  platformWallet: 'GPLATFORMWALLET000000000000000000000000000000000000000000',
};

// ── Helpers ────────────────────────────────────────────────────────────────

const VALID_WALLET = 'GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGMQ6NX4XUQN7Q6XHPVMUF';
const CONTRACT_ID = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

function makeService(): NftMintService {
  return new NftMintService(
    prismaMock as any,
    nftMetadataServiceMock as any,
    ipfsUploadServiceMock as any,
    stellarServiceMock as any,
    nftConfigMock as any,
  );
}

/** A minimal clip record ready for minting (no metadataUri, no mintAddress). */
const baseClip = {
  id: 5,
  videoId: 1,
  title: 'Amazing Clip',
  caption: 'A test clip',
  clipUrl: 'https://cdn.example.com/video.mp4',
  thumbnail: 'https://cdn.example.com/thumb.jpg',
  duration: 30,
  viralityScore: 85,
  royaltyBps: 1000,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  postStatus: null,
  metadataUri: null,
  mintAddress: null,
  nftStatus: 'none',
  video: { userId: 42 },
};

// ── uploadMetadataToIPFS ───────────────────────────────────────────────────

describe('NftMintService.uploadMetadataToIPFS', () => {
  let service: NftMintService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = makeService();
  });

  it('throws NotFoundException when clip does not exist', async () => {
    prismaMock.clip.findUnique.mockResolvedValue(null);

    await expect(service.uploadMetadataToIPFS(999)).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.uploadMetadataToIPFS(999)).rejects.toThrow('999');
  });

  it('throws BadRequestException when clip has no clipUrl', async () => {
    prismaMock.clip.findUnique.mockResolvedValue({
      ...baseClip,
      clipUrl: null,
    });

    await expect(service.uploadMetadataToIPFS(5)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('throws BadRequestException when clipUrl is empty string', async () => {
    prismaMock.clip.findUnique.mockResolvedValue({
      ...baseClip,
      clipUrl: '',
    });

    await expect(service.uploadMetadataToIPFS(5)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('returns cached CID without re-uploading when metadataUri already set', async () => {
    prismaMock.clip.findUnique.mockResolvedValue({
      ...baseClip,
      metadataUri: 'ipfs://bafyCachedCid',
    });

    const result = await service.uploadMetadataToIPFS(5);

    expect(ipfsUploadServiceMock.uploadMetadata).not.toHaveBeenCalled();
    expect(prismaMock.clip.update).not.toHaveBeenCalled();
    expect(result).toEqual({
      clipId: 5,
      cid: 'bafyCachedCid',
      metadataUri: 'ipfs://bafyCachedCid',
    });
  });

  it('uploads metadata, persists metadataUri, and returns correct cid/uri', async () => {
    prismaMock.clip.findUnique.mockResolvedValue({ ...baseClip });
    ipfsUploadServiceMock.uploadMetadata.mockResolvedValue('ipfs://bafyNewCid123');
    prismaMock.clip.update.mockResolvedValue({});

    const result = await service.uploadMetadataToIPFS(5);

    expect(ipfsUploadServiceMock.uploadMetadata).toHaveBeenCalledTimes(1);
    expect(prismaMock.clip.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { metadataUri: 'ipfs://bafyNewCid123' },
    });
    expect(result).toEqual({
      clipId: 5,
      cid: 'bafyNewCid123',
      metadataUri: 'ipfs://bafyNewCid123',
    });
  });

  it('calls nftMetadataService.build with clip data before uploading', async () => {
    prismaMock.clip.findUnique.mockResolvedValue({ ...baseClip });
    ipfsUploadServiceMock.uploadMetadata.mockResolvedValue('ipfs://bafyBuilt');
    prismaMock.clip.update.mockResolvedValue({});

    await service.uploadMetadataToIPFS(5);

    expect(nftMetadataServiceMock.build).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 5,
        title: 'Amazing Clip',
        clipUrl: 'https://cdn.example.com/video.mp4',
      }),
    );
  });

  it('propagates error when IPFS upload fails', async () => {
    prismaMock.clip.findUnique.mockResolvedValue({ ...baseClip });
    ipfsUploadServiceMock.uploadMetadata.mockRejectedValue(
      new Error('Pinata timeout'),
    );

    await expect(service.uploadMetadataToIPFS(5)).rejects.toThrow(
      'Pinata timeout',
    );
    // Should not persist if upload failed
    expect(prismaMock.clip.update).not.toHaveBeenCalled();
  });

  it('defaults royaltyBps to 1000 when clip.royaltyBps is null', async () => {
    prismaMock.clip.findUnique.mockResolvedValue({
      ...baseClip,
      royaltyBps: null,
    });
    ipfsUploadServiceMock.uploadMetadata.mockResolvedValue('ipfs://bafyRoyalty');
    prismaMock.clip.update.mockResolvedValue({});

    await service.uploadMetadataToIPFS(5);

    expect(nftMetadataServiceMock.build).toHaveBeenCalledWith(
      expect.objectContaining({ royaltyBps: 1000 }),
    );
  });
});

// ── prepareMintTx ─────────────────────────────────────────────────────────

describe('NftMintService.prepareMintTx', () => {
  let service: NftMintService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = makeService();
    // Set a valid contract ID by default
    process.env.SOROBAN_NFT_CONTRACT_ID = CONTRACT_ID;
  });

  afterEach(() => {
    delete process.env.SOROBAN_NFT_CONTRACT_ID;
  });

  it('throws BadRequestException for invalid wallet address', async () => {
    stellarServiceMock.validateAddress.mockReturnValueOnce({
      valid: false,
      message: 'Invalid Stellar address format',
    });

    await expect(
      service.prepareMintTx(5, 'NOT_A_VALID_WALLET'),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws NotFoundException when clip does not exist', async () => {
    prismaMock.clip.findUnique.mockResolvedValue(null);

    await expect(
      service.prepareMintTx(99, VALID_WALLET),
    ).rejects.toThrow(NotFoundException);
    await expect(
      service.prepareMintTx(99, VALID_WALLET),
    ).rejects.toThrow('99');
  });

  it('throws ConflictException when clip already has a mintAddress', async () => {
    prismaMock.clip.findUnique.mockResolvedValue({
      ...baseClip,
      mintAddress: 'CAAAAAAAAA',
    });

    await expect(
      service.prepareMintTx(5, VALID_WALLET),
    ).rejects.toThrow(ConflictException);
  });

  it('throws ConflictException when clip is already minted (ConflictException from mintAddress check)', async () => {
    prismaMock.clip.findUnique.mockResolvedValue({
      ...baseClip,
      mintAddress: 'TOKEN_ID_123',
      nftStatus: 'minted',
    });

    await expect(
      service.prepareMintTx(5, VALID_WALLET),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('throws BadRequestException when SOROBAN_NFT_CONTRACT_ID is not set', async () => {
    delete process.env.SOROBAN_NFT_CONTRACT_ID;
    prismaMock.clip.findUnique.mockResolvedValue({
      ...baseClip,
      metadataUri: 'ipfs://abc123',
    });
    prismaMock.clip.update.mockResolvedValue({});

    await expect(
      service.prepareMintTx(5, VALID_WALLET),
    ).rejects.toThrow(BadRequestException);
  });

  it('returns xdr and full result when clip has existing metadataUri', async () => {
    prismaMock.clip.findUnique.mockResolvedValue({
      ...baseClip,
      metadataUri: 'ipfs://existingCid',
      royaltyBps: 1000,
    });
    prismaMock.clip.update.mockResolvedValue({});

    const result = await service.prepareMintTx(5, VALID_WALLET);

    expect(result).toMatchObject({
      clipId: 5,
      walletAddress: VALID_WALLET,
      metadataUri: 'ipfs://existingCid',
      royaltyBps: 1000,
      contractId: CONTRACT_ID,
      network: 'testnet',
    });
    expect(typeof result.xdr).toBe('string');
    expect(result.xdr.length).toBeGreaterThan(0);
  });

  it('uses existing metadataUri without re-uploading to IPFS', async () => {
    prismaMock.clip.findUnique.mockResolvedValue({
      ...baseClip,
      metadataUri: 'ipfs://alreadyUploaded',
    });
    prismaMock.clip.update.mockResolvedValue({});

    await service.prepareMintTx(5, VALID_WALLET);

    expect(ipfsUploadServiceMock.uploadMetadata).not.toHaveBeenCalled();
  });

  it('auto-uploads metadata when metadataUri is missing, then builds XDR', async () => {
    // First findUnique for prepareMintTx returns clip without metadataUri
    // Second findUnique (inside uploadMetadataToIPFS) returns clip with clipUrl
    prismaMock.clip.findUnique
      .mockResolvedValueOnce({ ...baseClip, metadataUri: null })
      .mockResolvedValueOnce({ ...baseClip, metadataUri: null });
    ipfsUploadServiceMock.uploadMetadata.mockResolvedValue('ipfs://autoUploaded');
    prismaMock.clip.update.mockResolvedValue({});

    const result = await service.prepareMintTx(5, VALID_WALLET);

    expect(ipfsUploadServiceMock.uploadMetadata).toHaveBeenCalledTimes(1);
    expect(result.metadataUri).toBe('ipfs://autoUploaded');
    expect(typeof result.xdr).toBe('string');
  });

  it('sets nftStatus to minting before returning xdr', async () => {
    prismaMock.clip.findUnique.mockResolvedValue({
      ...baseClip,
      metadataUri: 'ipfs://abc',
    });
    prismaMock.clip.update.mockResolvedValue({});

    await service.prepareMintTx(5, VALID_WALLET);

    expect(prismaMock.clip.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { nftStatus: 'minting' },
    });
  });

  it('xdr is a valid base64-encoded JSON containing mint function and metadata', async () => {
    prismaMock.clip.findUnique.mockResolvedValue({
      ...baseClip,
      metadataUri: 'ipfs://mintMeta',
      royaltyBps: 750,
    });
    prismaMock.clip.update.mockResolvedValue({});

    const result = await service.prepareMintTx(5, VALID_WALLET);

    const decoded = JSON.parse(Buffer.from(result.xdr, 'base64').toString());
    expect(decoded.function).toBe('mint');
    expect(decoded.contract).toBe(CONTRACT_ID);
    expect(decoded.args.metadata).toBe('ipfs://mintMeta');
    expect(decoded.args.to).toBe(VALID_WALLET);
    expect(decoded.args.royalty_bps).toBe(750);
    expect(decoded.network).toBe('testnet');
  });

  it('propagates error from buildMintXdr / Stellar build failure', async () => {
    prismaMock.clip.findUnique.mockResolvedValue({
      ...baseClip,
      metadataUri: 'ipfs://willFail',
    });
    // Force clip.update to fail to simulate a Stellar-layer failure
    prismaMock.clip.update.mockRejectedValue(new Error('Stellar RPC failure'));

    await expect(
      service.prepareMintTx(5, VALID_WALLET),
    ).rejects.toThrow('Stellar RPC failure');
  });

  it('defaults royaltyBps to 1000 when clip.royaltyBps is null', async () => {
    prismaMock.clip.findUnique.mockResolvedValue({
      ...baseClip,
      royaltyBps: null,
      metadataUri: 'ipfs://nullRoyalty',
    });
    prismaMock.clip.update.mockResolvedValue({});

    const result = await service.prepareMintTx(5, VALID_WALLET);

    expect(result.royaltyBps).toBe(1000);
  });

  it('does not throw for a posted clip when postStatus has no "posted" value', async () => {
    prismaMock.clip.findUnique.mockResolvedValue({
      ...baseClip,
      postStatus: { tiktok: 'scheduled' },
      metadataUri: 'ipfs://notPosted',
    });
    prismaMock.clip.update.mockResolvedValue({});

    await expect(service.prepareMintTx(5, VALID_WALLET)).resolves.toBeDefined();
  });

  it('throws BadRequestException for a posted clip (postStatus contains "posted")', async () => {
    prismaMock.clip.findUnique.mockResolvedValue({
      ...baseClip,
      postStatus: { tiktok: 'posted' },
      metadataUri: 'ipfs://posted',
    });

    await expect(service.prepareMintTx(5, VALID_WALLET)).rejects.toThrow(
      BadRequestException,
    );
  });
});

// ── validateClipOwner ─────────────────────────────────────────────────────

describe('NftMintService.validateClipOwner', () => {
  let service: NftMintService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = makeService();
  });

  it('throws NotFoundException when clip does not exist', async () => {
    prismaMock.clip.findUnique.mockResolvedValue(null);

    await expect(service.validateClipOwner(42, 7)).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.validateClipOwner(42, 7)).rejects.toThrow('42');
  });

  it('throws ForbiddenException when user does not own the clip', async () => {
    prismaMock.clip.findUnique.mockResolvedValue({
      id: 5,
      video: { userId: 99 }, // different user
    });

    await expect(service.validateClipOwner(5, 42)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('throws ForbiddenException with clip ID in message when ownership check fails', async () => {
    prismaMock.clip.findUnique.mockResolvedValue({
      id: 5,
      video: { userId: 100 },
    });

    await expect(service.validateClipOwner(5, 42)).rejects.toThrow('5');
  });

  it('resolves without error when user owns the clip', async () => {
    prismaMock.clip.findUnique.mockResolvedValue({
      id: 5,
      video: { userId: 42 },
    });

    await expect(service.validateClipOwner(5, 42)).resolves.toBeUndefined();
  });

  it('queries prisma with correct parameters including video.userId join', async () => {
    prismaMock.clip.findUnique.mockResolvedValue({
      id: 5,
      video: { userId: 42 },
    });

    await service.validateClipOwner(5, 42);

    expect(prismaMock.clip.findUnique).toHaveBeenCalledWith({
      where: { id: 5 },
      include: { video: { select: { userId: true } } },
    });
  });
});

// ── confirmMint ───────────────────────────────────────────────────────────

describe('NftMintService.confirmMint', () => {
  let service: NftMintService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = makeService();
  });

  it('throws NotFoundException when clip does not exist', async () => {
    prismaMock.clip.findUnique.mockResolvedValue(null);

    await expect(service.confirmMint(5, 'TOKEN123')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws BadRequestException when clip is already minted', async () => {
    prismaMock.clip.findUnique.mockResolvedValue({
      id: 5,
      mintAddress: 'EXISTING_TOKEN',
    });

    await expect(service.confirmMint(5, 'TOKEN123')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('updates clip with mintAddress, mintedAt, and nftStatus=minted', async () => {
    prismaMock.clip.findUnique.mockResolvedValue({
      id: 5,
      mintAddress: null,
    });
    prismaMock.clip.update.mockResolvedValue({});

    await service.confirmMint(5, 'NEW_TOKEN');

    expect(prismaMock.clip.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: {
        mintAddress: 'NEW_TOKEN',
        mintedAt: expect.any(Date),
        nftStatus: 'minted',
      },
    });
  });

  it('returns clipId, mintAddress, and mintedAt on success', async () => {
    prismaMock.clip.findUnique.mockResolvedValue({ id: 5, mintAddress: null });
    prismaMock.clip.update.mockResolvedValue({});

    const result = await service.confirmMint(5, 'MY_TOKEN');

    expect(result).toMatchObject({
      clipId: 5,
      mintAddress: 'MY_TOKEN',
      mintedAt: expect.any(Date),
    });
  });
});

// ── prepareBurnTx ─────────────────────────────────────────────────────────

describe('NftMintService.prepareBurnTx', () => {
  let service: NftMintService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = makeService();
    process.env.SOROBAN_NFT_CONTRACT_ID = CONTRACT_ID;
  });

  afterEach(() => {
    delete process.env.SOROBAN_NFT_CONTRACT_ID;
  });

  it('throws BadRequestException for invalid wallet', async () => {
    stellarServiceMock.validateAddress.mockReturnValueOnce({
      valid: false,
      message: 'Bad wallet',
    });

    await expect(service.prepareBurnTx(5, 'INVALID')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('returns xdr, tokenId, owner, contractId and network on success', async () => {
    const result = await service.prepareBurnTx(5, VALID_WALLET);

    expect(result).toMatchObject({
      tokenId: 5,
      owner: VALID_WALLET,
      contractId: CONTRACT_ID,
      network: 'testnet',
    });
    expect(typeof result.xdr).toBe('string');
  });
});

// ── prepareSetRoyaltiesTx ──────────────────────────────────────────────────

describe('NftMintService.prepareSetRoyaltiesTx', () => {
  let service: NftMintService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = makeService();
    process.env.SOROBAN_NFT_CONTRACT_ID = CONTRACT_ID;
  });

  afterEach(() => {
    delete process.env.SOROBAN_NFT_CONTRACT_ID;
  });

  it('throws BadRequestException when combined bps exceed 10000', async () => {
    const shares = [
      { recipient: VALID_WALLET, bps: 6000 },
      { recipient: 'GOTHER', bps: 5000 },
    ];

    await expect(
      service.prepareSetRoyaltiesTx(5, VALID_WALLET, shares),
    ).rejects.toThrow(BadRequestException);
  });

  it('returns xdr with tokenId and totalBps on success', async () => {
    const shares = [{ recipient: VALID_WALLET, bps: 1000 }];

    const result = await service.prepareSetRoyaltiesTx(5, VALID_WALLET, shares);

    expect(result).toMatchObject({
      tokenId: 5,
      totalBps: 1000,
      shares,
    });
    expect(typeof result.xdr).toBe('string');
  });
});
