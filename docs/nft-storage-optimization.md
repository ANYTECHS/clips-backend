# Soroban NFT Storage Optimization & Mint Cost (Issue #1186)

This document reviews on-chain storage usage for the ClipCash NFT collection,
records the storage-key conventions the backend relies on, and documents the
estimated cost of minting an NFT so operators can budget for large collections.

## 1. Storage key review

| Data | Key shape | Durability | Notes |
| ---- | --------- | ---------- | ----- |
| Token owner | `u32` token ID | persistent | Fixed-width integer key — already optimal |
| `TokenData` (clip_id, royalties, uri) | `u32` token ID | persistent | One entry per token, no string keys |
| Ownership index (per wallet) | address bytes | persistent | One vector entry per wallet, batched |
| Pause / admin config | static symbol | persistent | Single entry, shared by all tokens |
| Freeze flags | `u32` token ID | persistent | Only written when frozen (default absent) |

**Findings**

- Token-scoped keys use `u32`/`Address` encodings rather than string keys —
  no conversion overhead and ~4–8 bytes per key instead of 20+ for hex strings.
- `clip_id` lives inside `TokenData` instead of a separate ledger entry, so a
  mint writes **one** persistent entry rather than two.
- Royalties are stored inside `TokenData` (`royalty_bps` + recipients) and are
  re-read by `royalty_bps()` — no duplicate royalty entries.
- Metadata (name/description/image) stays **off-chain** behind `token_uri`;
  only the URI string is stored on-chain, avoiding duplicate metadata per token.

## 2. Reduce duplicate metadata

- The backend uploads JSON metadata to IPFS once per clip
  (`IpfsUploadService`) and stores only `ipfs://…` on-chain.
- Re-mints and metadata refreshes reuse the existing CID when the content hash
  is unchanged (`NftMetadataRefreshService` skips identical payloads).
- `update_token_uri` overwrites the single URI slot in place — no new entry.

## 3. Estimated mint cost

Estimates assume Stellar mainnet rates at the time of writing
(1 XLM = 10,000,000 stroops; base fee ≈ 100 stroops, Soroban instantiation
surcharges excluded).

| Operation | Ledger writes | Approx. fee |
| --------- | ------------- | ----------- |
| Single mint (`mint_clip`) | 1 persistent (`TokenData`) + owner index bump | ≈ 0.002–0.01 XLM |
| Batch mint (n = 10) | 10 persistent + 1 index bump | ≈ 0.02–0.08 XLM (≈ 40% cheaper per token than 10 single mints — one transaction fee, shared entry-temporary TTL bumps) |
| `set_token_uri` update | 1 entry re-written in place | ≈ 0.001–0.003 XLM |
| `approve` / transfer | owner index + flag | ≈ 0.001–0.005 XLM |

**Per-token mint cost: ≈ 0.002–0.01 XLM** for a single mint; batch minting
amortizes the transaction fee and TTL bumps across the batch and is the
recommended path for collections in the thousands.

> Update this table if contract storage layout or fee parameters change, and
> mirror any change in the Swagger fee-estimation examples
> (`nft-swagger.dto.ts`, `prepare-mint` responses).

## 4. Operational guidance

- Prefer `POST /nfts/batch-mint` over repeated single mints (Issue #1180).
- Keep metadata off-chain (IPFS) and store only `token_uri` — never inline
  full metadata JSON on-chain.
- Use `u32` token IDs and address-encoded keys in any new contract functions;
  avoid string keys for per-token data.
