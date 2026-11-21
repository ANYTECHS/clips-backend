import { ValidationPipe, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Verifier } from '@pact-foundation/pact/src/dsl/verifier';
import * as path from 'node:path';
import request from 'supertest';
import { AuthController } from '../../auth/auth.controller';
import { AuthService } from '../../auth/auth.service';
import { CookieService } from '../../auth/cookie.service';
import { DeviceFingerprintService } from '../../auth/device-fingerprint.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { BruteForceGuard } from '../../auth/guards/brute-force.guard';
import { ClipsController } from '../../clips/clips.controller';
import { ClipsService } from '../../clips/clips.service';
import { ClipPublishService } from '../../clips/clip-publish.service';
import { EarningsController } from '../../earnings/earnings.controller';
import { EarningsService } from '../../earnings/earnings.service';
import { EarningsAggregationService } from '../../earnings/earnings-aggregation.service';
import { EarningsExportService } from '../../earnings/earnings-export.service';
import { DailyEarningsAggregationService } from '../../earnings/daily-earnings-aggregation.service';
import { LeaderboardService } from '../../earnings/leaderboard.service';
import { CsrfService } from '../../csrf/csrf.service';
import { VideosController } from '../../videos/videos.controller';
import { WalletsController } from '../../wallets/wallets.controller';
import { WalletsService } from '../../wallets/wallets.service';
import { WalletBalanceService } from '../../wallets/wallet-balance.service';
import { NftOwnershipService } from '../../nft/nft-ownership.service';
import { PayoutsController } from '../../payouts/payouts.controller';
import { PayoutsService } from '../../payouts/payouts.service';
import { BalanceService } from '../../payouts/balance.service';
import { FeeService } from '../../payouts/fee.service';
import { PayoutExportService } from '../../payouts/payout-export.service';
import { NftController } from '../../nft/nft.controller';
import { NftService } from '../../nft/nft.service';
import { NftMintService } from '../../clips/nft-mint.service';
import { NftMetadataService } from '../../nft/nft-metadata.service';
import { IpfsUploadService } from '../../nft/ipfs-upload.service';
import { RoyaltyQueryService } from '../../nft/royalty-query.service';
import { NftOwnershipVerificationService } from '../../nft/nft-ownership-verification.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RoyaltyConfigurationService } from '../../nft/royalty-configuration.service';
import { MintSignatureVerificationService } from '../../nft/mint-signature-verification.service';
import { AdminContractService } from '../../nft/admin-contract.service';
import { AdminConfigService } from '../../nft/admin-config.service';
import { NftApprovalService } from '../../nft/nft-approval.service';
import { GasMetricsService } from '../../nft/gas-metrics.service';
import { NftTransferService } from '../../nft/nft-transfer.service';
import { NftTransferHistoryService } from '../../nft/nft-transfer-history.service';
import { NftMetadataRefreshService } from '../../nft/nft-metadata-refresh.service';
import { ClaimRoyaltyService } from '../../nft/claim-royalty.service';
import { RoyaltyClaimHistoryService } from '../../nft/royalty-claim-history.service';
import { NftMintEnqueueService } from '../../clips/nft-mint-enqueue.service';
import { NftMintGuard } from '../../nft/guards/nft-mint.guard';
import { QueueRateLimitGuard } from '../../common/guards/queue-rate-limit.guard';

jest.setTimeout(60000);

const user = {
  id: 1,
  email: 'founder@example.com',
  name: 'Founder',
  picture: null,
  mfaEnabled: false,
  emailVerified: true,
};
const tokenPair = {
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
};
const clip = {
  id: 42,
  videoId: 7,
  selected: false,
  nftStatus: 'none',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  royaltyBps: 500,
};
const wallet = {
  id: 1,
  address: 'GABF...KJ93XD',
  chain: 'stellar',
  type: 'freighter',
  connectedAt: new Date('2026-01-01T00:00:00.000Z'),
};
const payout = {
  payoutId: 'payout_123',
  status: 'pending',
  id: 10,
  amount: 100,
  currency: 'USD',
  method: 'stellar',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  feeAmount: 2.5,
  finalAmount: 97.5,
};
const mintResponse = {
  collectionId: 'viral-clips',
  clipId: '42',
  creatorWallet: 'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
  metadataUri: 'ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG',
  royaltyBps: 1000,
  royalties: [
    {
      wallet: 'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
      bps: 1000,
      label: 'creator',
    },
  ],
  status: 'minted',
};

describe('Pact provider verification', () => {
  let app: Awaited<ReturnType<typeof createProviderApp>>;
  let providerServices: ReturnType<typeof createProviderServices>;

  beforeAll(async () => {
    providerServices = createProviderServices();
    app = await createProviderApp(providerServices);
  });

  afterAll(async () => {
    await app.close();
  });

  it('matches consumer contracts to the generated Swagger DTOs and security metadata', () => {
    const swagger = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Contract test API')
        .setVersion('1.0')
        .addBearerAuth(
          { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
          'access-token',
        )
        .build(),
    );

    expect(swagger.paths['/auth/login']?.post).toMatchObject({
      requestBody: {
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/LoginDto' },
          },
        },
      },
      responses: {
        '200': {
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/LoginResponseDto' },
            },
          },
        },
      },
    });
    expect(swagger.paths['/clips']?.get).toMatchObject({
      responses: {
        '200': {
          content: {
            'application/json': {
              schema: {
                type: 'array',
                items: { $ref: '#/components/schemas/ClipResponseDto' },
              },
            },
          },
        },
      },
    });
    expect(
      swagger.paths['/clips']?.get?.security?.some((rule) =>
        Object.hasOwn(rule, 'access-token'),
      ),
    ).toBe(true);
    expect(swagger.paths['/videos']?.get).toMatchObject({
      responses: {
        '200': {
          content: {
            'application/json': {
              schema: { example: { message: 'Videos endpoint' } },
            },
          },
        },
      },
    });
    expect(
      swagger.paths['/videos']?.get?.security?.some((rule) =>
        Object.hasOwn(rule, 'access-token'),
      ),
    ).toBe(true);
    expect(swagger.paths['/earnings']?.get).toMatchObject({
      responses: {
        '200': {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  total: { type: 'number', example: 2500.5 },
                  currency: { type: 'string', example: 'USD' },
                },
              },
            },
          },
        },
      },
    });
    expect(
      swagger.paths['/earnings']?.get?.security?.some((rule) =>
        Object.hasOwn(rule, 'access-token'),
      ),
    ).toBe(true);
    expect(swagger.paths['/wallets']?.get).toMatchObject({
      responses: {
        '200': {
          content: {
            'application/json': {
              schema: {
                type: 'array',
                items: {
                  properties: {
                    id: { type: 'number' },
                    address: { type: 'string' },
                    chain: {
                      type: 'string',
                      enum: ['stellar', 'solana', 'base'],
                    },
                    type: { type: 'string' },
                    connectedAt: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
        },
      },
    });
    expect(
      swagger.paths['/wallets']?.get?.security?.some((rule) =>
        Object.hasOwn(rule, 'access-token'),
      ),
    ).toBe(true);
    expect(swagger.paths['/payouts/request']?.post).toMatchObject({
      requestBody: {
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/CreatePayoutDto' },
          },
        },
      },
      responses: {
        '201': {
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/PayoutRequestResponseDto' },
            },
          },
        },
      },
    });
    expect(
      swagger.paths['/payouts/request']?.post?.security?.some((rule) =>
        Object.hasOwn(rule, 'access-token'),
      ),
    ).toBe(true);
    expect(swagger.paths['/nfts/mint']?.post).toMatchObject({
      requestBody: {
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/MintNftDto' },
          },
        },
      },
      responses: {
        '201': {
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/NftMintResponseDto' },
            },
          },
        },
      },
    });
    expect(
      swagger.paths['/nfts/mint']?.post?.security?.some((rule) =>
        Object.hasOwn(rule, 'access-token'),
      ),
    ).toBe(true);
    expect(swagger.paths['/nfts/mint']?.post).toMatchObject({
      responses: {
        '401': {
          content: {
            'application/json': {
              schema: {
                required: ['statusCode', 'errorCode', 'message'],
                properties: {
                  statusCode: { type: 'number', example: 401 },
                  errorCode: { type: 'string', example: 'UNAUTHORIZED' },
                  message: {
                    type: 'string',
                    example: 'Authentication required',
                  },
                },
              },
            },
          },
        },
      },
    });
  });

  it('verifies all consumer interactions against the controller provider', async () => {
    const verifier = new Verifier({
      provider: 'clips-backend-api',
      providerBaseUrl: await app.getUrl(),
      pactUrls: [
        path.resolve(
          'src/tests/pact/pacts/clips-frontend-clips-backend-api.json',
        ),
      ],
      providerVersion: process.env.GITHUB_SHA ?? 'local-contract-test',
      logLevel: 'error',
      stateHandlers: {
        'a registered user exists': () => undefined,
        'the user has clips': () => undefined,
        'the user has uploaded videos': () => undefined,
        'the user has earnings': () => undefined,
        'the user has a connected wallet': () => undefined,
        'the user has sufficient balance': () => undefined,
        'the user owns a mintable clip and its collection is available': () =>
          undefined,
      },
    });

    await verifier.verifyProvider();
  });

  it('rejects invalid payout and NFT request bodies', async () => {
    const baseUrl = await app.getUrl();
    await request(baseUrl)
      .post('/payouts/request')
      .set('Authorization', 'Bearer test-token')
      .send({ amount: 0, currency: 'USD', method: 'stellar' })
      .expect(400);

    await request(baseUrl)
      .post('/nfts/mint')
      .set('Authorization', 'Bearer test-token')
      .send({
        clipId: 0,
        creatorWallet:
          'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
      })
      .expect(400);
  });
});

function createProviderServices() {
  return {
    auth: {
      login: jest.fn().mockResolvedValue({ user, tokens: tokenPair }),
    },
    clips: {
      listClips: jest.fn().mockResolvedValue([clip]),
    },
    earnings: {
      getUserTotalEarningsCached: jest
        .fn()
        .mockResolvedValue({ total: 2500.5, currency: 'USD' }),
    },
    wallets: {
      listWallets: jest.fn().mockResolvedValue([wallet]),
    },
    payouts: {
      requestPayoutWithDetails: jest.fn().mockResolvedValue(payout),
    },
    nftMint: {
      validateClipOwner: jest.fn().mockResolvedValue(undefined),
      assertMintCooldown: jest.fn().mockResolvedValue(undefined),
      uploadMetadataToIPFS: jest
        .fn()
        .mockResolvedValue({ metadataUri: mintResponse.metadataUri }),
      recordSuccessfulMint: jest.fn().mockResolvedValue(undefined),
    },
    nftMintEnqueue: {
      enqueueMint: jest.fn(),
    },
    nft: {
      mintClip: jest.fn().mockResolvedValue(mintResponse),
    },
    prisma: {
      nftCollection: {
        findUnique: jest.fn().mockResolvedValue({
          collectionId: 'viral-clips',
          maxSupply: null,
          royaltyBps: 1000,
        }),
      },
      clip: {
        update: jest.fn().mockResolvedValue({}),
      },
    },
  };
}

async function createProviderApp(
  services: ReturnType<typeof createProviderServices>,
) {
  const moduleRef = await Test.createTestingModule({
    controllers: [
      AuthController,
      ClipsController,
      VideosController,
      EarningsController,
      WalletsController,
      PayoutsController,
      NftController,
    ],
    providers: [
      { provide: AuthService, useValue: services.auth },
      {
        provide: CookieService,
        useValue: { setTokenCookies: jest.fn(), clearTokenCookies: jest.fn() },
      },
      {
        provide: DeviceFingerprintService,
        useValue: {
          extractFromRequest: jest.fn().mockReturnValue({}),
          generateFingerprint: jest.fn().mockReturnValue({}),
        },
      },
      {
        provide: CsrfService,
        useValue: {
          generateToken: jest.fn().mockReturnValue('csrf-token'),
          setCsrfCookie: jest.fn(),
        },
      },
      { provide: ClipsService, useValue: services.clips },
      { provide: ClipPublishService, useValue: {} },
      { provide: EarningsService, useValue: services.earnings },
      { provide: EarningsAggregationService, useValue: {} },
      { provide: EarningsExportService, useValue: {} },
      { provide: DailyEarningsAggregationService, useValue: {} },
      { provide: LeaderboardService, useValue: {} },
      { provide: WalletsService, useValue: services.wallets },
      { provide: WalletBalanceService, useValue: {} },
      { provide: NftOwnershipService, useValue: {} },
      { provide: PayoutsService, useValue: services.payouts },
      { provide: BalanceService, useValue: {} },
      { provide: FeeService, useValue: {} },
      { provide: PayoutExportService, useValue: {} },
      { provide: NftService, useValue: services.nft },
      { provide: NftMintService, useValue: services.nftMint },
      { provide: NftMetadataService, useValue: {} },
      { provide: IpfsUploadService, useValue: {} },
      { provide: RoyaltyQueryService, useValue: {} },
      { provide: NftOwnershipVerificationService, useValue: {} },
      { provide: PrismaService, useValue: services.prisma },
      { provide: RoyaltyConfigurationService, useValue: {} },
      { provide: MintSignatureVerificationService, useValue: {} },
      { provide: AdminContractService, useValue: {} },
      { provide: AdminConfigService, useValue: {} },
      { provide: NftApprovalService, useValue: {} },
      { provide: GasMetricsService, useValue: {} },
      { provide: NftTransferService, useValue: {} },
      { provide: NftTransferHistoryService, useValue: {} },
      { provide: NftMetadataRefreshService, useValue: {} },
      { provide: ClaimRoyaltyService, useValue: {} },
      { provide: RoyaltyClaimHistoryService, useValue: {} },
      { provide: NftMintEnqueueService, useValue: services.nftMintEnqueue },
    ],
  })
    .overrideGuard(JwtAuthGuard)
    .useValue({
      canActivate(context: {
        switchToHttp(): {
          getRequest(): {
            headers: Record<string, string | undefined>;
            user?: Record<string, unknown>;
          };
        };
      }) {
        const req = context.switchToHttp().getRequest();
        if (!req.headers.authorization?.startsWith('Bearer ')) {
          throw new UnauthorizedException({
            statusCode: 401,
            errorCode: 'UNAUTHORIZED',
            message: 'Authentication required',
          });
        }
        req.user = { id: 1, userId: 1, emailVerified: true };
        return true;
      },
    })
    .overrideGuard(BruteForceGuard)
    .useValue({ canActivate: () => true })
    .overrideGuard(NftMintGuard)
    .useValue({ canActivate: () => true })
    .overrideGuard(QueueRateLimitGuard)
    .useValue({ canActivate: () => true })
    .compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ transform: true }));
  await app.init();
  await app.listen(0);
  return app;
}
