import {
  connectWallet,
  getContract,
  nativeToScVal,
  reportExampleError,
  signAndSubmit,
} from './common.js';

export interface TransferNftInput {
  tokenId: bigint;
  recipient: string;
  salePrice: bigint;
  royaltyBps: number;
}

export async function transferNft(input: TransferNftInput): Promise<string> {
  return reportExampleError('Soroban NFT transfer', async () => {
    const sender = await connectWallet();
    const operation = getContract().call(
      'transfer_with_royalty',
      nativeToScVal(input.tokenId, { type: 'u64' }),
      nativeToScVal(sender, { type: 'address' }),
      nativeToScVal(input.recipient, { type: 'address' }),
      nativeToScVal(input.salePrice, { type: 'i128' }),
      nativeToScVal(input.royaltyBps, { type: 'u32' }),
    );

    return signAndSubmit(operation, sender);
  });
}

// salePrice must use the smallest unit expected by the deployed contract.
// Example: await transferNft({ tokenId: 42n, recipient: 'G...', salePrice: 1000000n, royaltyBps: 1000 });