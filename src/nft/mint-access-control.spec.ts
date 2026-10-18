import { BadRequestException, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { NftController } from './nft.controller';
import { MAX_ROYALTY_BPS } from './clip-royalty.service';

const collection = {
  collectionId: 'clipcash-primary',
  maxSupply: null,
  royaltyBps: 500,
  contractAddress: 'CCONTRACT',
};

const baseDto = {
  clipId: 42,
  creatorWallet: 'GCREATOR',
  metadataUri: 'https://ipfs.example/meta.json',
};

describe('POST /nfts/mint – access control & royalty (Issue #1165, #1167)', () => {
  let controller: NftController;
  let nftMintService: { validateClipOwner: jest.Mock; uploadMetadataToIPFS: jest.Mock };
  let nftService: { mintClip: jest.Mock };
  let prisma: any;
  let mintSignatureVerification: { verify: jest.Mock };

  beforeEach(async () => {
    nftMintService = {
      validateClipOwner: jest.fn().mockResolvedValue(undefined),
      uploadMetadataToIPFS: jest.fn().mockResolvedValue({ metadataUri: 'https://ipfs.example/uploaded.json' }),
    };
    nftService = { mintClip: jest.fn().mockResolvedValue({ txHash: '0xabc' }) };
    mintSignatureVerification = { verify: jest.fn() };
    prisma = {
      nftCollection: { findUnique: jest.fn().mockResolvedValue(collection) },
      clip: { count: jest.fn().mockResolvedValue(0), update: jest.fn().mockResolvedValue({}) },
    };

    controller = new NftController(
      nftService as any,
      nftMintService as any,
      { build: jest.fn() } as any,
      {} as any,
      { getRoyaltyInfo: jest.fn(), getRoyaltySplits: jest.fn() } as any,
      { verifyNFTOwnership: jest.fn() } as any,
      { tokenExists: jest.fn(), getOwner: jest.fn() } as any,
      prisma as any,
      { getCreatorRoyaltyBps: jest.fn(), getPlatformWallet: jest.fn() } as any,
      mintSignatureVerification as any,
      { getPauseStatus: jest.fn(), preparePauseTx: jest.fn() } as any,
      {} as any,
      {} as any,
      { getStats: jest.fn() } as any,
      { prepareTransferTx: jest.fn() } as any,
      { getTransfers: jest.fn() } as any,
      { prepareRefreshWithCooldown: jest.fn() } as any,
      {} as any,
      {} as any,
      { getOrCreate: jest.fn() } as any,
    );
  });

  const req = { user: { id: 7 } } as any;

  describe('successful mint', () => {
    it('validates ownership, then mints with the requested metadata URI', async () => {
      const result = await controller.mint({ ...baseDto }, req);

      expect(nftMintService.validateClipOwner).toHaveBeenCalledWith(42, 7);
      expect(nftService.mintClip).toHaveBeenCalledWith({
        clipId: '42',
        collectionId: 'viral-clips',
        creatorWallet: 'GCREATOR',
        metadataUri: 'https://ipfs.example/meta.json',
        royaltyBps: 500,
      });
      expect(result).toEqual({ txHash: '0xabc' });
    });

    it('uploads metadata when no metadataUri is supplied', async () => {
      const { metadataUri: _omitted, ...withoutUri } = baseDto;
      await controller.mint(withoutUri, req);

      expect(nftMintService.uploadMetadataToIPFS).toHaveBeenCalledWith(42, 'viral-clips');
      expect(nftService.mintClip).toHaveBeenCalledWith(
        expect.objectContaining({ metadataUri: 'https://ipfs.example/uploaded.json' }),
      );
    });

    it('uses the requested royaltyBps when provided', async () => {
      await controller.mint({ ...baseDto, royaltyBps: 1000 }, req);

      expect(nftService.mintClip).toHaveBeenCalledWith(expect.objectContaining({ royaltyBps: 1000 }));
    });

    it('falls back to the collection royaltyBps when the request omits one', async () => {
      await controller.mint({ ...baseDto }, req);

      expect(nftService.mintClip).toHaveBeenCalledWith(expect.objectContaining({ royaltyBps: 500 }));
    });

    it('accepts a royaltyBps at the 1500 (15%) maximum', async () => {
      await controller.mint({ ...baseDto, royaltyBps: MAX_ROYALTY_BPS }, req);

      expect(nftService.mintClip).toHaveBeenCalledWith(expect.objectContaining({ royaltyBps: 1500 }));
    });
  });

  describe('unauthorized mint', () => {
    it('propagates 403 when the caller does not own the clip', async () => {
      nftMintService.validateClipOwner.mockRejectedValue(
        new ForbiddenException('You do not own this clip'),
      );

      await expect(controller.mint({ ...baseDto }, req)).rejects.toThrow(ForbiddenException);
      expect(nftService.mintClip).not.toHaveBeenCalled();
    });

    it('rejects an invalid wallet signature with 401 before any state change', async () => {
      mintSignatureVerification.verify.mockImplementation(() => {
        throw new UnauthorizedException('Mint signature is invalid — wallet authorization failed');
      });

      await expect(
        controller.mint({ ...baseDto, walletSignature: 'deadbeef' }, req),
      ).rejects.toThrow(UnauthorizedException);
      expect(mintSignatureVerification.verify).toHaveBeenCalledWith(42, 'GCREATOR', 'deadbeef');
      expect(prisma.clip.update).not.toHaveBeenCalled();
      expect(nftService.mintClip).not.toHaveBeenCalled();
    });

    it('accepts a valid wallet signature and continues to mint', async () => {
      mintSignatureVerification.verify.mockReturnValue({ valid: true });

      await controller.mint({ ...baseDto, walletSignature: 'cafebabe' }, req);

      expect(mintSignatureVerification.verify).toHaveBeenCalledWith(42, 'GCREATOR', 'cafebabe');
      expect(nftService.mintClip).toHaveBeenCalled();
    });

    it('verifies the signature only when one is supplied', async () => {
      await controller.mint({ ...baseDto }, req);

      expect(mintSignatureVerification.verify).not.toHaveBeenCalled();
    });
  });

  describe('duplicate mint prevention', () => {
    it('surfaces 409 when a mint job already exists for the clip', async () => {
      nftMintService.validateClipOwner.mockRejectedValue(
        new BadRequestException('Mint job already exists for clip 42 (jobId: nft-mint-clip-42).'),
      );

      await expect(controller.mint({ ...baseDto }, req)).rejects.toThrow(BadRequestException);
      expect(nftService.mintClip).not.toHaveBeenCalled();
    });

    it('rejects when the collection supply is exhausted', async () => {
      prisma.clip.count.mockResolvedValue(1);
      prisma.nftCollection.findUnique.mockResolvedValue({ ...collection, maxSupply: 1 });

      await expect(controller.mint({ ...baseDto }, req)).rejects.toThrow(
        BadRequestException,
      );
      expect(nftService.mintClip).not.toHaveBeenCalled();
    });
  });

  describe('collection validation', () => {
    it('rejects an unsupported collectionId', async () => {
      await expect(
        controller.mint({ ...baseDto, collectionId: 'unknown-collection' }, req),
      ).rejects.toThrow('Unsupported collectionId: unknown-collection');
      expect(nftService.mintClip).not.toHaveBeenCalled();
    });

    it('rejects when the collection does not exist', async () => {
      prisma.nftCollection.findUnique.mockResolvedValue(null);

      await expect(
        controller.mint({ ...baseDto, collectionId: 'clipcash-primary' }, req),
      ).rejects.toThrow('Unsupported collectionId: clipcash-primary');
      expect(nftService.mintClip).not.toHaveBeenCalled();
    });
  });

  describe('royalty configuration limits (Issue #1170)', () => {
    it('caps MAX_ROYALTY_BPS at 1500 basis points (15%)', () => {
      expect(MAX_ROYALTY_BPS).toBe(1500);
    });
  });
});
