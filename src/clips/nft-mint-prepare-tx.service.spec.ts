/**
 * Unit tests for NftMintService.prepareMintTx (Issue #749)
 *
 * Acceptance criteria:
 *  ✓ Validates the wallet address before touching the database
 *  ✓ Throws NotFoundException when the clip does not exist
 *  ✓ Throws ConflictException when the clip is already minted
 *  ✓ Throws BadRequestException when the clip has been posted to a platform
 *  ✓ Auto-uploads metadata to IPFS when metadataUri is absent
 *  ✓ Reuses an existing metadataUri without re-uploading
 *  ✓ Throws BadRequestException when SOROBAN_NFT_CONTRACT_ID is not configured
 *  ✓ Returns a PrepareMintTxResult with xdr, network, contractId, clipId,
 *    walletAddress, metadataUri, and royaltyBps
 *  ✓ Encodes a valid base64 XDR that embeds the mint instruction
 *  ✓ Sets clip.nftStatus to "minting" in the database
 *  ✓ Defaults royaltyBps to 1000 when the clip has no royaltyBps set
 */

import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { NftMintService } from './nft-mint.service';

// ─── minimal stubs ──────────────────────────────────────────────────────────

const VALID_WALLET = 'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3';
const CONTRACT_ID  = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEU4';
const METADATA_URI = 'ipfs://QmTestCid';

/** Builds a minimal Clip-like object. */
function makeClip(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    title: 'Test Clip',
    caption: 'A test caption',
    clipUrl: 'https://cdn.example.com/clip.mp4',
    thumbnail: 'https://cdn.example.com/thumb.jpg',
    duration: 30,
    viralityScore: 80,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    metadataUri: METADATA_URI,
    mintAddress: null,
    royaltyBps: 1000,
    postStatus: null,
    nftStatus: null,
    ...overrides,
  };
}

/** Creates a fully-wired NftMintService with injectable mocks. */
function buildService(
  clipOverride: Record<string, unknown> | null = {},
  {
    addressValid = true,
    uploadedUri = METADATA_URI,
    contractId = CONTRACT_ID,
  }: {
    addressValid?: boolean;
    uploadedUri?: string;
    contractId?: string;
  } = {},
) {
  const clip = clipOverride === null ? null : makeClip(clipOverride);

  const prisma = {
    clip: {
      findUnique: jest.fn().mockResolvedValue(clip),
      update:     jest.fn().mockResolvedValue(clip),
    },
  };

  const stellarService = {
    validateAddress: jest.fn().mockReturnValue(
      addressValid ? { valid: true } : { valid: false, message: 'Bad address' },
    ),
    network: 'testnet',
  };

  const ipfsUploadService = {
    uploadMetadata: jest.fn().mockResolvedValue(uploadedUri),
  };

  const nftMetadataService = {
    build: jest.fn().mockReturnValue({
      name: 'Test Clip',
      description: 'A test caption',
      image: 'https://cdn.example.com/thumb.jpg',
      animation_url: 'https://cdn.example.com/clip.mp4',
      attributes: [],
      seller_fee_basis_points: 1000,
      royalty: { bps: 1000, percent: 10 },
    }),
  };

  const nftConfig = {
    creatorRoyaltyBps: 800,
    platformWallet:    'GPLATFORM000000000000000000000000000000000000000000000',
    platformRoyaltyBps: 200,
  };

  if (contractId) {
    process.env.SOROBAN_NFT_CONTRACT_ID = contractId;
  } else {
    delete process.env.SOROBAN_NFT_CONTRACT_ID;
  }

  const service = new NftMintService(
    prisma as any,
    nftMetadataService as any,
    ipfsUploadService as any,
    stellarService as any,
    nftConfig as any,
  );

  return { service, prisma, stellarService, ipfsUploadService, nftMetadataService };
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('NftMintService.prepareMintTx (Issue #749)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── wallet validation ────────────────────────────────────────────────────

  it('throws BadRequestException when the wallet address is invalid', async () => {
    const { service } = buildService({}, { addressValid: false });

    await expect(service.prepareMintTx(1, 'bad-address'))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  // ── clip lookup ──────────────────────────────────────────────────────────

  it('throws NotFoundException when the clip does not exist', async () => {
    const { service } = buildService(null);

    await expect(service.prepareMintTx(999, VALID_WALLET))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  // ── already minted ───────────────────────────────────────────────────────

  it('throws ConflictException when the clip has already been minted', async () => {
    const { service } = buildService({ mintAddress: 'some-token-address' });

    await expect(service.prepareMintTx(1, VALID_WALLET))
      .rejects.toBeInstanceOf(ConflictException);
  });

  // ── posted clip ───────────────────────────────────────────────────────────

  it('throws BadRequestException when the clip has been posted to a platform', async () => {
    const { service } = buildService({ postStatus: { tiktok: 'posted' } });

    await expect(service.prepareMintTx(1, VALID_WALLET))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  // ── IPFS upload ───────────────────────────────────────────────────────────

  it('auto-uploads metadata when metadataUri is absent', async () => {
    const freshUri = 'ipfs://QmFreshUpload';
    const { service, ipfsUploadService, prisma } = buildService(
      { metadataUri: null, clipUrl: 'https://cdn.example.com/clip.mp4' },
      { uploadedUri: freshUri },
    );

    // Second findUnique call (inside uploadMetadataToIPFS) should also
    // return a clip without a URI so the upload is triggered.
    prisma.clip.findUnique.mockResolvedValue(
      makeClip({ metadataUri: null, clipUrl: 'https://cdn.example.com/clip.mp4' }),
    );

    const result = await service.prepareMintTx(1, VALID_WALLET);

    expect(ipfsUploadService.uploadMetadata).toHaveBeenCalledTimes(1);
    expect(result.metadataUri).toBe(freshUri);
  });

  it('does NOT re-upload when metadataUri is already set', async () => {
    const { service, ipfsUploadService } = buildService();

    await service.prepareMintTx(1, VALID_WALLET);

    expect(ipfsUploadService.uploadMetadata).not.toHaveBeenCalled();
  });

  // ── contract ID guard ────────────────────────────────────────────────────

  it('throws BadRequestException when SOROBAN_NFT_CONTRACT_ID is not configured', async () => {
    const { service } = buildService({}, { contractId: '' });

    await expect(service.prepareMintTx(1, VALID_WALLET))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  // ── result shape ──────────────────────────────────────────────────────────

  it('returns a PrepareMintTxResult with all required fields', async () => {
    const { service } = buildService();

    const result = await service.prepareMintTx(1, VALID_WALLET);

    expect(result).toMatchObject({
      xdr:           expect.any(String),
      network:       'testnet',
      contractId:    CONTRACT_ID,
      clipId:        1,
      walletAddress: VALID_WALLET,
      metadataUri:   METADATA_URI,
      royaltyBps:    1000,
    });
  });

  it('XDR is a non-empty base64 string that decodes to valid JSON', async () => {
    const { service } = buildService();

    const { xdr } = await service.prepareMintTx(1, VALID_WALLET);

    expect(typeof xdr).toBe('string');
    expect(xdr.length).toBeGreaterThan(0);

    const decoded = JSON.parse(Buffer.from(xdr, 'base64').toString('utf8'));
    expect(decoded).toMatchObject({
      contract:  CONTRACT_ID,
      function:  'mint',
      args: {
        to:          VALID_WALLET,
        token_id:    '1',
        metadata:    METADATA_URI,
        royalty_bps: 1000,
      },
      network: 'testnet',
    });
  });

  it('includes both creator and platform recipients in royalty_extension', async () => {
    const { service } = buildService();

    const { xdr } = await service.prepareMintTx(1, VALID_WALLET);
    const decoded = JSON.parse(Buffer.from(xdr, 'base64').toString('utf8'));

    expect(decoded.royalty_extension.recipients).toHaveLength(2);

    const labels = decoded.royalty_extension.recipients.map(
      (r: { label: string }) => r.label,
    );
    expect(labels).toContain('creator');
    expect(labels).toContain('platform');
  });

  // ── database side-effect ──────────────────────────────────────────────────

  it('sets nftStatus to "minting" on the clip record', async () => {
    const { service, prisma } = buildService();

    await service.prepareMintTx(1, VALID_WALLET);

    expect(prisma.clip.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data:  expect.objectContaining({ nftStatus: 'minting' }),
      }),
    );
  });

  // ── royalty BPS default ───────────────────────────────────────────────────

  it('defaults royaltyBps to 1000 when the clip has no royaltyBps', async () => {
    const { service } = buildService({ royaltyBps: null });

    const result = await service.prepareMintTx(1, VALID_WALLET);

    expect(result.royaltyBps).toBe(1000);
  });
});
