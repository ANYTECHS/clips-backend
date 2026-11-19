use soroban_sdk::contracterror;

/// ClipCashNFT contract errors
#[contracterror]
#[derive(Copy, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub enum ContractError {
    NotInitialized = 1,
    AlreadyInitialized = 2,
    InvalidRoyaltyBps = 3,
    RoyaltyExceedsCap = 4,
    Unauthorized = 5,
    NotFound = 6,
    AlreadyExists = 7,
    InsufficientBalance = 8,
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
        }
    }
}
