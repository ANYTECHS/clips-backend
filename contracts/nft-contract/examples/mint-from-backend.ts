/**
 * examples/mint-from-backend.ts
 *
 * Reference implementation for preparing a ClipCash NFT mint transaction
 * from a Node.js backend context, using the generated TypeScript bindings
 * in ../bindings/clips-nft-contract.ts (Issue #694).
 *
 * This mirrors what `POST /nfts/prepare-mint` does server-side (see
 * `src/clips/nft-mint.service.ts#prepareMintTx`): it builds and prints an
 * *unsigned* transaction XDR. It does not sign or submit anything.
 *
 * IMPORTANT: the contract's `mint` function requires `admin.require_auth()`
 * on-chain (see `contracts/nft-contract/src/lib.rs`), so the account that
 * eventually signs the XDR this script prints must be the contract's
 * configured admin wallet — not the recipient's wallet. `--source` below
 * is that admin account's public key (it only needs to sign the sequence
 * number / pay the fee here; the signing step itself happens separately,
 * e.g. via `stellar tx sign` or a signer service).
 *
 * Usage:
 *   export SOROBAN_NFT_CONTRACT_ID=C...   # deployed contract ID
 *   export STELLAR_NETWORK=testnet        # or "public"
 *
 *   npx ts-node contracts/nft-contract/examples/mint-from-backend.ts \
 *     --clip-id 42 \
 *     --wallet GABCDEF...RECIPIENT \
 *     --source GADMIN...ADMINACCOUNT \
 *     [--content-uri ipfs://Qm.../metadata.json] \
 *     [--soulbound]
 *
 * Output:
 *   Unsigned transaction XDR, printed to stdout.
 */

import { parseArgs } from 'node:util';
import { createClipsNftContractClient } from '../bindings/clips-nft-contract';

interface NetworkConfig {
  rpcUrl: string;
  networkPassphrase: string;
}

function resolveNetwork(network: string): NetworkConfig {
  const isMainnet = network.toLowerCase() === 'public';
  return isMainnet
    ? {
        rpcUrl: 'https://soroban-rpc.stellar.org',
        networkPassphrase: 'Public Global Stellar Network ; September 2015',
      }
    : {
        rpcUrl: 'https://soroban-testnet.stellar.org',
        networkPassphrase: 'Test SDF Network ; September 2015',
      };
}

async function main() {
  const { values } = parseArgs({
    options: {
      'clip-id': { type: 'string' },
      wallet: { type: 'string' },
      source: { type: 'string' },
      'content-uri': { type: 'string' },
      soulbound: { type: 'boolean', default: false },
    },
  });

  const clipId = values['clip-id'];
  const wallet = values.wallet;
  const source = values.source;

  if (!clipId || !wallet || !source) {
    console.error(
      'Usage: mint-from-backend.ts --clip-id <id> --wallet <G...> --source <G...admin> [--content-uri <uri>] [--soulbound]',
    );
    process.exitCode = 1;
    return;
  }

  const contractId = process.env.SOROBAN_NFT_CONTRACT_ID;
  if (!contractId) {
    console.error('SOROBAN_NFT_CONTRACT_ID environment variable is required.');
    process.exitCode = 1;
    return;
  }

  const { rpcUrl, networkPassphrase } = resolveNetwork(
    process.env.STELLAR_NETWORK ?? 'testnet',
  );

  const client = createClipsNftContractClient({
    contractId,
    rpcUrl,
    networkPassphrase,
  });

  const contentUri =
    values['content-uri'] ?? `https://clips.cash/metadata/${clipId}`;

  const xdr = await client.buildMintTransaction({
    sourceAddress: source,
    to: wallet,
    tokenId: BigInt(clipId),
    clipId,
    contentUri,
    isSoulbound: Boolean(values.soulbound),
  });

  console.log(xdr);
}

main().catch((err) => {
  console.error('Failed to build mint transaction:', err);
  process.exitCode = 1;
});
