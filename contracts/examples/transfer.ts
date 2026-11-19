/**
 * Transfer example. The current owner's wallet signs; soulbound tokens and
 * non-owners are rejected by the contract.
 */
import { Address, nativeToScVal } from '@stellar/stellar-sdk';
import { connectWallet, describeError, invoke, Wallet } from './config';

export async function transferClipNft(wallet: Wallet, to: string, tokenId: bigint) {
  const from = await connectWallet(wallet);
  try {
    const res = await invoke(wallet, from, 'transfer', [
      new Address(from).toScVal(),
      new Address(to).toScVal(),
      nativeToScVal(tokenId, { type: 'u64' }),
    ]);
    return { txHash: res.txHash, ledger: res.ledger };
  } catch (err) {
    throw new Error(`Transfer failed: ${describeError(err)}`);
  }
}
