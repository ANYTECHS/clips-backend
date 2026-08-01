#!/usr/bin/env bash
# ============================================================
# deploy-mainnet.sh — Deploy ClipCash NFT contract to Stellar Mainnet
#
# Usage:
#   chmod +x deploy-mainnet.sh
#   ./deploy-mainnet.sh
#
# Prerequisites:
#   - Rust toolchain with wasm32-unknown-unknown target
#   - stellar CLI (https://developers.stellar.org/docs/tools/developer-tools/cli/install)
#   - STELLAR_SECRET_KEY env var set to the deployer's secret key
#   - Sufficient XLM in the deployer account to cover contract deployment fees
#
# WARNING:
#   This deploys to STELLAR MAINNET (public network).
#   Real XLM will be consumed. Confirm before proceeding.
#
# Outputs:
#   CONTRACT_ID printed to stdout and saved to .contract-id-mainnet
# ============================================================

set -euo pipefail

# ── Network configuration ────────────────────────────────────
NETWORK="public"
RPC_URL="https://soroban-rpc.stellar.org"
NETWORK_PASSPHRASE="Public Global Stellar Network ; September 2015"
HORIZON_URL="https://horizon.stellar.org"

# ── Safety gate ──────────────────────────────────────────────
MAINNET_CONFIRMED="${MAINNET_DEPLOY_CONFIRMED:-}"
if [[ "$MAINNET_CONFIRMED" != "yes" ]]; then
  echo "╔══════════════════════════════════════════════════════╗"
  echo "║  ⚠   MAINNET DEPLOYMENT — REAL XLM REQUIRED  ⚠     ║"
  echo "╚══════════════════════════════════════════════════════╝"
  echo ""
  echo "  This script deploys to the Stellar PUBLIC network."
  echo "  Real XLM will be consumed. This action is irreversible."
  echo ""
  echo "  To proceed, set the confirmation variable:"
  echo "    export MAINNET_DEPLOY_CONFIRMED=yes"
  echo "  then re-run this script."
  echo ""
  exit 1
fi

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
CONTRACT_ID_FILE="$SCRIPT_DIR/.contract-id-mainnet"

echo "╔══════════════════════════════════════════════════════╗"
echo "║  ClipCash NFT — Soroban MAINNET Deployment           ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "  Network    : $NETWORK (PUBLIC)"
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

# ── Step 2: Resolve deployer public key ──────────────────────
DEPLOYER_PUBLIC=$(stellar keys address "$DEPLOYER_SECRET" 2>/dev/null || \
  node -e "
    const StellarSdk = require('@stellar/stellar-sdk');
    const kp = StellarSdk.Keypair.fromSecret('$DEPLOYER_SECRET');
    console.log(kp.publicKey());
  " 2>/dev/null || echo "")

if [[ -n "$DEPLOYER_PUBLIC" ]]; then
  echo "   Deployer account : $DEPLOYER_PUBLIC"

  # Check account balance via Horizon
  BALANCE=$(curl -sf "$HORIZON_URL/accounts/$DEPLOYER_PUBLIC" | \
    python3 -c "import sys, json; balances=json.load(sys.stdin)['balances']; print(next((b['balance'] for b in balances if b['asset_type']=='native'), '0'))" 2>/dev/null || echo "unknown")
  echo "   Account XLM balance: $BALANCE XLM"
fi
echo ""

# ── Step 3: Deploy (upload + create) ────────────────────────
echo "▶  Deploying contract to Stellar MAINNET..."
echo "   (This will consume real XLM for ledger entry fees)"
echo ""

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

# ── Step 3b: Query deployed contract version ─────────────────
DEPLOYED_VERSION=$(stellar contract invoke \
  --id "$CONTRACT_ID" \
  --source-account "$DEPLOYER_SECRET" \
  --network "$NETWORK" \
  --rpc-url "$RPC_URL" \
  --network-passphrase "$NETWORK_PASSPHRASE" \
  -- version 2>/dev/null | tr -d '"' || echo "unknown")
echo "   Contract version: $DEPLOYED_VERSION"
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
echo "  VERSION     : $DEPLOYED_VERSION"
echo "  NETWORK     : Stellar Mainnet (public)"
echo "════════════════════════════════════════════════════════"
echo ""

# Save contract ID to file
echo "$CONTRACT_ID" > "$CONTRACT_ID_FILE"
echo "   Contract ID saved to: $CONTRACT_ID_FILE"
echo ""
echo "  Update your production .env with:"
echo "    SOROBAN_NFT_CONTRACT_ID=$CONTRACT_ID"
echo "    STELLAR_NETWORK=public"
echo ""
echo "  Explorer: https://stellar.expert/explorer/public/contract/$CONTRACT_ID"
