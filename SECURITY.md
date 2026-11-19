# Security Policy

## Reporting a Vulnerability
Please report vulnerabilities privately via GitHub Security Advisories on this
repository. Do not open public issues for security problems.

## Soroban NFT Contract — Pre-Mainnet Security Review

Scope: `contracts/nft-contract` and backend endpoints that interact with it
(`src/nft`, `src/stellar`).

### Findings and resolutions

| # | Area | Finding | Resolution |
|---|------|---------|------------|
| 1 | Access control | `initialize` did not require the admin's auth, allowing front-run initialization with an attacker-chosen admin. | `admin.require_auth()` added. |
| 2 | Approvals | `transfer` did not clear an existing approval; a previously approved spender could pull the token from the new owner. | Approval revoked on every transfer (`transfer` and `transfer_from`). |
| 3 | Arithmetic | `total_supply` increment used unchecked `+ 1`. | `checked_add` + `overflow-checks = true` in release profile. |
| 4 | Metadata | `mint` accepted empty `clip_id` / `content_uri` and unbounded URI length. | Rejected with `InvalidMetadata` (max URI 512 bytes). |
| 5 | NFT state | Self-transfers (`from == to`) were accepted, emitting misleading events. | Rejected with `InvalidRecipient`. |

### Review checklist

- **Access control**: admin/backend signer required for `mint` and `set_default_royalty_bps`; owner auth for `transfer`/`approve`; spender auth + approval check for `transfer_from`. ✔
- **Arithmetic**: royalty BPS bounded to 0–10 000 (`InvalidRoyaltyBps`); supply increment checked; release builds compiled with `overflow-checks = true`. ✔
- **NFT state**: double mint prevented (`InvalidTokenId`); soulbound tokens cannot be transferred or approved; approvals revoked on transfer. ✔
- **Signature security / replay**: Soroban `require_auth` provides nonce-based replay protection and signature-expiration ledger per authorization entry; the contract keeps no custom signature scheme. Backend-signed transactions use a 60 s time bound. ✔
- **Debug code**: no `log!`/`println!` in contract sources; test module is `#[cfg(test)]` only; `testutils` feature is dev-only. ✔
- **Swagger**: all NFT endpoints (`/nft/mint`, `/nft/prepare-mint`, `/nft/confirm-mint`, `/nft/verify-ownership`, `/nft/{clipId}/metadata`, `/nft/{mintAddress}/royalty`, `/nft/batch-royalty`) carry Swagger docs.

### Known limitations

- **No pause / emergency stop, timelock, freeze, or burn** functions exist in the current contract; these checklist items are not applicable until implemented. Consider adding an admin-only `pause` with reason before mainnet if operationally required.
- **No admin rotation**: the admin address is fixed at initialization; key compromise requires redeployment.
- **No metadata refresh** entry point; metadata is immutable after mint.
- **Storage TTL**: persistent entries are not explicitly extended; long-lived tokens need a TTL bump job to avoid archival.
- Royalty is stored as a default BPS only; payout enforcement happens off-chain in the backend.

### Deployment checklist

1. Build with `cargo build --release --target wasm32-unknown-unknown` (release profile: `overflow-checks`, `panic = "abort"`, symbols stripped).
2. Run `cargo test` in `contracts/nft-contract`.
3. Deploy, then call `initialize` from the production admin (backend signer) account.
4. Set `NFT_CONTRACT_ID`, `STELLAR_NETWORK=PUBLIC` and the mainnet RPC URL in backend config.
5. Verify `get_default_royalty_bps` and a test mint on testnet before mainnet.
