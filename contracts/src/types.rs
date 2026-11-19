use soroban_sdk::{contracttype, Address, String, Vec};

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

/// Storage keys for token, supply and royalty state (schema 2).
///
/// The schema-1 keys (`OWNER`, `CROYALTY`, `PROYALTY`) are plain symbols in
/// `storage.rs` and are left exactly as they were, so a deployed schema-1
/// contract keeps reading its configuration after an upgrade.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    /// Instance: schema version of the stored layout.
    SchemaVersion,
    /// Instance: next token ID to assign; starts at 1 and never decreases.
    NextTokenId,
    /// Instance: tokens currently in existence (minted minus burned).
    TotalSupply,
    /// Instance: SAC/token contract royalties are paid and claimed in.
    RoyaltyAsset,
    /// Persistent: current owner of a token. Removed on burn.
    TokenOwner(u32),
    /// Persistent: address credited as the token's creator.
    TokenCreator(u32),
    /// Persistent: metadata URI. Removed on burn.
    TokenUri(u32),
    /// Persistent: address allowed to claim the token's royalties. Kept after
    /// burn so accrued royalties can still be claimed.
    RoyaltyRecipient(u32),
    /// Persistent: royalties accrued and not yet claimed, in asset units.
    RoyaltyBalance(u32),
    /// Persistent: how many tokens an owner holds.
    OwnedCount(Address),
    /// Persistent: the owner's token at position `index` (0-based).
    OwnedAt(Address, u32),
    /// Persistent: position of a token inside its owner's list.
    OwnedIndex(u32),
}

/// One page of an owner's tokens, as returned by `get_user_tokens`.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UserTokensPage {
    /// Token IDs on this page, in the owner's list order.
    pub tokens: Vec<u32>,
    /// Cursor to pass to the next call, or `None` when this is the last page.
    pub next_cursor: Option<u32>,
    /// Total number of tokens the owner holds.
    pub total: u32,
}

/// Response type for NFT metadata
#[derive(Clone, Debug)]
pub struct NFTMetadata {
    pub uri: String,
    pub name: String,
    pub description: String,
    pub image_uri: String,
}

/// Royalty information structure
#[derive(Clone, Debug)]
pub struct RoyaltyInfo {
    pub creator: String,
    pub platform: String,
    pub creator_bps: u32,
    pub platform_bps: u32,
}

/// NFT mint event data
#[derive(Clone, Debug)]
pub struct NFTMintEvent {
    pub nft_id: String,
    pub creator: String,
    pub owner: String,
    pub clip_id: String,
}

/// Royalty claim event data
#[derive(Clone, Debug)]
pub struct RoyaltyClaimEvent {
    pub nft_id: String,
    pub recipient: String,
    pub amount: i128,
}
