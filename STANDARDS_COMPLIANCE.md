# NFT Contract Standards Compliance

Review of `contracts/src` (`lib.rs` + `token.rs`) against applicable Stellar / Soroban NFT standards.

## Applicable standards

- **SEP-0050 (Non-Fungible Tokens)** — Stellar's NFT interface (`owner_of`, `balance_of`,
  `transfer`, `transfer_from`, `approve`, `get_approved`, `name`, `symbol`, `token_uri`).
- **OpenZeppelin Stellar `non_fungible` / ERC-721 conventions** — ecosystem reference implementation.
- **ERC-2981-style royalties** — royalty info query (`get_royalties`, `batch_royalty_info`).

## Gaps identified and changes made

| Gap | Change |
|---|---|
| No `balance_of` | Added per-owner balance tracking, updated on mint/transfer/burn |
| No approvals | Added `approve`, `get_approved`, `transfer_from` (approval cleared on transfer/burn) |
| No collection metadata | Added `name()` / `symbol()` |
| Mint could overwrite an existing token | `mint` now rejects existing token IDs |
| No burn | Added `burn` (with optional royalty refund) |
| No emergency stop | Added `pause(reason)`, `set_pause_reason`, `unpause`, `is_paused`, `pause_reason` (contract owner only) |

Compatibility tests: `test_burn_without_refund_and_standards` (balances, approvals, transfer_from, burn).

## Supported features

- Ownership: `owner_of`, `balance_of`, `total_supply`
- Transfers: `transfer`, `transfer_from`, single-token `approve` / `get_approved`
- Metadata: `name`, `symbol`, `token_uri`
- Royalties: per-token royalty on mint, royalty escrow (`deposit_royalty`, `unclaimed_royalty`)
- Burn with optional royalty refund (`Refunded` event)
- Admin pause with reason

## Unsupported features

- Operator approval for all tokens (`approve_for_all` / `is_approved_for_all`)
- Approval expiration ledgers (`live_until_ledger`)
- Token enumeration (`token_by_index`, `token_of_owner_by_index`)
- Standard event topic layout from SEP-0050 (events currently use string topics)
- Per-token metadata updates / base URI
- Persistent storage + TTL management per token (all state in instance storage)

## Backend / Swagger impact

- `POST /nfts/:id/burn`, `GET /soroban/pause`, `GET /soroban/pause/reason` (already on main) call `burn`, `is_paused` and `pause_reason`, which this contract now implements.
- Existing metadata, ownership, transfer, royalty and collection API responses are unchanged.
