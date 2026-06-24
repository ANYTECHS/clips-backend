import { SetMetadata } from '@nestjs/common';

export const NFT_MINTABLE_KEY = 'nft_mintable';

export interface NftMintableOptions {
  /** Route param or body field containing clip ID */
  clipIdParam?: string;
}

export const NftMintable = (options: NftMintableOptions = {}) =>
  SetMetadata(NFT_MINTABLE_KEY, {
    clipIdParam: options.clipIdParam ?? 'clipId',
  });
