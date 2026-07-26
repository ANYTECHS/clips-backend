jest.mock('../src/clips/nft-mint.service', () => ({
  NftMintService: class NftMintService {},
}));

import { CanActivate, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import type { App } from 'supertest/types';
import { NftController } from '../src/nft/nft.controller';
import { NftService } from '../src/nft/nft.service';
import { NftMetadataService } from '../src/nft/nft-metadata.service';
import { IpfsUploadService } from '../src/nft/ipfs-upload.service';
import { RoyaltyQueryService } from '../src/nft/royalty-query.service';
import { NftMintService } from '../src/clips/nft-mint.service';
import { LoginGuard } from '../src/auth/guards/login.guard';
import { NftMintGuard } from '../src/nft/guards/nft-mint.guard';

describe('NFT mint preparation (e2e)', () => {
  let app: INestApplication<App>;

  const nftMintService = {
    validateClipOwner: jest.fn(),
    prepareMintTx: jest.fn(),
    confirmMint: jest.fn(),
    uploadMetadataToIPFS: jest.fn(),
  };

  beforeAll(async () => {
    const allow: CanActivate = { canActivate: () => true };

    const moduleRef = await Test.createTestingModule({
      controllers: [NftController],
      providers: [
        { provide: NftService, useValue: { mintClip: jest.fn() } },
        { provide: NftMintService, useValue: nftMintService },
        { provide: NftMetadataService, useValue: {} },
        { provide: IpfsUploadService, useValue: {} },
        { provide: RoyaltyQueryService, useValue: { getRoyaltyInfo: jest.fn() } },
        LoginGuard,
        NftMintGuard,
      ],
    })
      .overrideGuard(LoginGuard)
      .useValue({
        canActivate: (context: {
          switchToHttp(): { getRequest(): { user: { id: number } } };
        }) => {
          context.switchToHttp().getRequest().user = { id: 7 };
          return true;
        },
      })
      .overrideGuard(NftMintGuard)
      .useValue(allow)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('validates ownership and returns unsigned mint XDR', async () => {
    nftMintService.prepareMintTx.mockResolvedValue({
      xdr: 'AAAAAgAAA...',
      clipId: 42,
      tokenId: 42,
      metadataUri: 'ipfs://bafy-test',
      to: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
      contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEU4',
      network: 'testnet',
    });

    const response = await request(app.getHttpServer())
      .post('/nfts/prepare-mint')
      .send({
        clipId: 42,
        walletAddress:
          'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
      })
      .expect(201);

    expect(nftMintService.validateClipOwner).toHaveBeenCalledWith(42, 7);
    expect(nftMintService.prepareMintTx).toHaveBeenCalledWith(
      42,
      'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
    );
    expect(response.body).toMatchObject({
      xdr: 'AAAAAgAAA...',
      clipId: 42,
      metadataUri: 'ipfs://bafy-test',
    });
  });

  it('rejects malformed mint preparation requests', async () => {
    await request(app.getHttpServer())
      .post('/nfts/prepare-mint')
      .send({ clipId: 0, walletAddress: '' })
      .expect(400);

    expect(nftMintService.validateClipOwner).not.toHaveBeenCalled();
    expect(nftMintService.prepareMintTx).not.toHaveBeenCalled();
  });

  it('publishes the mint preparation contract in OpenAPI', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Clips API')
        .addBearerAuth(
          { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
          'access-token',
        )
        .build(),
    );
    const operation = document.paths['/nfts/prepare-mint']?.post;

    expect(operation?.summary).toBe(
      'Prepare a Soroban mint transaction (returns XDR for signing)',
    );
    expect(Object.keys(operation?.responses ?? {})).toEqual(
      expect.arrayContaining(['201', '401']),
    );
  });
});
