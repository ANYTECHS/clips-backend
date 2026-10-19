use soroban_sdk::contracterror;

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
