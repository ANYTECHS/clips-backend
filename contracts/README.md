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
```

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

All state is encrypted on-chain and scoped to the contract instance.

## Events

The contract emits the following events:

| Event | Data | When |
|-------|------|------|
| `initialized` | owner, creator_royalty_bps, platform_royalty_bps | Contract is initialized |
| `royalty_config_updated` | creator_royalty_bps, platform_royalty_bps | Royalty configuration changes |
| `ownership_transferred` | old_owner, new_owner | Ownership is transferred |

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
