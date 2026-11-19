/**
 * Shared configuration and helpers for the ClipCash Soroban NFT examples.
 *
 * Environment (.env, never commit real values):
 *   SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
 *   STELLAR_NETWORK=TESTNET            # or PUBLIC for mainnet
 *   NFT_CONTRACT_ID=C...               # deployed contract id
 *   API_BASE_URL=http://localhost:3000 # clips-backend (for royalty REST query)
 *
 * Wallet: any wallet exposing `getAddress()` and `signTransaction(xdr, opts)`
 * (e.g. Freighter via @stellar/freighter-api). The wallet must be set to the
 * same network as STELLAR_NETWORK. No private keys are used in these examples.
 */
import {
  Contract,
  Networks,
  TransactionBuilder,
  BASE_FEE,
  rpc,
  xdr,
} from '@stellar/stellar-sdk';

export const config = {
  rpcUrl: process.env.SOROBAN_RPC_URL ?? 'https://soroban-testnet.stellar.org',
  networkPassphrase:
    process.env.STELLAR_NETWORK === 'PUBLIC' ? Networks.PUBLIC : Networks.TESTNET,
  contractId: process.env.NFT_CONTRACT_ID ?? '',
  apiBaseUrl: process.env.API_BASE_URL ?? 'http://localhost:3000',
};

/** Minimal wallet interface (Freighter-compatible). */
export interface Wallet {
  getAddress(): Promise<{ address: string }>;
  signTransaction(
    txXdr: string,
    opts: { networkPassphrase: string; address?: string },
  ): Promise<{ signedTxXdr: string }>;
}

export const server = new rpc.Server(config.rpcUrl);

/** Wallet connection: resolve the user's public key. */
export async function connectWallet(wallet: Wallet): Promise<string> {
  const { address } = await wallet.getAddress();
  if (!address) throw new Error('Wallet not connected or access denied');
  return address;
}

/** Build, simulate, sign with the wallet, submit and wait for the result. */
export async function invoke(
  wallet: Wallet,
  source: string,
  method: string,
  args: xdr.ScVal[],
): Promise<rpc.Api.GetSuccessfulTransactionResponse> {
  if (!config.contractId) throw new Error('NFT_CONTRACT_ID is not set');
  const account = await server.getAccount(source);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: config.networkPassphrase,
  })
    .addOperation(new Contract(config.contractId).call(method, ...args))
    .setTimeout(60)
    .build();

  // Simulation fills in footprint/resources and surfaces contract errors early.
  const prepared = await server.prepareTransaction(tx);

  // Transaction signing (wallet holds the key).
  const { signedTxXdr } = await wallet.signTransaction(prepared.toXDR(), {
    networkPassphrase: config.networkPassphrase,
    address: source,
  });

  // Transaction submission.
  const signed = TransactionBuilder.fromXDR(signedTxXdr, config.networkPassphrase);
  const sent = await server.sendTransaction(signed);
  if (sent.status === 'ERROR') {
    throw new Error(`Submission failed: ${JSON.stringify(sent.errorResult)}`);
  }

  let res = await server.getTransaction(sent.hash);
  for (let i = 0; res.status === rpc.Api.GetTransactionStatus.NOT_FOUND && i < 30; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    res = await server.getTransaction(sent.hash);
  }
  if (res.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
    throw new Error(`Transaction ${sent.hash} failed with status ${res.status}`);
  }
  return res;
}

/** Contract error codes (mirrors `Error` in contracts/nft-contract/src/lib.rs). */
export const CONTRACT_ERRORS: Record<number, string> = {
  1: 'Unauthorized',
  2: 'TokenNotFound',
  3: 'AlreadyInitialized',
  4: 'NotInitialized',
  5: 'SoulboundTokenNotTransferable',
  6: 'InvalidTokenId',
  7: 'InvalidRoyaltyBps',
};

/** Map a simulation/submission error to a readable contract error name. */
export function describeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const code = /Error\(Contract, #(\d+)\)/.exec(msg)?.[1];
  return code ? CONTRACT_ERRORS[Number(code)] ?? `Contract error #${code}` : msg;
}
