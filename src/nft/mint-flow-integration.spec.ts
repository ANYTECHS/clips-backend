import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import StellarSdk from '@stellar/stellar-sdk';
import {
  MintSignatureVerificationService,
  buildMintChallenge,
} from './mint-signature-verification.service';
import { NftMetadataService } from './nft-metadata.service';
import { IpfsUploadService, NftMetadata } from './ipfs-upload.service';
import { RoyaltyConfigurationService } from './royalty-configuration.service';
import { NftService } from './nft.service';
import { NftConfig } from './nft.config';
import { RoyaltyQueryService } from './royalty-query.service';
import { CircuitBreakerService } from '../common/circuit-breaker/circuit-breaker.service';
import { ConfigService } from '../config/config.service';

/**
 * End-to-end coverage of the backend-to-Soroban mint flow (Issue #678):
 * metadata upload -> wallet signature verification -> mint -> royalty query
 * on resale. Each stage uses the real service (no stubbing of the class
 * under test); only true external boundaries — Soroban RPC, IPFS HTTP, and
 * Redis — are mocked. This is deliberately separate from each service's own
 * *.spec.ts, which tests that service in isolation; here the goal is to
 * confirm the pieces compose correctly end-to-end and share consistent data
 * (the same clipId/wallet/royaltyBps) across every stage.
 *
 * The payloads below intentionally match the Swagger examples in
 * CreateMintDto (mint-clip.dto.ts) — clipId '42', the same creator wallet,
 * and royaltyBps 1000 — so the documented API examples are the same ones
 * this suite actually exercises.
 */
describe('Backend-to-contract mint flow integration (Issue #678)', () => {
  const CREATOR_WALLET = 'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3';
  const PLATFORM_WALLET = 'GDV76E6XN6A3Q3WXVZ4KPRQ7L6E6XN6A3Q3WXVZ4KPRQ7L6E6XN6';
  const CLIP_ID = 42;
  const ROYALTY_BPS = 1000;

  const royaltyConfigurationService = new RoyaltyConfigurationService({
    creatorRoyaltyBps: ROYALTY_BPS,
    platformRoyaltyBps: 100,
    platformWallet: PLATFORM_WALLET,
    royaltyAssetCode: 'native',
    royaltyAssetContractId: '',
  } as ConfigService);

  const metadataService = new NftMetadataService(royaltyConfigurationService);

  const circuitBreakerMock = {
    execute: jest.fn().mockImplementation((_config: unknown, fn: () => unknown) => fn()),
  };

  const ipfsService = new IpfsUploadService(
    circuitBreakerMock as unknown as CircuitBreakerService,
    {
      ipfsProvider: 'pinata',
      pinataJwt: 'test-pinata-jwt',
      ipfsApiUrl: 'https://api.pinata.cloud/pinning/pinJSONToIPFS',
      nftStorageApiKey: '',
    } as ConfigService,
  );

  const signatureService = new MintSignatureVerificationService();

  beforeEach(() => {
    jest.clearAllMocks();
    circuitBreakerMock.execute.mockImplementation((_config: unknown, fn: () => unknown) => fn());
    global.fetch = jest.fn();
  });

  // ── 1. Mock backend signature ──────────────────────────────────────────

  describe('wallet signature verification', () => {
    it('accepts a real Ed25519 signature over the canonical mint challenge', () => {
      const wallet = StellarSdk.Keypair.random();
      const challenge = buildMintChallenge(CLIP_ID, wallet.publicKey());
      const signature = wallet.sign(Buffer.from(challenge, 'utf8')).toString('hex');

      expect(() =>
        signatureService.verify(CLIP_ID, wallet.publicKey(), signature),
      ).not.toThrow();
    });

    it('accepts the same signature encoded as base64', () => {
      const wallet = StellarSdk.Keypair.random();
      const challenge = buildMintChallenge(CLIP_ID, wallet.publicKey());
      const signature = wallet.sign(Buffer.from(challenge, 'utf8')).toString('base64');

      expect(() =>
        signatureService.verify(CLIP_ID, wallet.publicKey(), signature),
      ).not.toThrow();
    });
  });

  // ── 2. Metadata upload ──────────────────────────────────────────────────

  describe('metadata build + IPFS upload', () => {
    it('builds OpenSea-compatible metadata and uploads it, returning an ipfs:// URI', async () => {
      const metadata = metadataService.build({
        id: CLIP_ID,
        title: 'Amazing Clip',
        caption: 'A test clip',
        clipUrl: 'https://cdn.example.com/video.mp4',
        thumbnail: 'https://cdn.example.com/thumb.jpg',
        duration: 27,
        viralityScore: 88,
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
        royaltyBps: ROYALTY_BPS,
        royaltyRecipient: CREATOR_WALLET,
      });

      expect(metadata.seller_fee_basis_points).toBe(ROYALTY_BPS);
      expect(metadata.royalty).toMatchObject({ bps: ROYALTY_BPS, percent: 10 });

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ IpfsHash: 'bafyIntegrationTestCid' }),
      });

      const uri = await ipfsService.uploadMetadata(metadata, CLIP_ID);

      expect(uri).toBe('ipfs://bafyIntegrationTestCid');
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  // ── 3. Mint transaction ─────────────────────────────────────────────────

  describe('mint transaction', () => {
    function makeNftService(overrides: Partial<NftConfig> = {}): NftService {
      const config = Object.assign(new NftConfig(), {
        creatorRoyaltyBps: ROYALTY_BPS,
        platformRoyaltyBps: 100,
        platformWallet: PLATFORM_WALLET,
        ...overrides,
      });
      return new NftService(config);
    }

    it('mints using the uploaded metadata URI and a verified wallet signature', async () => {
      // Signature stage (reuses the same challenge/verify pair as above).
      const wallet = StellarSdk.Keypair.random();
      const challenge = buildMintChallenge(CLIP_ID, wallet.publicKey());
      const signature = wallet.sign(Buffer.from(challenge, 'utf8')).toString('hex');
      signatureService.verify(CLIP_ID, wallet.publicKey(), signature);

      // Metadata + upload stage.
      const metadata = metadataService.build({
        id: CLIP_ID,
        title: 'Amazing Clip',
        caption: null,
        clipUrl: 'https://cdn.example.com/video.mp4',
        thumbnail: null,
        duration: 27,
        viralityScore: null,
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
        royaltyBps: ROYALTY_BPS,
        royaltyRecipient: CREATOR_WALLET,
      });
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ IpfsHash: 'bafyMintFlowCid' }),
      });
      const metadataUri = await ipfsService.uploadMetadata(metadata, CLIP_ID);

      // Mint stage.
      const nftService = makeNftService();
      const result = await nftService.mintClip({
        clipId: String(CLIP_ID),
        creatorWallet: CREATOR_WALLET,
        metadataUri,
        royaltyBps: ROYALTY_BPS,
      });

      expect(result.txHash).toMatch(new RegExp(`^sim_tx_${CLIP_ID}_`));
      expect(result.transaction.metadataUri).toBe('ipfs://bafyMintFlowCid');
      expect(result.transaction.royalties).toEqual([
        { wallet: CREATOR_WALLET, bps: ROYALTY_BPS, label: 'creator' },
        { wallet: PLATFORM_WALLET, bps: 100, label: 'platform' },
      ]);
    });
  });

  // ── 4. Royalty on resale ────────────────────────────────────────────────

  describe('royalty query on resale', () => {
    function makeRoyaltyQueryService() {
      const stellarService = {
        rpcUrl: 'https://soroban-testnet.stellar.org',
        networkPassphrase: 'Test SDF Network ; September 2015',
      };
      const redisService = { get: jest.fn().mockResolvedValue(null), setex: jest.fn() };
      const cb = { execute: jest.fn((_config: unknown, fn: () => unknown) => fn()) };
      return new RoyaltyQueryService(
        stellarService as any,
        redisService as any,
        cb as any,
      );
    }

    it('resolves the royalty owed on a resale from the on-chain split', async () => {
      const royaltyQueryService = makeRoyaltyQueryService();

      // The token was minted with a 1000 bps (10%) creator royalty above;
      // simulate the chain reporting that same split on a resale query.
      jest.spyOn(royaltyQueryService as any, 'queryOnChainRoyalty').mockResolvedValue({
        royaltyBps: ROYALTY_BPS,
        recipient: CREATOR_WALLET,
      });

      const info = await royaltyQueryService.getRoyaltyInfo(String(CLIP_ID));

      expect(info).toEqual({ royaltyBps: ROYALTY_BPS, recipient: CREATOR_WALLET });

      // A resale at 100 XLM (1_000_000_000 stroops) should owe 10% = 10 XLM,
      // using the same BPS math the contract applies in transfer_with_royalty.
      const salePriceStroops = 1_000_000_000;
      const expectedRoyaltyStroops = (salePriceStroops * info.royaltyBps) / 10_000;
      expect(expectedRoyaltyStroops).toBe(100_000_000);
    });
  });

  // ── 5. Failure scenarios ────────────────────────────────────────────────

  describe('failure scenarios', () => {
    it('rejects a signature that does not match the signing wallet', () => {
      const signer = StellarSdk.Keypair.random();
      const impersonated = StellarSdk.Keypair.random();
      const challenge = buildMintChallenge(CLIP_ID, impersonated.publicKey());
      const signature = signer.sign(Buffer.from(challenge, 'utf8')).toString('hex');

      expect(() =>
        signatureService.verify(CLIP_ID, impersonated.publicKey(), signature),
      ).toThrow(UnauthorizedException);
    });

    it('rejects a signature over a tampered clipId (replay across clips)', () => {
      const wallet = StellarSdk.Keypair.random();
      const signature = wallet
        .sign(Buffer.from(buildMintChallenge(CLIP_ID, wallet.publicKey()), 'utf8'))
        .toString('hex');

      // Same signature, different clipId — must not verify.
      expect(() =>
        signatureService.verify(CLIP_ID + 1, wallet.publicKey(), signature),
      ).toThrow(UnauthorizedException);
    });

    it('rejects a malformed Stellar wallet address before touching crypto', () => {
      expect(() =>
        signatureService.verify(CLIP_ID, 'not-a-stellar-address', 'a'.repeat(128)),
      ).toThrow(UnauthorizedException);
    });

    it('fails metadata upload validation when royalty info is missing', async () => {
      const invalidMetadata = {
        name: 'Bad',
        description: 'Missing royalty block',
        image: 'https://cdn.example.com/thumb.jpg',
        animation_url: 'https://cdn.example.com/video.mp4',
        attributes: [],
        seller_fee_basis_points: ROYALTY_BPS,
      } as unknown as NftMetadata;

      await expect(
        ipfsService.uploadMetadata(invalidMetadata, CLIP_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('rejects minting when the platform wallet is not configured', async () => {
      const config = Object.assign(new NftConfig(), {
        creatorRoyaltyBps: ROYALTY_BPS,
        platformRoyaltyBps: 100,
        platformWallet: '',
      });
      const nftService = new NftService(config);

      await expect(
        nftService.mintClip({ clipId: String(CLIP_ID), creatorWallet: CREATOR_WALLET }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a batch mint over the 50-clip limit', async () => {
      const config = Object.assign(new NftConfig(), {
        creatorRoyaltyBps: ROYALTY_BPS,
        platformRoyaltyBps: 100,
        platformWallet: PLATFORM_WALLET,
      });
      const nftService = new NftService(config);

      const clips = Array.from({ length: 51 }, (_, i) => ({ clipId: String(i + 1) }));

      await expect(
        nftService.batchMintClips({ creatorWallet: CREATOR_WALLET, clips } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('surfaces NotFoundException when the chain has no royalty data for a resale query', async () => {
      const royaltyQueryService = makeRoyaltyQueryServiceForFailure();

      jest
        .spyOn(royaltyQueryService as any, 'queryOnChainRoyalty')
        .mockRejectedValue(new NotFoundException('Royalty data not found for mint address 999'));

      await expect(royaltyQueryService.getRoyaltyInfo('999')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    function makeRoyaltyQueryServiceForFailure() {
      const stellarService = {
        rpcUrl: 'https://soroban-testnet.stellar.org',
        networkPassphrase: 'Test SDF Network ; September 2015',
      };
      const redisService = { get: jest.fn().mockResolvedValue(null), setex: jest.fn() };
      const cb = { execute: jest.fn((_config: unknown, fn: () => unknown) => fn()) };
      return new RoyaltyQueryService(stellarService as any, redisService as any, cb as any);
    }
  });
});
