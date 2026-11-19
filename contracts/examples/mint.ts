import {
  connectWallet,
  getContract,
  nativeToScVal,
  reportExampleError,
  signAndSubmit,
} from './common.js';

export interface MintNftInput {
  tokenId: bigint;
  metadataUri: string;
  royaltyBps: number;
}

export async function mintNft(input: MintNftInput): Promise<string> {
  return reportExampleError('Soroban mint', async () => {
    const walletAddress = await connectWallet();
    const operation = getContract().call(
      'mint',
      nativeToScVal(walletAddress, { type: 'address' }),
      nativeToScVal(input.tokenId, { type: 'u64' }),
      nativeToScVal(input.metadataUri, { type: 'string' }),
      nativeToScVal(input.royaltyBps, { type: 'u32' }),
    );

    return signAndSubmit(operation, walletAddress);
  });
}

// Example: await mintNft({ tokenId: 42n, metadataUri: 'ipfs://CID', royaltyBps: 1000 });