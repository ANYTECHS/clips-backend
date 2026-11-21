# Soroban Contract Upgrade Procedure

## Overview

The backend exposes read-only deployment status at `GET /soroban/contract/info` and `GET /soroban/contract/version`, both documented in Swagger under the `soroban` tag. `info` returns the contract name, symbol, version, owner and platform fee from `contract_info()`; `version` returns the contract ID and the on-chain `version()` string.

The contract source is in `contracts/`. There are two upgrade paths:

| Path | Use it when | Tooling |
| --- | --- | --- |
| **In place** (preferred) | The new code can read the existing storage, directly or after `migrate` | `scripts/soroban-upgrade-inplace.sh` |
| **New contract** | The storage layout changes in a way that cannot be migrated in place | `scripts/soroban-upgrade.sh` plus an adapter you provide (below) |

## In-Place Upgrade

The contract address, and therefore `SOROBAN_NFT_CONTRACT_ID`, does not change, and every stored value stays where it is: token ownership and metadata, royalty recipients and balances, the royalty asset, and the owner and royalty configuration. The contract's owner-only `upgrade(new_wasm_hash)` swaps the WASM; owner-only `migrate()` then brings stored data to the schema the new code expects. `migrate` is idempotent and never rewrites existing entries: a second call returns `AlreadyMigrated` (error 12).

Prerequisites: the Stellar CLI, an identity for the contract owner in your own key store (`SOURCE_ACCOUNT`), the built target WASM, and the hash of the WASM that is installed now (`PREVIOUS_WASM_HASH`, needed for rollback; record it before you start).

```bash
STELLAR_NETWORK=testnet \
CONTRACT_ID=YOUR_TESTNET_CONTRACT_ID \
SOURCE_ACCOUNT=owner-identity \
TARGET_WASM=contracts/target/wasm32-unknown-unknown/release/clip_cash_nft.wasm \
EXPECTED_VERSION=0.2.0 \
PREVIOUS_WASM_HASH=hash-of-the-wasm-installed-now \
SAMPLE_TOKEN_IDS="1 2 3" \
UPGRADE_ARTIFACT_DIR=secure-artifacts/upgrade-0.2.0 \
bash scripts/soroban-upgrade-inplace.sh upgrade
```

The script:

1. Records `get_owner`, both royalty rates, `get_royalty_asset`, `total_supply`, and `owner_of`/`token_uri` for each `SAMPLE_TOKEN_IDS` entry to `pre-upgrade.state`. Values the old code cannot read (for example `total_supply` on schema 1) are recorded as `unavailable` and skipped in the comparison.
2. Uploads the WASM and, if `EXPECTED_WASM_HASH` is set, checks the hash.
3. Calls `upgrade`, then `migrate`.
4. Records the same values to `post-upgrade.state` and exits non-zero if any readable value changed, or if `version()` is not `EXPECTED_VERSION`.

Run it on testnet with the exact WASM intended for production before touching mainnet. Mainnet needs `ALLOW_MAINNET_UPGRADE=true`. Before the production run, pause minting and transfers in your application, take a snapshot, and keep a maintenance window. After it succeeds, confirm `GET /soroban/contract/info` and `GET /soroban/contract/version`, spot-check a few tokens against RPC reads, and reopen writes.

### Rollback

If the script fails after `upgrade`, or you find a problem later, re-install the previous code at the same address:

```bash
STELLAR_NETWORK=testnet CONTRACT_ID=... SOURCE_ACCOUNT=owner-identity \
PREVIOUS_WASM_HASH=hash-of-the-previous-wasm \
bash scripts/soroban-upgrade-inplace.sh rollback
```

Rollback restores code, not data. It is safe only if the old code can read everything the new code wrote. The schema 1 to 2 `migrate` only adds the token counters and the schema marker, so reverting that step is safe; any later migration that rewrites or removes entries must ship with a tested reverse migration, or be shown backward compatible, before you use an in-place upgrade. After a rollback, check `version()` and the sample owners, metadata and royalties against `pre-upgrade.state` before reopening writes. If the owner key is lost, no upgrade or rollback is possible.

## New-Contract Migration: Required Adapter

Use this path only when an in-place upgrade is not possible. `scripts/soroban-upgrade.sh` is an orchestrator, not a substitute for a contract-specific adapter: it refuses to run without one and does not change `SOROBAN_NFT_CONTRACT_ID`. This repository does not include an adapter for it.

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

## Rollback and Recovery (New-Contract Migration)

For a new-contract migration, the source contract remains authoritative throughout this script. If export, deployment, import, or verification fails, do not change `SOROBAN_NFT_CONTRACT_ID`; preserve all artifacts, discard or quarantine the unverified target, and repair/re-run from the unchanged source. If the application was switched after approval, restore the previous contract ID and verify the old contract’s version and sample owners/metadata/royalties before reopening writes.

For an in-place upgrade, see Rollback under In-Place Upgrade above.

## Testnet Status

No testnet upgrade has been run from this workspace: it has no funded owner identity or deployed testnet contract. The in-place script has only been written, not exercised, and the contract and script changes were not built or tested here. Treat the first testnet run as the real test, and do not report an upgrade as verified until `post-upgrade.state` has been reviewed.
