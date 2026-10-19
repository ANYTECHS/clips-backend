#!/usr/bin/env bash
set -euo pipefail
umask 077

required=(
  CURRENT_VERSION
  TARGET_VERSION
  SOURCE_CONTRACT_ID
  TARGET_WASM
  SOROBAN_UPGRADE_DRIVER
  UPGRADE_ARTIFACT_DIR
)

for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    printf 'Required environment variable is missing: %s\n' "$name" >&2
    exit 2
  fi
done

network="${STELLAR_NETWORK:-testnet}"
if [[ "$network" != "testnet" && "$network" != "public" ]]; then
  printf 'Unsupported Stellar network: %s\n' "$network" >&2
  exit 2
fi
if [[ "$network" == "public" && "${ALLOW_MAINNET_UPGRADE:-false}" != "true" ]]; then
  printf 'Refusing mainnet. Set ALLOW_MAINNET_UPGRADE=true only after an approved testnet run.\n' >&2
  exit 2
fi

if [[ "$CURRENT_VERSION" == "$TARGET_VERSION" ]]; then
  printf 'Current and target versions must differ.\n' >&2
  exit 2
fi

if [[ ! -x "$SOROBAN_UPGRADE_DRIVER" ]]; then
  printf 'Upgrade driver must be an executable contract-specific adapter: %s\n' "$SOROBAN_UPGRADE_DRIVER" >&2
  exit 2
fi

if [[ ! -s "$TARGET_WASM" ]]; then
  printf 'Target WASM does not exist or is empty: %s\n' "$TARGET_WASM" >&2
  exit 2
fi

mkdir -p "$UPGRADE_ARTIFACT_DIR"
snapshot="$UPGRADE_ARTIFACT_DIR/source-state.json"
deployment="$UPGRADE_ARTIFACT_DIR/deployment.json"
report="$UPGRADE_ARTIFACT_DIR/verification.json"

printf 'Exporting %s from %s on %s...\n' "$CURRENT_VERSION" "$SOURCE_CONTRACT_ID" "$network"
"$SOROBAN_UPGRADE_DRIVER" export \
  --network "$network" \
  --contract-id "$SOURCE_CONTRACT_ID" \
  --expected-version "$CURRENT_VERSION" \
  --output "$snapshot"

node -e '
  const fs = require("node:fs");
  const snapshot = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const expected = process.argv[2];
  const network = process.argv[3];
  const groups = ["tokens", "ownership", "metadata", "royalties", "configuration"];
  if (snapshot.version !== expected || snapshot.network !== network) {
    throw new Error("Exported snapshot version or network does not match the requested source");
  }
  if (!snapshot.contractId) {
    throw new Error("Exported snapshot is missing its source contract ID");
  }
  if (!/^[a-f0-9]{64}$/i.test(snapshot.sha256 || "")) {
    throw new Error("Snapshot must include a SHA-256 digest");
  }
  for (const group of groups) {
    if (!Number.isSafeInteger(snapshot.counts?.[group]) || snapshot.counts[group] < 0) {
      throw new Error(`Snapshot is missing a valid ${group} record count`);
    }
  }
' "$snapshot" "$CURRENT_VERSION" "$network"

printf 'Deploying target WASM for version %s...\n' "$TARGET_VERSION"
"$SOROBAN_UPGRADE_DRIVER" deploy \
  --network "$network" \
  --wasm "$TARGET_WASM" \
  --expected-version "$TARGET_VERSION" \
  --output "$deployment"

printf 'Migrating exported state to the isolated target contract...\n'
"$SOROBAN_UPGRADE_DRIVER" migrate \
  --network "$network" \
  --source-contract-id "$SOURCE_CONTRACT_ID" \
  --deployment "$deployment" \
  --snapshot "$snapshot"

printf 'Verifying migrated ownership, metadata, royalties, and configuration...\n'
"$SOROBAN_UPGRADE_DRIVER" verify \
  --network "$network" \
  --source-contract-id "$SOURCE_CONTRACT_ID" \
  --expected-version "$TARGET_VERSION" \
  --deployment "$deployment" \
  --snapshot "$snapshot" \
  --output "$report"

node -e '
  const fs = require("node:fs");
  const source = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const deployment = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  const report = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
  const expectedVersion = process.argv[4];
  const network = process.argv[5];
  if (!deployment.contractId || deployment.contractId === source.contractId ||
      deployment.version !== expectedVersion || deployment.network !== network) {
    throw new Error("Deployment version or network does not match the requested target");
  }
  if (report.status !== "verified" || report.version !== expectedVersion || report.network !== network) {
    throw new Error("Migration verification did not report a verified target");
  }
  for (const group of ["tokens", "ownership", "metadata", "royalties", "configuration"]) {
    if (report.counts?.[group] !== source.counts?.[group]) {
      throw new Error(`Migrated ${group} count does not match the source snapshot`);
    }
  }
  if (report.sourceSha256 !== source.sha256 || report.targetSha256 !== source.sha256) {
    throw new Error("Target state digest does not exactly match the exported source snapshot");
  }
' "$snapshot" "$deployment" "$report" "$TARGET_VERSION" "$network"

printf 'Migration verified. Source remains authoritative; review %s before switching application configuration.\n' "$UPGRADE_ARTIFACT_DIR"