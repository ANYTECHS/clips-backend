#!/usr/bin/env bash
# Deploy the Soroban NFT contract to Stellar mainnet/public (Issue #1166).
# Requires an approved testnet run first: ALLOW_MAINNET_DEPLOY=true.
# Usage: SOROBAN_NFT_WASM=./nft.wasm STELLAR_SOURCE=... ALLOW_MAINNET_DEPLOY=true ./scripts/deploy-mainnet.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

STELLAR_NETWORK=public ALLOW_MAINNET_DEPLOY="${ALLOW_MAINNET_DEPLOY:-false}" \
  exec "$SCRIPT_DIR/deploy.sh"
