# Soroban Gas / Resource Cost Benchmarks

Living document tracking resource usage of the `nft-royalty` contract
(`contracts/nft-royalty`). Update it after every contract optimization or SDK bump.

| Field | Value |
|---|---|
| Benchmark date | 2026-11-19 (template created; measurements pending first run) |
| Contract version | `nft-royalty-contract` 0.1.0 |
| soroban-sdk | 21.0.0 |
| Build profile | `release` (`opt-level = "z"`, LTO, stripped) |
| Network | Stellar **Testnet** (`Test SDF Network ; September 2015`) via `https://soroban-testnet.stellar.org` |
| Tooling | `stellar-cli` (`stellar contract invoke --sim-only` / `--cost`) |

## Methodology

1. Build: `cd contracts/nft-royalty && stellar contract build` (or `cargo build --target wasm32-unknown-unknown --release`).
2. Deploy a fresh instance to testnet and call `initialize(admin)`.
3. Seed state: mint tokens 1–100 with a 10% royalty; deposit 1 XLM of royalty escrow on token 1.
4. For each operation, run a simulation and record the resource footprint reported by RPC
   `simulateTransaction` (`cpuInsns`, `memBytes`, ledger read/write entries & bytes) plus the
   `minResourceFee` in stroops:
   ```bash
   stellar contract invoke --id $CONTRACT --source bench --network testnet --sim-only -- <fn> <args>
   ```
5. Run each operation 5 times on a warm state and record the **median**.
6. Local cross-check (no network): `env.budget().reset_default(); ...; env.budget().print()` in a unit test
   gives host CPU/memory for the same call.

All instance-storage reads/writes scale with the total contract instance size, so measurements
are taken with the 100-token seed state described above.

## Current measurements (Testnet)

> Values below must be filled from a real run following the methodology. Do not copy them
> from estimates.

| Operation | Function | CPU insns | Mem bytes | Read entries | Write entries | Min resource fee (stroops) |
|---|---|---|---|---|---|---|
| Mint | `mint` | TBD | TBD | TBD | TBD | TBD |
| Transfer | `transfer` | TBD | TBD | TBD | TBD | TBD |
| Burn (no refund) | `burn(.., false)` | TBD | TBD | TBD | TBD | TBD |
| Burn + royalty refund | `burn(.., true)` | TBD | TBD | TBD | TBD | TBD |
| Royalty claim / payment | `execute_royalty_payment` | TBD | TBD | TBD | TBD | TBD |
| Metadata refresh | `token_uri` (read) | TBD | TBD | TBD | TBD | TBD |
| Freeze (pause) | `pause(Some(reason))` | TBD | TBD | TBD | TBD | TBD |
| Unfreeze (unpause) | `unpause` | TBD | TBD | TBD | TBD | TBD |
| Collection query | `total_supply` / `balance_of` | TBD | TBD | TBD | TBD | TBD |
| Collection query (batch 50) | `batch_royalty_info` | TBD | TBD | TBD | TBD | TBD |

## Testnet vs production expectations

- **Testnet numbers are indicative only.** Mainnet resource fees depend on network fee settings
  (per-instruction and per-byte rates) and inclusion fee surge pricing, which differ from testnet.
- Production fee = resource fee (from simulation) + inclusion fee. Budget the inclusion fee
  separately; during congestion it can dominate.
- All token state currently lives in **instance storage**; as the collection grows, every call pays
  to load the full instance. Expect production costs for large collections to exceed the
  100-token benchmark. Migrating per-token keys to persistent storage is the main planned optimization.
- Persistent/instance entries require TTL extension (rent) in production; that cost is not included above.

## Changelog

| Date | Change | Notes |
|---|---|---|
| 2026-11-19 | Initial document; added pause-with-reason, burn with royalty refund, standard NFT interface functions | Measurements pending first testnet run |
