#!/usr/bin/env bash
# Shared Soroban NFT contract deployment driver (Issue #1166).
#
# Environment-driven network selection: STELLAR_NETWORK must be either
# "testnet" or "public" (mainnet). Deploys the compiled contract WASM and
# prints the resulting contract ID, which must be exported to the backend
# as SOROBAN_NFT_CONTRACT_ID.
#
# Required environment variables:
#   SOROBAN_NFT_WASM      Path to the compiled contract WASM artifact
#   STELLAR_NETWORK       testnet | public
#   STELLAR_SOURCE        Secret seed or identity used to sign the deploy
#
# Optional:
#   SOROBAN_RPC_URL       Override the default RPC endpoint for the network
#   ARTIFACT_DIR          Where deployment.json is written (default: ./deployments)
#   ALLOW_MAINNET_DEPLOY  Must be "true" to deploy on public/mainnet
set -euo pipefail
umask 077

required=(SOROBAN_NFT_WASM STELLAR_NETWORK STELLAR_SOURCE)
for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    printf 'Required environment variable is missing: %s\n' "$name" >&2
    exit 2
  fi
done

network="$STELLAR_NETWORK"
case "$network" in
  testnet|Testnet)
    network="testnet"
    ;;
  public|Public|mainnet)
    network="public"
    ;;
  *)
    printf 'Unsupported STELLAR_NETWORK: %s (expected "testnet" or "public")\n' "$network" >&2
    exit 2
    ;;
esac

if [[ "$network" == "public" && "${ALLOW_MAINNET_DEPLOY:-false}" != "true" ]]; then
  printf 'Refusing mainnet deployment. Set ALLOW_MAINNET_DEPLOY=true only after an approved testnet run.\n' >&2
  exit 2
fi

if [[ ! -s "$SOROBAN_NFT_WASM" ]]; then
  printf 'Contract WASM does not exist or is empty: %s\n' "$SOROBAN_NFT_WASM" >&2
  exit 2
fi

if ! command -v stellar >/dev/null 2>&1; then
  printf 'stellar CLI not found on PATH. Install it first: https://developers.stellar.org/docs/tools/cli\n' >&2
  exit 2
fi

rpc_url="${SOROBAN_RPC_URL:-}"
if [[ -z "$rpc_url" ]]; then
  if [[ "$network" == "testnet" ]]; then
    rpc_url="https://soroban-testnet.stellar.org"
  else
    rpc_url="https://mainnet.sorobanrpc.com"
  fi
fi

artifact_dir="${ARTIFACT_DIR:-./deployments}"
mkdir -p "$artifact_dir"
deployment="$artifact_dir/deployment-${network}.json"

printf 'Deploying Soroban NFT contract to %s (RPC: %s)...\n' "$network" "$rpc_url"
contract_id="$(
  stellar contract deploy \
    --wasm "$SOROBAN_NFT_WASM" \
    --network "$network" \
    --source "$STELLAR_SOURCE" \
    --rpc-url "$rpc_url"
)"

if [[ -z "$contract_id" ]]; then
  printf 'Deployment did not return a contract ID.\n' >&2
  exit 1
fi

node -e '
  const fs = require("node:fs");
  const [file, contractId, network, rpcUrl, wasm] = process.argv.slice(1);
  if (!/^C[A-Z2-7]{55}$/.test(contractId)) {
    throw new Error(`Deployed contract ID failed validation: ${contractId}`);
  }
  fs.writeFileSync(file, JSON.stringify({
    contractId,
    network,
    rpcUrl,
    wasm,
    deployedAt: new Date().toISOString(),
  }, null, 2) + "\n");
' "$deployment" "$contract_id" "$network" "$rpc_url" "$SOROBAN_NFT_WASM"

printf '\nContract ID: %s\n' "$contract_id"
printf 'Deployment record: %s\n' "$deployment"
printf 'Network: %s\n' "$network"
printf '\nNext steps:\n'
printf '  1. Export the contract ID for the backend:\n'
printf '       SOROBAN_NFT_CONTRACT_ID=%s\n' "$contract_id"
printf '  2. Verify the backend picked it up via the contract info endpoint (Issue #1166):\n'
printf '       GET /soroban/contract/info\n'
printf '     which returns { contractId, network, rpcUrl, networkPassphrase, explorerUrl }.\n'
