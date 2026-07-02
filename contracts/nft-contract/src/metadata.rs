use soroban_sdk::{contracttype, String};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ClipMetadata {
    pub name: String,
    pub description: String,
    pub content_uri: String,
    pub creator: String,
    pub royalty_percent: u32,
    pub is_soulbound: bool,
    pub created_at: u64,
}
