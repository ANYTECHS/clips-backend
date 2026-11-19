/**
 * Mint example. `mint` requires the contract admin's authorization, so this
 * must be signed by the admin wallet (or performed by the backend via
 * POST /nft/mint — see Swagger "nft" tag).
 */
import { Address, nativeToScVal } from '@stellar/stellar-sdk';
import { connectWallet, describeError, invoke, Wallet } from './config';

export async function mintClipNft(
  adminWallet: Wallet,
  params: { to: string; tokenId: bigint; clipId: string; contentUri: string; soulbound?: boolean },
) {
  const admin = await connectWallet(adminWallet);
  try {
    const res = await invoke(adminWallet, admin, 'mint', [
      new Address(params.to).toScVal(),
      nativeToScVal(params.tokenId, { type: 'u64' }),
      nativeToScVal(params.clipId, { type: 'string' }),
      nativeToScVal(params.contentUri, { type: 'string' }),
      nativeToScVal(params.soulbound ?? false, { type: 'bool' }),
    ]);
    return { txHash: res.txHash, ledger: res.ledger };
  } catch (err) {
    throw new Error(`Mint failed: ${describeError(err)}`);
  }
}
