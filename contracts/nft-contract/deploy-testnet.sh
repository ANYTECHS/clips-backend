#!/usr/bin/env bash
# ============================================================
# deploy-testnet.sh — Deploy ClipCash NFT contract to Stellar Testnet
#
# Usage:
#   chmod +x deploy-testnet.sh
#   ./deploy-testnet.sh
#
# Prerequisites:
#   - Rust toolchain with wasm32-unknown-unknown target
#   - stellar CLI (https://developers.stellar.org/docs/tools/developer-tools/cli/install)
#   - STELLAR_SECRET_KEY env var set to the deployer's secret key
#
# Outputs:
#   CONTRACT_ID printed to stdout and saved to .contract-id-testnet
# ============================================================

set -euo pipefail

# ── Network configuration ────────────────────────────────────
NETWORK="testnet"
RPC_URL="https://soroban-testnet.stellar.org"
NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
HORIZON_URL="https://horizon-testnet.stellar.org"

# ── Resolve deployer identity ────────────────────────────────
DEPLOYER_SECRET="${STELLAR_SECRET_KEY:-}"
if [[ -z "$DEPLOYER_SECRET" ]]; then
  echo "❌  ERROR: STELLAR_SECRET_KEY environment variable is required." >&2
  echo "    Export it before running this script:" >&2
  echo "    export STELLAR_SECRET_KEY=S..." >&2
  exit 1
fi

# ── Resolve optional admin address ──────────────────────────
ADMIN_ADDRESS="${STELLAR_ADMIN_ADDRESS:-}"

# ── Paths ────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WASM_PATH="$SCRIPT_DIR/../../target/wasm32-unknown-unknown/release/clips_nft_contract.wasm"
CONTRACT_ID_FILE="$SCRIPT_DIR/.contract-id-testnet"

echo "╔══════════════════════════════════════════════════════╗"
echo "║  ClipCash NFT — Soroban Testnet Deployment           ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "  Network    : $NETWORK"
echo "  RPC URL    : $RPC_URL"
echo "  WASM path  : $WASM_PATH"
echo ""

# ── Step 1: Build the contract ───────────────────────────────
echo "▶  Building contract (release)..."
pushd "$SCRIPT_DIR" > /dev/null
cargo build --target wasm32-unknown-unknown --release 2>&1 | grep -E "(Compiling|Finished|error)" || true
popd > /dev/null

if [[ ! -f "$WASM_PATH" ]]; then
  echo "❌  Build failed — WASM not found at: $WASM_PATH" >&2
  exit 1
fi

WASM_SIZE=$(du -h "$WASM_PATH" | cut -f1)
echo "   WASM built successfully (size: $WASM_SIZE)"
echo ""

# ── Step 2: Fund deployer account via Friendbot (testnet only) ─
echo "▶  Requesting testnet XLM from Friendbot..."
DEPLOYER_PUBLIC=$(stellar keys address "$DEPLOYER_SECRET" 2>/dev/null || \
  node -e "
    const StellarSdk = require('@stellar/stellar-sdk');
    const kp = StellarSdk.Keypair.fromSecret('$DEPLOYER_SECRET');
    console.log(kp.publicKey());
  " 2>/dev/null || echo "")

if [[ -n "$DEPLOYER_PUBLIC" ]]; then
  curl -sf "https://friendbot.stellar.org?addr=${DEPLOYER_PUBLIC}" > /dev/null && \
    echo "   Friendbot funded: $DEPLOYER_PUBLIC" || \
    echo "   ⚠  Friendbot request failed (account may already be funded)"
else
  echo "   ⚠  Could not resolve public key; skipping Friendbot."
fi
echo ""

# ── Step 3: Deploy (upload + create) ────────────────────────
echo "▶  Deploying contract to $NETWORK..."
CONTRACT_ID=$(stellar contract deploy \
  --wasm "$WASM_PATH" \
  --source-account "$DEPLOYER_SECRET" \
  --network "$NETWORK" \
  --rpc-url "$RPC_URL" \
  --network-passphrase "$NETWORK_PASSPHRASE" \
  2>&1 | tail -n 1)

if [[ -z "$CONTRACT_ID" ]]; then
  echo "❌  Deployment failed — no contract ID returned." >&2
  exit 1
fi

echo "   ✅  Contract deployed!"
echo ""

# ── Step 4: Initialize contract ──────────────────────────────
INIT_ADMIN="${ADMIN_ADDRESS:-$DEPLOYER_PUBLIC}"
if [[ -n "$INIT_ADMIN" ]]; then
  echo "▶  Initializing contract with admin: $INIT_ADMIN..."
  stellar contract invoke \
    --id "$CONTRACT_ID" \
    --source-account "$DEPLOYER_SECRET" \
    --network "$NETWORK" \
    --rpc-url "$RPC_URL" \
    --network-passphrase "$NETWORK_PASSPHRASE" \
    -- initialize \
    --admin "$INIT_ADMIN" && echo "   ✅  Contract initialized." || \
    echo "   ⚠  Initialization failed (contract may already be initialized)."
  echo ""
fi

# ── Step 5: Output ────────────────────────────────────────────
echo "════════════════════════════════════════════════════════"
echo "  CONTRACT_ID : $CONTRACT_ID"
echo "════════════════════════════════════════════════════════"
echo ""

# Save contract ID to file
echo "$CONTRACT_ID" > "$CONTRACT_ID_FILE"
echo "   Contract ID saved to: $CONTRACT_ID_FILE"
echo ""
echo "  Next steps:"
echo "    1. Copy the CONTRACT_ID into your .env:"
echo "       SOROBAN_NFT_CONTRACT_ID=$CONTRACT_ID"
echo "       STELLAR_NETWORK=testnet"
echo "    2. Or run ./deploy.sh to auto-select by STELLAR_NETWORK env."
echo ""
echo "  Explorer: https://stellar.expert/explorer/testnet/contract/$CONTRACT_ID"
