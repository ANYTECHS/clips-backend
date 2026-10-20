# Soroban NFT Standards Compatibility

**Reviewed:** 2026-10-19  
**Scope:** Backend NFT calls, API metadata and Soroban SDK examples. The repository contains no Soroban contract source, generated contract spec, or deployed WASM artifact, so on-chain conformance cannot be certified from this workspace.

## Applicable Standards

| Standard | Relevance |
|---|---|
| [SEP-0050: Non-Fungible Tokens](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0050.md) | The applicable Soroban NFT interface. It is a draft and defines ownership, transfer, balance and approval calls. |
| SEP-0041: Token Interface | Fungible-token interface; it is not the NFT interface. |
| SEP-0039: Token Metadata | Metadata for Stellar assets; it does not define the generic `name`/`description`/`image`/`attributes` JSON schema used by ClipCash. |
| SEP-0010: Web Authentication | Wallet authentication flow, separate from NFT contract conformance. JWT authentication is not SEP-0010 verification. |
| CAP-54 and Soroban storage TTL guidance | Contract lifecycle and storage lifetime concern; not an NFT ABI. TTL extension is not inherently required on every API call. |
| ERC-2981 and marketplace metadata conventions | Cross-ecosystem royalty and JSON conventions only. They are not Stellar NFT standards and do not enforce royalty payment on Soroban. |

SEP-0050 core calls include `balance(owner)`, `owner_of(token_id)`, `transfer(from, to, token_id)`, `transfer_from(spender, from, to, token_id)`, `approve(approver, approved, token_id, live_until_ledger)`, `approve_for_all(owner, operator, live_until_ledger)`, `get_approved(token_id)`, and `is_approved_for_all(owner, operator)`. The interface uses unsigned token IDs and ledger-based approval expiry. Approving the owner address revokes a token approval; expiry `0` revokes an operator approval.

## Implementation Review

The backend reads `owner_of`, `get_approved`, and `is_approved_for_all`. Its approval transaction builders now use SEP-0050's expiry-ledger ABI: `approve` receives four arguments, and collection approval calls `approve_for_all` with a `u32` ledger instead of a boolean. `POST /nfts/tokens/:tokenId/approve` and `POST /nfts/approvals/operator` expose those shapes in Swagger.

The transfer service calls the custom `transfer_with_royalty` entry point. That may be a useful contract extension, but it is not the SEP-0050 `transfer` or `transfer_from` interface. The backend does not currently issue the SEP-0050 `balance(owner)` query. Collection `name` and `symbol`, token URI, mint/burn, and royalty functions are extensions, not SEP-0050 requirements.

ClipCash metadata includes fields such as `name`, `description`, `image`, `animation_url`, `attributes`, `external_url`, and royalty extensions. These are the application's off-chain JSON profile and common marketplace conventions; this review does not claim SEP-0039 defines those NFT JSON fields. Royalty BPS arithmetic and maps are backend/contract extensions inspired by ERC-2981 semantics, not SEP-0050 compliance.

## Compatibility Gaps

| Area | Finding | Status |
|---|---|---|
| Contract implementation | No contract source or generated spec is checked in; signatures, authorization, events, storage and error behavior cannot be checked against the deployed WASM. | Blocking verification |
| Token approvals | Previous API calls did not match SEP-0050 expiry signatures. Backend service and controller now build the SEP-0050 shapes. Deployment must provide these exact methods. | Addressed in backend |
| Collection approval query | `is_approved_for_all` is queried, but its behavior and expiry interpretation require contract-level testing. | Unverified |
| Balance query | No backend `balance(owner)` call/endpoint. | Unsupported |
| Transfers | Backend submits `transfer_with_royalty`, not core `transfer`/`transfer_from`; no SEP-0050 transfer compatibility claim is made. | Extension only |
| Metadata and token URI | Off-chain JSON conventions and URI access are ClipCash extensions, not SEP-0050 contract features. | Extension only |
| Royalties | No Stellar NFT royalty interface or universal enforcement standard is implemented here. | Extension only |

## Supported Features

- Backend builds SEP-0050-shaped `approve` and `approve_for_all` calls with `u32` expiry ledgers; owner-self approval and operator expiry `0` encode revocation.
- Backend queries `owner_of`, `get_approved`, and `is_approved_for_all`.
- ClipCash provides its own mint, burn, token URI, metadata, royalty, collection branding, and royalty-aware transfer extensions.
- Compatibility tests cover SDK XDR construction and approval builder arguments offline. They are not integration tests against a real contract and do not prove deployed compatibility.

## Unsupported / Unverified Features

- `balance(owner)` and direct SEP-0050 transfer/transfer_from API calls.
- On-chain SEP-0050 implementation conformance, including authorization rules, specified events, nonexistent-token behavior, and approved-operator transfer behavior.
- SEP-0010 wallet authentication on NFT API writes.
- SEP-0039 or generic marketplace metadata compliance; metadata publishing follows the ClipCash profile.
- ERC-2981-equivalent royalty discovery/enforcement across Stellar marketplaces.

Before claiming full compatibility, add the contract source or pin its generated spec/WASM hash and run contract tests for every SEP-0050 method, event, authorization path, and error case against the deployed interface.
