# Soroban NFT Contract — Security Audit Checklist

This document prepares the ClipCash Soroban NFT contract and its NestJS
backend for an external security audit. It reviews access control, overflow
protection, and pause logic, and documents every privileged function.

Scope: the on-chain Soroban NFT contract plus the backend endpoints that build
or simulate its transactions (`src/nft`, `src/blockchain`).

## 1. Access control review

Authorization is deny-by-default. Two guard layers protect privileged routes:

- `AdminGuard` (`src/common/guards/admin.guard.ts`) — validates the
  `x-admin-secret` header against `ADMIN_SECRET`.
- `NftFreezeAdminGuard` (`src/nft/guards/nft-freeze-admin.guard.ts`) — same
  header check, scoped to freeze operations.

Beyond the header, on-chain signer checks ensure only the contract owner or
admin wallet can successfully submit the returned XDR. The backend never holds
the signing key; it returns **unsigned XDR** for the operator to sign.

Findings:
- [x] Every admin route is guarded by `AdminGuard` or `NftFreezeAdminGuard`.
- [x] Mutating Soroban calls return unsigned XDR; keys stay client-side.
- [x] Owner-only on-chain operations (platform fee, default royalty) re-verified
      on-chain by signer identity.
- [ ] Confirm `ADMIN_SECRET` is sourced from a secrets manager in production,
      never committed or logged.

## 2. Overflow protection review

All token-amount arithmetic uses `BigInt` to avoid IEEE-754 precision loss:

- Royalty math (`floor(salePrice × royaltyBps / 10_000)`) is `BigInt`-based in
  `src/common/helpers/safe-math.helper.ts` and referenced by
  `clip-royalty.service.ts`, `royalty-query.dto.ts`, and
  `prepare-transfer.dto.ts`.
- On-chain numeric args are typed explicitly (`u32` token IDs, `u64`/`i128`
  amounts) via `nativeToScVal`, preventing implicit coercion.

Findings:
- [x] No floating-point arithmetic on stroop/token amounts.
- [x] Token IDs and amounts use fixed-width `u32`/`u64`/`i128` encodings.
- [ ] Fuzz royalty and transfer boundaries (max bps, zero, huge sale price).

## 3. Pause logic review

The contract supports a 24-hour timelocked pause (`src/blockchain/contract-pause.service.ts`):

1. Admin calls `POST /blockchain/pause` → `schedulePause()` records a schedule.
2. 24 hours must elapse before the pause is activatable.
3. The indexer activates only after observing an on-chain `Paused` event.
4. `POST /nfts/admin/unpause` restores minting/transfers.

Findings:
- [x] Pause activation is timelocked (24 h), not instant.
- [x] Activation requires an on-chain `Paused` event (no off-chain trust).
- [x] Admin-only for both pause and unpause.
- [ ] Verify a scheduled pause cannot be double-applied.

## 4. Privileged functions

| Endpoint | Guard | Effect |
| -------- | ----- | ------ |
| `POST /nfts/admin/pause` | `AdminGuard` | Prepare pause XDR |
| `POST /nfts/admin/unpause` | `AdminGuard` | Prepare unpause XDR |
| `POST /blockchain/pause` | `AdminGuard` | Schedule 24 h timelocked pause |
| `POST /blockchain/pause/cancel` | `AdminGuard` | Cancel a pending pause |
| `POST /nfts/admin/config/platform-fee` | `AdminGuard` | Set platform fee (owner-only on-chain) |
| `POST /nfts/admin/config/default-royalty` | `AdminGuard` | Set default royalty (owner-only on-chain) |
| `POST /nfts/admin/withdraw/initiate` | `AdminGuard` | Start 24 h XLM-withdraw timelock |
| `POST /nfts/admin/withdraw/execute` | `AdminGuard` | Execute `withdraw_xlm` after timelock |
| `POST /admin/nfts/:tokenId/freeze` | `NftFreezeAdminGuard` | Freeze a token |

None of these endpoints expose admin secrets in public API/Swagger responses.

## 5. Audit checklist

- [x] Access control documented and guard-enforced.
- [x] Overflow protection verified (BigInt + fixed-width types).
- [x] Pause logic timelocked and event-confirmed.
- [x] Privileged functions documented (table above).
- [x] No sensitive admin details in public docs.
- [ ] External reviewer sign-off on on-chain signer-identity checks.
