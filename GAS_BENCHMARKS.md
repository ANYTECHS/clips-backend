# Soroban Gas Benchmarks

**Document baseline date:** 2026-09-29  
**Last benchmark run:** None recorded  
**Status:** No verified on-chain resource or fee measurements are currently available.

This is the living record for the NFT contract's resource use and fees. Values must be identified as measured, estimated, or unavailable; application-side constants are not chain measurements.

## Current Baseline

The backend currently seeds the following values in memory from [`GasMetricsService`](src/nft/gas-metrics.service.ts), and records the same fixed values from [`NftService`](src/nft/nft.service.ts). They are synthetic application metrics: there is no recorded Soroban simulation, successful transaction, measurement date, contract version, or network associated with them. The `gasUnits` values are application-defined and must not be interpreted as Stellar fees.

| Operation | CPU instructions | Memory bytes | App `gasUnits` | Inclusion / resource fee | Evidence and environment |
|---|---:|---:|---:|---|---|
| Mint | 1,250,000 | 45,000 | 15,200 | Not measured | Synthetic in-memory seed; no network recorded |
| Transfer | 890,000 | 32,000 | 11,400 | Not measured | Synthetic in-memory seed; no network recorded |
| Burn | Not measured | Not measured | Not measured | Not measured | No benchmark data found |
| Royalty claim | Not measured | Not measured | Not measured | Not measured | No benchmark data found |
| Metadata refresh | Not measured | Not measured | Not measured | Not measured | No benchmark data found |
| Freeze / unfreeze | Not measured | Not measured | Not measured | Not measured | No benchmark data found; requires the updated contract deployment |
| Collection queries | Not measured | Not measured | Not measured | Not applicable for simulation-only reads | No benchmark data found |

**Network and environment used for this baseline:** none. The two figures above are code constants, not testnet or production results. No Soroban RPC simulation or transaction submission was performed for this document. The repository's documented test environment is Stellar Testnet (`STELLAR_NETWORK=testnet`, `https://soroban-testnet.stellar.org`); that is the target for the first real benchmark run, not the source of the values above.

## Methodology

Run benchmarks against a deployed contract on Stellar Testnet before using the results as a production estimate.

1. Record the benchmark date, network, RPC endpoint, ledger/protocol version, contract ID, contract version and WASM hash, SDK/CLI version, and the state/setup required for each operation. Never include keys or secrets in this document.
2. Use the same transaction construction and Soroban RPC path as the client operation. Simulate each invocation and record the RPC's CPU instruction count, memory bytes, ledger footprint/read-write entry counts and byte counts, and `minResourceFee` when present.
3. For writes, submit successful testnet transactions using disposable or uniquely prepared test data. Record the transaction hash and actual `feeCharged` from the RPC separately from the simulated resource fee and the inclusion fee. Do not use the transaction builder's configured base fee as the actual Soroban fee.
4. For collection queries, run simulation-only reads against a fixed contract and ledger state. Record simulation resource costs; mark charged transaction fees as not applicable because no transaction is submitted.
5. Collect at least 30 successful samples per operation after 5 warm-up runs. Report sample count, median, p95, minimum, and maximum. Keep operation inputs and state comparable between before/after runs.
6. Repeat the same procedure after contract or SDK optimizations. Add a dated result row and retain the previous baseline; do not overwrite historical measurements. Link the change or benchmark run when available.

Suggested Soroban RPC measurements are `cpuInsns`, `memBytes`, footprint entry/byte counts, `minResourceFee`, and (for successful submitted transactions) `feeCharged`. Record units exactly as returned or convert to stroops explicitly; do not mix XLM, stroops, and application-defined units.

## Production Expectations

All real measurements should first be taken on Testnet and labeled **testnet**. Testnet values are comparative engineering data, not production guarantees: production fees and resource availability can differ with network protocol, ledger state, fee market, footprint, and contract version. Do not label any value a production measurement unless it was collected from a production transaction under an approved process. Any production estimate must be a separately labeled estimate with its assumptions; this document currently contains none.

## Change Log

| Date | Change | Network | Result |
|---|---|---|---|
| 2026-09-29 | Initial document; audited existing backend metrics and recorded their provenance | None; no chain run | Two synthetic application seeds recorded above; verified on-chain benchmark count: zero |