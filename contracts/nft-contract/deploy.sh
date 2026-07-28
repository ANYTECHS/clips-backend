#!/usr/bin/env bash
# ============================================================
# deploy.sh — Environment-driven Soroban deployment selector
#
# Reads STELLAR_NETWORK from the environment (or .env file) and
# delegates to the appropriate network-specific script.
#
# Usage:
#   export STELLAR_NETWORK=testnet   # or "public" for mainnet
#   export STELLAR_SECRET_KEY=S...
#   chmod +x deploy.sh
#   ./deploy.sh
#
# For mainnet you must also set:
#   export MAINNET_DEPLOY_CONFIRMED=yes
#
# Optional:
#   export STELLAR_ADMIN_ADDRESS=G...   # defaults to deployer public key
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Load .env if present ─────────────────────────────────────
if [[ -f "$SCRIPT_DIR/../../.env" ]]; then
  # shellcheck disable=SC1090
  set -a
  source "$SCRIPT_DIR/../../.env"
  set +a
  echo "   Loaded environment from .env"
fi

# ── Determine target network ─────────────────────────────────
NETWORK="${STELLAR_NETWORK:-testnet}"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  ClipCash NFT — Soroban Deployment Router            ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "  STELLAR_NETWORK = $NETWORK"
echo ""

case "$NETWORK" in
  testnet)
    echo "  → Routing to testnet deployment script..."
    echo ""
    exec "$SCRIPT_DIR/deploy-testnet.sh"
    ;;
  public|mainnet)
    echo "  → Routing to mainnet deployment script..."
    echo ""
    exec "$SCRIPT_DIR/deploy-mainnet.sh"
    ;;
  *)
    echo "❌  ERROR: Unsupported STELLAR_NETWORK value: '$NETWORK'" >&2
    echo "    Valid values: 'testnet' | 'public'" >&2
    exit 1
    ;;
esac
