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
import {
  Account,
  StrKey,
  Transaction,
  TransactionBuilder,
  scValToNative,
} from '@stellar/stellar-sdk';

// ─── minimal stubs ──────────────────────────────────────────────────────────

const VALID_WALLET = 'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3';
const CONTRACT_ID  = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
const METADATA_URI = 'ipfs://QmTestCid';
const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';

/** Decodes a prepared mint XDR into the Soroban `mint` call it carries. */
function decodeMintXdr(xdrString: string) {
  const tx = TransactionBuilder.fromXDR(xdrString, NETWORK_PASSPHRASE);
  if (!(tx instanceof Transaction)) {
    throw new Error('Expected a regular transaction, not a fee-bump');
  }
  const op = tx.operations[0];
  expect(op.type).toBe('invokeHostFunction');
  if (op.type !== 'invokeHostFunction') {
    throw new Error(
      `Expected invokeHostFunction operation, got ${String(op.type)}`,
    );
  }
  const ic = op.func.invokeContract();
  const args = ic.args();
  return {
    contractId: StrKey.encodeContract(ic.contractAddress().contractId()),
    functionName: ic.functionName().toString('utf8'),
    to: scValToNative(args[0]) as string,
    tokenId: scValToNative(args[1]) as string,
    collectionId: scValToNative(args[2]) as string,
    metadata: scValToNative(args[3]) as string,
    royaltyBps: scValToNative(args[4]) as number,
    royaltyExtension: scValToNative(args[5]) as {
      recipients: Array<{ wallet: string; bps: number; label: string }>;
    },
    source: tx.source,
  };
}

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
    collectionId: 'viral-clips',
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
      count:      jest.fn().mockResolvedValue(0),
    },
    nftCollection: {
      findUnique: jest.fn().mockResolvedValue({
        collectionId: 'viral-clips',
        name: 'Viral Clips',
        type: 'viral',
        metadata: { category: 'viral' },
        royaltyBps: null,
        maxSupply: null,
      }),
    },
  };

  const stellarService = {
    validateAddress: jest.fn().mockReturnValue(
      addressValid ? { valid: true } : { valid: false, message: 'Bad address' },
    ),
    network: 'testnet',
    networkPassphrase: NETWORK_PASSPHRASE,
    rpcUrl: 'https://soroban-testnet.stellar.org',
    getAccount: jest.fn().mockResolvedValue(new Account(VALID_WALLET, '0')),
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
    platformWallet:    'GC7OHFPWPSWXL4HMN6TXAG54MTZSMJIASWHO6KVRQNHNCXEAHWDSGGC3',
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
      collectionId:  'viral-clips',
      walletAddress: VALID_WALLET,
      metadataUri:   METADATA_URI,
      royaltyBps:    1000,
    });
  });

  it('XDR is a valid base64 Soroban transaction that invokes mint', async () => {
    const { service } = buildService();

    const { xdr } = await service.prepareMintTx(1, VALID_WALLET);

    expect(typeof xdr).toBe('string');
    expect(xdr.length).toBeGreaterThan(0);

    const decoded = decodeMintXdr(xdr);
    expect(decoded.functionName).toBe('mint');
    expect(decoded.contractId).toBe(CONTRACT_ID);
    expect(decoded.source).toBe(VALID_WALLET);
    expect(decoded.to).toBe(VALID_WALLET);
    expect(decoded.tokenId).toBe('1');
    expect(decoded.collectionId).toBe('viral-clips');
    expect(decoded.metadata).toBe(METADATA_URI);
    expect(decoded.royaltyBps).toBe(1000);
  });

  it('includes both creator and platform recipients in royalty_extension', async () => {
    const { service } = buildService();

    const { xdr } = await service.prepareMintTx(1, VALID_WALLET);
    const decoded = decodeMintXdr(xdr);

    const { recipients } = decoded.royaltyExtension;
    expect(recipients).toHaveLength(2);

    expect(recipients.find((r) => r.label === 'creator')).toMatchObject({
      wallet: VALID_WALLET,
      bps: 800,
      label: 'creator',
    });
    expect(recipients.find((r) => r.label === 'platform')).toMatchObject({
      wallet: 'GC7OHFPWPSWXL4HMN6TXAG54MTZSMJIASWHO6KVRQNHNCXEAHWDSGGC3',
      bps: 200,
      label: 'platform',
    });
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

  it('assigns another supported collection in the mint XDR and clip record', async () => {
    const { service, prisma } = buildService({ collectionId: 'podcast-highlights' });
    prisma.nftCollection.findUnique.mockResolvedValue({
      collectionId: 'podcast-highlights',
      name: 'Podcast Highlights',
      type: 'podcast',
      metadata: { category: 'podcast' },
      royaltyBps: 800,
      maxSupply: null,
    });

    const result = await service.prepareMintTx(
      1,
      VALID_WALLET,
      'podcast-highlights',
    );
    const decoded = decodeMintXdr(result.xdr);

    expect(decoded.collectionId).toBe('podcast-highlights');
    expect(decoded.royaltyBps).toBe(800);
    expect(result.collectionId).toBe('podcast-highlights');
    expect(prisma.clip.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          collectionId: 'podcast-highlights',
          royaltyBps: 800,
          nftStatus: 'minting',
        }),
      }),
    );
  });

  it('rejects an unsupported collection ID before preparing the mint', async () => {
    const { service } = buildService();

    await expect(service.prepareMintTx(1, VALID_WALLET, 'not-a-collection'))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects minting when the selected collection is at its supply limit', async () => {
    const { service, prisma } = buildService();
    prisma.nftCollection.findUnique.mockResolvedValue({
      collectionId: 'viral-clips',
      name: 'Viral Clips',
      type: 'viral',
      metadata: {},
      royaltyBps: null,
      maxSupply: 1,
    });
    prisma.clip.count.mockResolvedValue(1);

    await expect(service.prepareMintTx(1, VALID_WALLET))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  // ── royalty BPS default ───────────────────────────────────────────────────

  it('defaults royaltyBps to 1000 when the clip has no royaltyBps', async () => {
    const { service } = buildService({ royaltyBps: null });

    const result = await service.prepareMintTx(1, VALID_WALLET);

    expect(result.royaltyBps).toBe(1000);
  });
});
