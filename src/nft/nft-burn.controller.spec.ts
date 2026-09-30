import {
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { NftController } from './nft.controller';
import { NftMintService } from '../clips/nft-mint.service';

const WALLET = 'GC6X2Y3ZQZFXBABKHOKSAVHOJ7NDGQBZC7XT2M6RCFPEHVGT7JXOTUZF';

function makeController() {
  const dependencies = {
    nftMintService: {
      validateClipOwner: jest.fn().mockResolvedValue(undefined),
      prepareBurnTx: jest.fn().mockResolvedValue({
        xdr: 'encoded-burn-call',
        tokenId: 42,
        owner: WALLET,
        contractId: 'C...NFT',
        network: 'testnet',
      }),
    },
    nftOwnershipService: {
      verifyNFTOwnership: jest.fn().mockResolvedValue({ isOwner: true }),
    },
    royaltyQueryService: {
      getRoyaltyInfo: jest.fn().mockResolvedValue({ recipient: WALLET, royaltyBps: 500 }),
    },
    claimRoyaltyService: {
      getClaimableBalance: jest.fn().mockResolvedValue(12500000),
    },
  };
  const controller = Object.assign(Object.create(NftController.prototype), dependencies);
  return { controller, ...dependencies };
}

describe('POST /nfts/:tokenId/burn', () => {
  const request = { user: { id: 7 } } as any;

  it('prepares a burn without querying or refunding royalties by default', async () => {
    const { controller, nftMintService, royaltyQueryService } = makeController();

    const result = await controller.burn(42, { walletAddress: WALLET }, request);

    expect(nftMintService.prepareBurnTx).toHaveBeenCalledWith(42, WALLET, false);
    expect(royaltyQueryService.getRoyaltyInfo).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      refundRoyalties: false,
      refundRecipient: null,
      refundAmount: '0',
    });
  });

  it('reports the configured recipient and claimable amount when refund is enabled', async () => {
    const { controller, nftMintService, claimRoyaltyService } = makeController();

    const result = await controller.burn(
      42,
      { walletAddress: WALLET, refundRoyalties: true },
      request,
    );

    expect(nftMintService.prepareBurnTx).toHaveBeenCalledWith(42, WALLET, true);
    expect(claimRoyaltyService.getClaimableBalance).toHaveBeenCalledWith(42, WALLET);
    expect(result).toMatchObject({
      refundRoyalties: true,
      refundRecipient: WALLET,
      refundAmount: '12500000',
    });
  });

  it('allows a refund-enabled burn when the royalty balance is zero', async () => {
    const { controller, nftMintService, claimRoyaltyService } = makeController();
    claimRoyaltyService.getClaimableBalance.mockResolvedValue(0);

    const result = await controller.burn(
      42,
      { walletAddress: WALLET, refundRoyalties: true },
      request,
    );

    expect(nftMintService.prepareBurnTx).toHaveBeenCalledWith(42, WALLET, true);
    expect(result.refundAmount).toBe('0');
  });

  it('rejects an unsafe royalty balance', async () => {
    const { controller, claimRoyaltyService } = makeController();
    claimRoyaltyService.getClaimableBalance.mockResolvedValue(Number.MAX_SAFE_INTEGER + 1);

    await expect(
      controller.burn(42, { walletAddress: WALLET, refundRoyalties: true }, request),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a wallet that is not the on-chain NFT owner', async () => {
    const { controller, nftOwnershipService, nftMintService } = makeController();
    nftOwnershipService.verifyNFTOwnership.mockResolvedValue({
      isOwner: false,
      error: 'Wallet does not own this NFT',
    });

    await expect(
      controller.burn(42, { walletAddress: WALLET }, request),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(nftMintService.prepareBurnTx).not.toHaveBeenCalled();
  });
});

describe('NftMintService.prepareBurnTx refund option', () => {
  const originalContractId = process.env.SOROBAN_NFT_CONTRACT_ID;

  afterAll(() => {
    if (originalContractId === undefined) {
      delete process.env.SOROBAN_NFT_CONTRACT_ID;
    } else {
      process.env.SOROBAN_NFT_CONTRACT_ID = originalContractId;
    }
  });

  it.each([undefined, false, true])('encodes refund_royalties=%s in the burn call', async (refundRoyalties) => {
    process.env.SOROBAN_NFT_CONTRACT_ID = 'C...NFT';
    const service = new NftMintService(
      {} as any,
      {} as any,
      {} as any,
      { validateAddress: jest.fn().mockReturnValue({ valid: true }), network: 'testnet' } as any,
      {} as any,
    );

    const result = await service.prepareBurnTx(42, WALLET, refundRoyalties);
    const invocation = JSON.parse(Buffer.from(result.xdr, 'base64').toString('utf8'));

    expect(invocation.args.refund_royalties).toBe(refundRoyalties === true);
    expect(result.refundRoyalties).toBe(refundRoyalties === true);
  });
});