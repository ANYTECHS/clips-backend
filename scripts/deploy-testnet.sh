#!/usr/bin/env bash
# Deploy the Soroban NFT contract to Stellar testnet (Issue #1166).
# Usage: SOROBAN_NFT_WASM=./nft.wasm STELLAR_SOURCE=... ./scripts/deploy-testnet.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

STELLAR_NETWORK=testnet \
  exec "$SCRIPT_DIR/deploy.sh"
