# ClipCashNFT Smart Contract

A Rust-based Soroban smart contract for NFT minting, ownership management, and royalty distribution on the Stellar network.

## Overview

The ClipCashNFT contract enables:

- **NFT Minting** — Create NFTs tied to video clips with creator and platform ownership
- **Royalty Support** — Configurable creator and platform royalty basis points (bps)
- **Ownership Tracking** — Track NFT ownership and transfer history
- **Royalty Distribution** — Distribute and claim royalties on secondary sales
- **Contract Administration** — Owner-controlled configuration and upgrades

## Architecture

```
contracts/
├── Cargo.toml              # Rust package manifest
├── src/
│   ├── lib.rs             # Main contract implementation
│   ├── types.rs           # Data structures (NFTMetadata, RoyaltyInfo, etc.)
│   ├── storage.rs         # Persistent contract state management
│   └── error.rs           # Error types and handling
└── tests/                 # Integration tests (future)
```

## Building the Contract

### Prerequisites

- Rust 1.70+ with the `wasm32-unknown-unknown` target
- Soroban CLI 21.5.0+
- Stellar SDK dependencies

### Build Steps

```bash
# Add the WebAssembly target (if not already installed)
rustup target add wasm32-unknown-unknown

# Build the contract
cargo build --target wasm32-unknown-unknown --release

# Inspect the generated WASM binary
ls -lh target/wasm32-unknown-unknown/release/clip_cash_nft.wasm
```

The compiled WASM binary will be located at:
```
target/wasm32-unknown-unknown/release/clip_cash_nft.wasm
```

## Contract Functions

### Initialization

```rust
pub fn initialize(
    env: Env,
    owner: Address,
    creator_royalty_bps: u32,
    platform_royalty_bps: u32,
) -> Result<(), ContractError>
```

Initializes the contract with:
- **owner** — The admin address (typically the ClipCash platform contract)
- **creator_royalty_bps** — Creator's royalty percentage in basis points (0-10000)
- **platform_royalty_bps** — Platform's royalty percentage in basis points (0-10000)

**Requirements:**
- Can only be called once
- Sum of royalty bps must not exceed 10000 (100%)
- Each royalty bps must be ≤ 10000

**Events:**
- Emits `initialized` event with owner and royalty configuration

### Querying State

```rust
// Get the current owner
pub fn get_owner(env: Env) -> Address

// Get creator royalty percentage (basis points)
pub fn get_creator_royalty_bps(env: Env) -> u32

// Get platform royalty percentage (basis points)
pub fn get_platform_royalty_bps(env: Env) -> u32

// Return the contract name, symbol, version, owner, and platform fee (BPS)
pub fn contract_info(env: Env) -> ContractInfo
```

`ContractInfo` reports the platform royalty configuration as `platform_fee` in
basis points. The name and symbol are `ClipCash NFT` and `CLIP`; the version is
the Cargo package version.

### Tokens and supply

```rust
// Mint a token to `to` (owner only). IDs start at 1 and are never reused.
pub fn mint(env: Env, to: Address, creator: Address, uri: String) -> Result<u32, ContractError>

// Transfer (`from` must own the token and sign) and burn (owner signs)
pub fn transfer(env: Env, from: Address, to: Address, token_id: u32) -> Result<(), ContractError>
pub fn burn(env: Env, owner: Address, token_id: u32) -> Result<(), ContractError>

pub fn owner_of(env: Env, token_id: u32) -> Result<Address, ContractError>
pub fn token_uri(env: Env, token_id: u32) -> Result<String, ContractError>

// Minted minus burned. Transfers never change it.
pub fn total_supply(env: Env) -> u32

// One page of an owner's tokens. `limit` is clamped to 1..=100; `cursor` is a
// 0-based offset (0 for the first page, then each page's `next_cursor`).
pub fn get_user_tokens(env: Env, owner: Address, limit: u32, cursor: u32) -> UserTokensPage
```

`UserTokensPage` is `{ tokens: Vec<u32>, next_cursor: Option<u32>, total: u32 }`.
An owner with no tokens, or a cursor at or past the end, gets an empty page with
`next_cursor: None`.

Ownership is stored as a dense per-owner list (`OwnedCount`, `OwnedAt`,
`OwnedIndex`), so adding a token is three writes, removing one is a swap-remove,
and a page reads at most `limit` entries however large the holding is. Because
removal moves the last entry into the freed slot, the order changes when a token
is transferred away or burned; a cursor is only reliable while the owner's
holdings stay the same between calls.

The backend serves this at `GET /nfts/wallet/:address` (and
`GET /nfts/wallets/:address/nfts`) with `limit` and `cursor` query parameters,
and `total_supply` at `GET /nfts/supply`.

### Royalties

```rust
// Asset (token contract) royalties are paid and claimed in (owner only)
pub fn set_royalty_asset(env: Env, asset: Address) -> Result<(), ContractError>
pub fn get_royalty_asset(env: Env) -> Option<Address>

// Change who may claim a token's royalties (current recipient signs)
pub fn set_royalty_recipient(env: Env, token_id: u32, new_recipient: Address) -> Result<(), ContractError>

// Credit `amount` to a token's balance; the asset moves from `payer` into the contract
pub fn deposit_royalty(env: Env, payer: Address, token_id: u32, amount: i128) -> Result<(), ContractError>

// Read-only: what `recipient` could claim now (0 if not the token's recipient)
pub fn get_claimable_royalties(env: Env, token_id: u32, recipient: Address) -> i128

// Pay the token's accrued royalties to its stored recipient; returns the amount
pub fn claim_royalties(env: Env, token_id: u32) -> Result<i128, ContractError>
```

`claim_royalties` requires the signature of the token's stored royalty
recipient (the creator unless changed), so no one else can trigger or redirect
the payout. It resets the balance to zero before transferring, so a second call
returns `NoRoyaltiesToClaim` and pays nothing. A burned token's royalties stay
claimable. It emits `RoyaltyClaimed`.

### Versioning and upgrades

```rust
pub fn version(env: Env) -> String        // Cargo package version
pub fn schema_version(env: Env) -> u32    // 1 = skeleton, 2 = tokens and royalties
pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) -> Result<(), ContractError>  // owner only
pub fn migrate(env: Env) -> Result<u32, ContractError>                            // owner only
```

`upgrade` swaps the WASM at the same address, so all storage is kept. `migrate`
brings stored data to the current schema; it is idempotent (a second call
returns `AlreadyMigrated`) and changes no existing entry. Use
`scripts/soroban-upgrade-inplace.sh` and follow `docs/soroban-upgrades.md`.

### Admin Operations

```rust
// Update royalty configuration (owner only)
pub fn update_royalty_config(
    env: Env,
    creator_royalty_bps: u32,
    platform_royalty_bps: u32,
) -> Result<(), ContractError>

// Transfer ownership (owner only)
pub fn transfer_ownership(
    env: Env,
    new_owner: Address,
) -> Result<(), ContractError>
```

## Storage

The contract uses Soroban's persistent storage to store:

| Key | Type | Description |
|-----|------|-------------|
| `OWNER` | `Address` | The contract administrator |
| `CROYALTY` | `u32` | Creator royalty in basis points (0-10000) |
| `PROYALTY` | `u32` | Platform royalty in basis points (0-10000) |

Schema 2 adds these. Counters, the royalty asset and the schema version live in
instance storage; per-token and per-owner entries are persistent.

| Key | Type | Description |
|-----|------|-------------|
| `SchemaVersion` | `u32` | Layout version (instance) |
| `NextTokenId` | `u32` | Next ID to assign, starts at 1 (instance) |
| `TotalSupply` | `u32` | Minted minus burned (instance) |
| `RoyaltyAsset` | `Address` | Royalty payment asset (instance) |
| `TokenOwner(id)`, `TokenCreator(id)`, `TokenUri(id)` | `Address` / `Address` / `String` | Per-token data; owner and URI are removed on burn |
| `RoyaltyRecipient(id)`, `RoyaltyBalance(id)` | `Address` / `i128` | Who may claim and what is owed; kept after burn |
| `OwnedCount(owner)`, `OwnedAt(owner, i)`, `OwnedIndex(id)` | `u32` | The owner's dense token list |

All state is encrypted on-chain and scoped to the contract instance.

## Events

The contract emits the following events:

| Event | Data | When |
|-------|------|------|
| `initialized` | owner, creator_royalty_bps, platform_royalty_bps | Contract is initialized |
| `royalty_config_updated` | creator_royalty_bps, platform_royalty_bps | Royalty configuration changes |
| `ownership_transferred` | old_owner, new_owner | Ownership is transferred |
| `Mint` | topics `token_id`, `to`; value `uri` | A token is minted |
| `Transfer` | topics `token_id`, `from`, `to` | A token changes owner |
| `Burn` | topics `token_id`, `owner` | A token is burned |
| `RoyaltyPaid` | topics `token_id`, `payer`, `recipient`; value `(amount, asset)` | `deposit_royalty` credits a token |
| `RoyaltyClaimed` | topics `token_id`, `recipient`; value `(amount, asset)` | `claim_royalties` pays out |
| `RoyaltyUpdated` | topic `token_id`; value `(old_recipient, new_recipient)` | `set_royalty_recipient` |
| `ConfigurationUpdated` | topics `key`, `owner`; value the new value (`(from, to)` for `schema_version`) | `set_royalty_asset`, `upgrade` (`wasm_hash`), `migrate` (`schema_version`) |

Events are published to the Soroban event stream for indexing and monitoring.

## Deployment

### Testnet Deployment

```bash
# Set environment variables
export SOROBAN_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
export SOROBAN_RPC_HOST="https://soroban-testnet.stellar.org"

# Build the contract
cargo build --target wasm32-unknown-unknown --release

# Deploy using the Soroban CLI
soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/clip_cash_nft.wasm \
  --source <YOUR_PUBLIC_KEY>
```

### Mainnet Deployment

```bash
# Set environment variables
export SOROBAN_NETWORK_PASSPHRASE="Public Global Stellar Network ; September 2015"
export SOROBAN_RPC_HOST="https://soroban-rpc.stellar.org"

# Build the contract
cargo build --target wasm32-unknown-unknown --release

# Deploy using the Soroban CLI
soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/clip_cash_nft.wasm \
  --source <YOUR_PUBLIC_KEY>
```

After deployment, initialize the contract with the owner and royalty configuration.

## Error Handling

The contract returns the following errors:

| Error | Code | Description |
|-------|------|-------------|
| `NotInitialized` | 1 | Contract has not been initialized |
| `AlreadyInitialized` | 2 | Contract has already been initialized |
| `InvalidRoyaltyBps` | 3 | Royalty basis points exceeds 10000 (100%) |
| `RoyaltyExceedsCap` | 4 | Sum of royalties exceeds 10000 (100%) |
| `Unauthorized` | 5 | Caller is not authorized for this operation |
| `NotFound` | 6 | Requested entity not found |
| `AlreadyExists` | 7 | Entity already exists |
| `InsufficientBalance` | 8 | Insufficient balance for operation |
| `NoRoyaltiesToClaim` | 9 | Nothing is owed for the token (also a repeated claim) |
| `RoyaltyAssetNotSet` | 10 | `set_royalty_asset` has not been called |
| `InvalidAmount` | 11 | Amount is zero or negative |
| `AlreadyMigrated` | 12 | `migrate` called on storage that is already current |
| `Overflow` | 13 | A counter or balance overflowed |

## Testing

Integration tests will be implemented in `tests/integration_test.rs` using the Soroban SDK test utilities.

Test coverage includes:
- Contract initialization with various configurations
- Royalty configuration updates
- Ownership transfers
- Error cases (invalid parameters, unauthorized access, etc.)
- Event emission

### Run Tests

```bash
cargo test
```

## Security Considerations

1. **Initialization Guard** — Contract can only be initialized once
2. **Royalty Validation** — Royalty basis points are capped at 100% combined
3. **Owner Authentication** — Admin operations require owner signature
4. **Event Transparency** — All state changes emit events for on-chain auditing
5. **Persistent Storage Encryption** — State is encrypted by the Soroban runtime

## Future Enhancements

- [ ] NFT minting with metadata storage
- [ ] Secondary sale royalty distribution
- [ ] Burn mechanism for NFTs
- [ ] Batch operations for gas efficiency
- [ ] Integration with Stellar's standard token contract
- [ ] Timelock mechanism for critical upgrades
- [ ] Revenue sharing with liquidity providers

## References

- [Soroban Documentation](https://developers.stellar.org/docs/learn/soroban)
- [Stellar Developer Guide](https://developers.stellar.org/)
- [Soroban SDK](https://github.com/stellar/rs-soroban-sdk)
- [Stellar Testnet](https://testnet.stellar.org/)

## License

This contract is part of the ClipCash platform and is provided under the same license as the main repository.
