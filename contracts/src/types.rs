use soroban_sdk::{contracterror, contracttype, Address, String};

/// Read-only summary of the deployed contract's public metadata.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ContractInfo {
    pub name: String,
    pub symbol: String,
    pub version: String,
    pub owner: Address,
    pub platform_fee: u32,
}

// ---------------------------------------------------------------------------
// Event payload types
//
// Every state-changing function emits a typed event. The contract name
// "ClipCashNFT" is always the first topic; the event name is the second
// topic (matching the SOROBAN_NFT_EVENT_TYPES list in the backend).
// The struct below is the event *value* (third topic / data body).
// ---------------------------------------------------------------------------

/// Emitted by `initialize()`.
/// Topic: ("ClipCashNFT", "Initialized")
#[contracttype]
#[derive(Clone, Debug)]
pub struct InitializedEvent {
    /// The initial contract owner.
    pub owner: Address,
    /// Creator royalty configured at init time (basis points).
    pub creator_royalty_bps: u32,
    /// Platform royalty configured at init time (basis points).
    pub platform_royalty_bps: u32,
}

/// Emitted by `mint()`.
/// Topic: ("ClipCashNFT", "Mint", token_id)
#[contracttype]
#[derive(Clone, Debug)]
pub struct MintEvent {
    /// On-chain token ID assigned to this NFT.
    pub token_id: u64,
    /// The wallet that will own the newly minted NFT.
    pub owner: Address,
    /// Off-chain clip identifier the NFT represents.
    pub clip_id: String,
    /// Metadata URI stored with the token at mint time.
    pub metadata_uri: String,
    /// Creator royalty for this token (basis points).
    pub creator_royalty_bps: u32,
}

/// Emitted by `transfer()` / `transfer_with_royalty()`.
/// Topic: ("ClipCashNFT", "Transfer", token_id)
#[contracttype]
#[derive(Clone, Debug)]
pub struct TransferEvent {
    pub token_id: u64,
    pub from: Address,
    pub to: Address,
    /// Sale price in stroops (0 when transferred without payment).
    pub sale_price: i128,
    /// Royalty amount paid in stroops.
    pub royalty_amount: i128,
}

/// Emitted by `burn()`.
/// Topic: ("ClipCashNFT", "Burn", token_id)
#[contracttype]
#[derive(Clone, Debug)]
pub struct BurnEvent {
    pub token_id: u64,
    /// Address that owned the NFT at burn time.
    pub owner: Address,
}

/// Emitted by `freeze()` and `unfreeze()`.
/// Topic: ("ClipCashNFT", "Frozen" | "Unfrozen", token_id)
#[contracttype]
#[derive(Clone, Debug)]
pub struct FreezeEvent {
    pub token_id: u64,
    /// Admin address that issued the freeze/unfreeze.
    pub admin: Address,
    pub frozen: bool,
}

/// Emitted by `claim_royalty()`.
/// Topic: ("ClipCashNFT", "RoyaltyClaimed", token_id)
#[contracttype]
#[derive(Clone, Debug)]
pub struct RoyaltyClaimedEvent {
    pub token_id: u64,
    /// Address that received the royalty payment.
    pub recipient: Address,
    /// Amount paid in stroops.
    pub amount: i128,
    /// Asset contract ID (empty string for native XLM).
    pub asset: String,
}

/// Emitted by `update_royalty_config()`.
/// Topic: ("ClipCashNFT", "RoyaltyUpdated")
#[contracttype]
#[derive(Clone, Debug)]
pub struct RoyaltyUpdatedEvent {
    /// Admin that changed the configuration.
    pub updated_by: Address,
    pub old_creator_bps: u32,
    pub new_creator_bps: u32,
    pub old_platform_bps: u32,
    pub new_platform_bps: u32,
}

/// Emitted by `refresh_metadata()` / `update_metadata_uri()`.
/// Topic: ("ClipCashNFT", "MetadataRefreshed", token_id)
#[contracttype]
#[derive(Clone, Debug)]
pub struct MetadataRefreshedEvent {
    pub token_id: u64,
    pub updated_by: Address,
    pub new_metadata_uri: String,
}

/// Emitted by `schedule_pause()`.
/// Topic: ("ClipCashNFT", "PauseScheduled")
#[contracttype]
#[derive(Clone, Debug)]
pub struct PauseScheduledEvent {
    pub requested_by: Address,
    /// Unix-second timestamp of the request.
    pub requested_at: u64,
    /// Unix-second timestamp after which `pause()` may be called (request + 24 h).
    pub scheduled_for: u64,
    pub reason: String,
}

/// Emitted by `pause()`.
/// Topic: ("ClipCashNFT", "Paused")
#[contracttype]
#[derive(Clone, Debug)]
pub struct PausedEvent {
    pub paused_by: Address,
    pub activated_at: u64,
}

/// Emitted by `unpause()`.
/// Topic: ("ClipCashNFT", "Unpaused")
#[contracttype]
#[derive(Clone, Debug)]
pub struct UnpausedEvent {
    pub unpaused_by: Address,
    pub unpaused_at: u64,
}

/// Emitted by `transfer_ownership()`.
/// Topic: ("ClipCashNFT", "OwnershipTransferred")
#[contracttype]
#[derive(Clone, Debug)]
pub struct OwnershipTransferredEvent {
    pub previous_owner: Address,
    pub new_owner: Address,
}

// ---------------------------------------------------------------------------
// Collection types
// ---------------------------------------------------------------------------

/// On-chain summary of a registered collection.
/// Returned by `get_collection_info(collection_id)`.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CollectionInfo {
    /// Slug identifier, e.g. "viral-clips".
    pub collection_id: String,
    /// Human-readable name stored at registration time.
    pub name: String,
    /// Arbitrary metadata string (e.g. JSON) set at registration time.
    pub metadata: String,
    /// Current minted supply for this collection.
    pub supply: u64,
}

/// Emitted by `register_collection()`.
/// Topic: ("ClipCashNFT", "CollectionRegistered")
#[contracttype]
#[derive(Clone, Debug)]
pub struct CollectionRegisteredEvent {
    pub collection_id: String,
    pub name: String,
    pub registered_by: Address,
}

/// Emitted by `mint()` — extends MintEvent with the collection the token belongs to.
/// The collection_id is included inside the existing MintEvent struct (see below).
/// This separate event is emitted for collection-level indexing.
/// Topic: ("ClipCashNFT", "CollectionMint", collection_id)
#[contracttype]
#[derive(Clone, Debug)]
pub struct CollectionMintEvent {
    pub collection_id: String,
    pub token_id: u64,
    pub owner: Address,
    /// New supply after this mint.
    pub new_supply: u64,
}

/// Emitted by `burn()` — collection supply decremented.
/// Topic: ("ClipCashNFT", "CollectionBurn", collection_id)
#[contracttype]
#[derive(Clone, Debug)]
pub struct CollectionBurnEvent {
    pub collection_id: String,
    pub token_id: u64,
    /// New supply after this burn.
    pub new_supply: u64,
}

/// Royalty information structure (read-only helper, not an event).
#[derive(Clone, Debug)]
pub struct RoyaltyInfo {
    pub creator: String,
    pub platform: String,
    pub creator_bps: u32,
    pub platform_bps: u32,
}

/// Legacy NFT metadata helper (read-only, not an event).
#[derive(Clone, Debug)]
pub struct NFTMetadata {
    pub uri: String,
    pub name: String,
    pub description: String,
    pub image_uri: String,
}
