# Soroban Contract Upgrade Procedure

## Current Boundary

The backend exposes read-only deployment status at `GET /soroban/contract/info` and `GET /soroban/contract/version`. This repository does not contain the Soroban contract source/WASM or its export, import, upgrade, or migration entrypoints. The script below is therefore an orchestrator, not a substitute for the contract-specific migration adapter. It refuses to run without that adapter and does not change `SOROBAN_NFT_CONTRACT_ID`.

Both endpoints are documented in Swagger under the `soroban` tag. `info` returns the configured contract ID, RPC/network details, and explorer URL; `version` reads the deployed contract’s `version()` view.

## Required Adapter

Set `SOROBAN_UPGRADE_DRIVER` to an executable from the contract repository. It must implement these subcommands and must fail non-zero on any failed chain operation:

- `export --network --contract-id --expected-version --output`: read and export every token ID, current owner, metadata URI/content reference, per-token royalty recipients and basis points, and collection/admin/royalty configuration. Write JSON with `network`, `version`, `sha256`, and integer `counts` for `tokens`, `ownership`, `metadata`, `royalties`, and `configuration`.
- `deploy --network --wasm --expected-version --output`: upload and deploy the target contract, without making it the application’s active contract. Write JSON with the new `contractId`, `network`, and on-chain `version`.
- `migrate --network --source-contract-id --deployment --snapshot`: initialize the target and import the exported records, preserving token IDs and exact ownership, metadata, royalty splits, and configuration. Keep the source contract unchanged.
- `verify --network --source-contract-id --expected-version --deployment --snapshot --output`: independently read target state and compare records with the source snapshot. Write JSON with `status: "verified"`, `version`, `network`, record `counts`, `sourceSha256`, and `targetSha256`.

The adapter must use a testnet admin identity held in the operator’s Stellar CLI/key management, never a backend secret or checked-in key. Exported snapshots can contain sensitive operational data; store them encrypted with restricted access and retain the verification report for audit.

## Testnet Run

Build and audit the target WASM in the contract repository first. Then run:

```bash
STELLAR_NETWORK=testnet \
CURRENT_VERSION=1.1.0 \
TARGET_VERSION=1.2.0 \
SOURCE_CONTRACT_ID=YOUR_TESTNET_CONTRACT_ID \
TARGET_WASM=path/to/target.wasm \
SOROBAN_UPGRADE_DRIVER=path/to/upgrade-driver \
UPGRADE_ARTIFACT_DIR=secure-artifacts/upgrade-1.2.0 \
bash scripts/soroban-upgrade.sh
```

The script checks the exported source version/network and required record counts, deploys and migrates through the adapter, then requires matching record counts and a source digest in the verification report. The adapter’s target digest must be included for audit. Do not change the service’s contract ID until the report has been reviewed and the NFT owner, metadata, royalty, and configuration samples have been independently checked against RPC reads.

## Production Upgrade

Only repeat after a successful testnet run using the exact WASM hash intended for production, an approved maintenance window, and a verified production snapshot. Mainnet requires the explicit `ALLOW_MAINNET_UPGRADE=true` override. Keep the old contract and source snapshot available, pause mint/transfer entrypoints if supported, and update `SOROBAN_NFT_CONTRACT_ID` only after verification. Confirm `/soroban/contract/info` and `/soroban/contract/version` after deployment.

## Rollback and Recovery

For a new-contract migration, the source contract remains authoritative throughout this script. If export, deployment, import, or verification fails, do not change `SOROBAN_NFT_CONTRACT_ID`; preserve all artifacts, discard or quarantine the unverified target, and repair/re-run from the unchanged source. If the application was switched after approval, restore the previous contract ID and verify the old contract’s version and sample owners/metadata/royalties before reopening writes.

For an in-place WASM upgrade, contract storage remains at the same contract address, but reverting WASM is safe only if the old code can read any state written by the new schema. The contract team must provide and test a reverse migration or prove backward compatibility before using an in-place upgrade. Never assume deploying old WASM alone reverses storage mutations.

## Testnet Status

No testnet migration has been run from this backend workspace: it has no contract source/WASM, migration adapter, or configured operator signing identity. A real preservation test requires the contract repository’s adapter and a funded testnet admin identity; until then, the script intentionally fails closed rather than reporting a migration as tested.