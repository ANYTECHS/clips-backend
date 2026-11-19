use soroban_sdk::contracterror;

/// ClipCashNFT contract errors
#[contracterror]
#[derive(Copy, Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum ContractError {
    NotInitialized = 1,
    AlreadyInitialized = 2,
    InvalidRoyaltyBps = 3,
    RoyaltyExceedsCap = 4,
    Unauthorized = 5,
    NotFound = 6,
    AlreadyExists = 7,
    InsufficientBalance = 8,
    /// `claim_royalties` found nothing owed for the token (also what a second
    /// claim in a row returns, because the first one reset the balance).
    NoRoyaltiesToClaim = 9,
    /// A royalty operation needs the payment asset, but `set_royalty_asset`
    /// has not been called.
    RoyaltyAssetNotSet = 10,
    InvalidAmount = 11,
    /// `migrate` was called on storage that is already at the current schema.
    AlreadyMigrated = 12,
    /// A checked counter or balance operation overflowed.
    Overflow = 13,
}

impl core::fmt::Display for ContractError {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match self {
            ContractError::NotInitialized => write!(f, "Contract not initialized"),
            ContractError::AlreadyInitialized => write!(f, "Contract already initialized"),
            ContractError::InvalidRoyaltyBps => write!(f, "Invalid royalty basis points"),
            ContractError::RoyaltyExceedsCap => write!(f, "Royalties exceed 100%"),
            ContractError::Unauthorized => write!(f, "Unauthorized"),
            ContractError::NotFound => write!(f, "Not found"),
            ContractError::AlreadyExists => write!(f, "Already exists"),
            ContractError::InsufficientBalance => write!(f, "Insufficient balance"),
            ContractError::NoRoyaltiesToClaim => write!(f, "No royalties to claim"),
            ContractError::RoyaltyAssetNotSet => write!(f, "Royalty asset not set"),
            ContractError::InvalidAmount => write!(f, "Invalid amount"),
            ContractError::AlreadyMigrated => write!(f, "Already migrated"),
            ContractError::Overflow => write!(f, "Arithmetic overflow"),
        }
    }
}
