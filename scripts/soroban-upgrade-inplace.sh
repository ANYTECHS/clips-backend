#!/usr/bin/env bash
# In-place upgrade (and rollback) for the ClipCash NFT contract in contracts/.
#
#   scripts/soroban-upgrade-inplace.sh upgrade
#   scripts/soroban-upgrade-inplace.sh rollback
#
# `upgrade` records the contract's state, uploads the target WASM, calls the
# contract's owner-only `upgrade` and `migrate`, then re-reads the state and
# refuses to report success unless ownership, royalties and configuration are
# unchanged and `version()` is the expected one. `rollback` re-installs a
# previous WASM hash. The contract address never changes, so
# SOROBAN_NFT_CONTRACT_ID does not need to change either.
#
# Uses the Stellar CLI with an identity held in the operator's own key store;
# no secret is read from, or written to, this repository or the backend.
# See docs/soroban-upgrades.md for the full runbook.
set -euo pipefail
umask 077

mode="${1:-}"
if [[ "$mode" != "upgrade" && "$mode" != "rollback" ]]; then
  printf 'Usage: %s upgrade|rollback\n' "$0" >&2
  exit 2
fi

fail() { printf '%s\n' "$*" >&2; exit 1; }

required=(CONTRACT_ID SOURCE_ACCOUNT)
if [[ "$mode" == "upgrade" ]]; then
  required+=(TARGET_WASM EXPECTED_VERSION UPGRADE_ARTIFACT_DIR)
else
  required+=(PREVIOUS_WASM_HASH)
fi
for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    printf 'Required environment variable is missing: %s\n' "$name" >&2
    exit 2
  fi
done

network="${STELLAR_NETWORK:-testnet}"
if [[ "$network" != "testnet" && "$network" != "public" ]]; then
  fail "Unsupported Stellar network: $network"
fi
if [[ "$network" == "public" && "${ALLOW_MAINNET_UPGRADE:-false}" != "true" ]]; then
  fail "Refusing mainnet. Set ALLOW_MAINNET_UPGRADE=true only after an approved testnet run."
fi
if ! command -v stellar >/dev/null 2>&1; then
  fail "The Stellar CLI ('stellar') is required but was not found on PATH."
fi

invoke() {
  stellar contract invoke --id "$CONTRACT_ID" \
    --source-account "$SOURCE_ACCOUNT" --network "$network" -- "$@"
}

# Read one view function; prints the trimmed value, or "unavailable" when the
# deployed code does not have that function yet (e.g. total_supply on schema 1).
read_view() {
  local out
  if out="$(invoke "$@" 2>/dev/null)"; then
    printf '%s' "$out" | tr -d '\n'
  else
    printf 'unavailable'
  fi
}

# Write the state worth preserving as sorted key=value lines.
snapshot() {
  local file="$1" id
  {
    printf 'owner=%s\n' "$(read_view get_owner)"
    printf 'creator_royalty_bps=%s\n' "$(read_view get_creator_royalty_bps)"
    printf 'platform_royalty_bps=%s\n' "$(read_view get_platform_royalty_bps)"
    printf 'royalty_asset=%s\n' "$(read_view get_royalty_asset)"
    printf 'total_supply=%s\n' "$(read_view total_supply)"
    for id in ${SAMPLE_TOKEN_IDS:-}; do
      printf 'owner_of_%s=%s\n' "$id" "$(read_view owner_of --token_id "$id")"
      printf 'token_uri_%s=%s\n' "$id" "$(read_view token_uri --token_id "$id")"
    done
    printf 'version=%s\n' "$(read_view version)"
    printf 'schema_version=%s\n' "$(read_view schema_version)"
  } | sort > "$file"
}

if [[ "$mode" == "rollback" ]]; then
  if [[ ! "$PREVIOUS_WASM_HASH" =~ ^[0-9a-fA-F]{64}$ ]]; then
    fail "PREVIOUS_WASM_HASH must be a 64-character hex WASM hash."
  fi
  printf 'Re-installing WASM %s on %s (%s)...\n' "$PREVIOUS_WASM_HASH" "$CONTRACT_ID" "$network"
  invoke upgrade --new_wasm_hash "$PREVIOUS_WASM_HASH"
  printf 'Rolled back. Verify before reopening writes:\n'
  printf '  version=%s schema_version=%s\n' "$(read_view version)" "$(read_view schema_version)"
  printf 'Old code can only read state that new code wrote if the schema is backward compatible.\n'
  printf 'Check sample owners, metadata and royalties against the pre-upgrade snapshot.\n'
  exit 0
fi

# ---- upgrade -------------------------------------------------------------

[[ -s "$TARGET_WASM" ]] || fail "Target WASM does not exist or is empty: $TARGET_WASM"
mkdir -p "$UPGRADE_ARTIFACT_DIR"
pre="$UPGRADE_ARTIFACT_DIR/pre-upgrade.state"
post="$UPGRADE_ARTIFACT_DIR/post-upgrade.state"

printf 'Recording pre-upgrade state of %s on %s...\n' "$CONTRACT_ID" "$network"
snapshot "$pre"
if grep -q '^owner=unavailable$' "$pre"; then
  fail "Could not read get_owner from $CONTRACT_ID. Check CONTRACT_ID, the network and the CLI identity."
fi
if grep -q "^version=${EXPECTED_VERSION}$" "$pre"; then
  fail "Contract is already at version $EXPECTED_VERSION; nothing to upgrade."
fi
printf 'Pre-upgrade state saved to %s\n' "$pre"
if [[ -z "${PREVIOUS_WASM_HASH:-}" ]]; then
  printf 'WARNING: PREVIOUS_WASM_HASH is not set. Record the currently installed hash now; rollback needs it.\n' >&2
fi

printf 'Uploading %s...\n' "$TARGET_WASM"
new_hash="$(stellar contract upload --wasm "$TARGET_WASM" \
  --source-account "$SOURCE_ACCOUNT" --network "$network" | tail -n 1 | tr -d '[:space:]')"
if [[ ! "$new_hash" =~ ^[0-9a-fA-F]{64}$ ]]; then
  fail "Upload did not return a WASM hash (got: ${new_hash:-nothing})."
fi
printf '%s\n' "$new_hash" > "$UPGRADE_ARTIFACT_DIR/target-wasm.hash"
if [[ -n "${EXPECTED_WASM_HASH:-}" && "${EXPECTED_WASM_HASH,,}" != "${new_hash,,}" ]]; then
  fail "Uploaded WASM hash $new_hash does not match EXPECTED_WASM_HASH."
fi

printf 'Calling upgrade(%s)...\n' "$new_hash"
invoke upgrade --new_wasm_hash "$new_hash"

printf 'Calling migrate()...\n'
if ! migrate_out="$(invoke migrate 2>&1)"; then
  # Error #12 is AlreadyMigrated: the new code needed no data migration.
  if printf '%s' "$migrate_out" | grep -q '#12'; then
    printf 'Storage was already at the current schema.\n'
  else
    printf '%s\n' "$migrate_out" >&2
    printf 'migrate failed. The new WASM is installed. To restore the old code:\n' >&2
    printf '  PREVIOUS_WASM_HASH=<hash> CONTRACT_ID=%s SOURCE_ACCOUNT=%s %s rollback\n' "$CONTRACT_ID" "$SOURCE_ACCOUNT" "$0" >&2
    exit 1
  fi
fi

printf 'Recording post-upgrade state...\n'
snapshot "$post"

problems=0
# These must be identical before and after. Values the old code could not read
# ("unavailable" before) are skipped.
while IFS='=' read -r key value; do
  case "$key" in
    version|schema_version) continue ;;
  esac
  [[ "$value" == "unavailable" ]] && continue
  after="$(grep -m1 "^${key}=" "$post" | cut -d= -f2-)"
  if [[ "$after" != "$value" ]]; then
    printf 'MISMATCH %s: before=%s after=%s\n' "$key" "$value" "${after:-<missing>}" >&2
    problems=1
  fi
done < "$pre"

if ! grep -q "^version=${EXPECTED_VERSION}$" "$post"; then
  printf 'MISMATCH version: expected %s, got %s\n' "$EXPECTED_VERSION" "$(grep -m1 '^version=' "$post" | cut -d= -f2-)" >&2
  problems=1
fi

if [[ "$problems" -ne 0 ]]; then
  printf 'Verification FAILED. Compare %s and %s, then roll back:\n' "$pre" "$post" >&2
  printf '  PREVIOUS_WASM_HASH=<hash> CONTRACT_ID=%s SOURCE_ACCOUNT=%s %s rollback\n' "$CONTRACT_ID" "$SOURCE_ACCOUNT" "$0" >&2
  exit 1
fi

printf 'Upgrade verified: ownership, royalties and configuration unchanged, version is %s.\n' "$EXPECTED_VERSION"
printf 'Confirm GET /soroban/contract/info and GET /soroban/contract/version, then reopen writes.\n'
