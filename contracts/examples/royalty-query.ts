import {
  connectWallet,
  getContract,
  nativeToScVal,
  reportExampleError,
  simulateRead,
} from './common.js';
import { scValToNative } from '@stellar/stellar-sdk';

export interface RoyaltySplit {
  recipient: string;
  royaltyBps: number;
}

export async function queryRoyalties(tokenId: bigint): Promise<RoyaltySplit[]> {
  return reportExampleError('Soroban royalty query', async () => {
    const walletAddress = await connectWallet();
    const result = await simulateRead(
      getContract().call(
        'get_royalties',
        nativeToScVal(tokenId, { type: 'u64' }),
      ),
      walletAddress,
    );
    const decoded = scValToNative(result);
    const entries =
      decoded instanceof Map ? Array.from(decoded.entries()) : Object.entries(decoded);

    return entries.map(([recipient, basisPoints]) => ({
      recipient,
      royaltyBps: Number(basisPoints),
    }));
  });
}

// Example: const splits = await queryRoyalties(42n);