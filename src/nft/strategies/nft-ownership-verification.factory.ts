import {
  SorobanOwnerOfVerificationStrategy,
  type NftOwnershipVerificationStrategy,
} from './nft-ownership-verification.strategy';

export const NFT_OWNERSHIP_STRATEGY = 'NFT_OWNERSHIP_STRATEGY';

export function createDefaultOwnershipStrategy(deps: {
  rpcUrl: string;
  networkPassphrase: string;
}): NftOwnershipVerificationStrategy {
  return new SorobanOwnerOfVerificationStrategy(
    deps.rpcUrl,
    deps.networkPassphrase,
  );
}
