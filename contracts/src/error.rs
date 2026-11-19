use soroban_sdk::contracterror;

/// ClipCashNFT contract errors.
///
/// Codes are stable and mapped to HTTP responses by the backend
/// (`src/nft/contract-errors.ts`). Never renumber existing variants.
#[contracterror]
#[derive(Copy, Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ContractError {
    /// Contract has not been initialized. → 500
    NotInitialized = 1,
    /// `initialize` was already called. → 409
    AlreadyInitialized = 2,
    /// Royalty value is outside 0–10 000 BPS. → 400
    InvalidRoyaltyBps = 3,
    /// Creator + platform royalties exceed 100%. → 400
    RoyaltyExceedsCap = 4,
    /// Caller is not the owner/admin/approved operator. → 403
    Unauthorized = 5,
    /// Generic missing resource. → 404
    NotFound = 6,
    /// Resource (e.g. token id) already exists. → 409
    AlreadyExists = 7,
    /// Wallet does not hold enough for the operation. → 400
    InsufficientBalance = 8,
    /// The clip has already been minted as an NFT. → 409
    ClipAlreadyMinted = 9,
    /// Contract is paused. → 409
    ContractPaused = 10,
    /// Token is frozen and cannot be moved. → 409
    TokenFrozen = 11,
    /// Wallet is still inside its mint cooldown window. → 429
    CooldownActive = 12,
    /// Mint authorization signature invalid or no signer configured. → 401
    InvalidSignature = 13,
    /// Mint authorization has expired. → 401
    SignatureExpired = 14,
    /// Mint authorization nonce already used (replay). → 409
    NonceAlreadyUsed = 15,
    /// No approval exists to revoke. → 404
    ApprovalNotFound = 16,
    /// Token id does not exist. → 404
    TokenNotFound = 17,
}

impl core::fmt::Display for ContractError {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        let msg = match self {
            ContractError::NotInitialized => "Contract not initialized",
            ContractError::AlreadyInitialized => "Contract already initialized",
            ContractError::InvalidRoyaltyBps => "Invalid royalty basis points",
            ContractError::RoyaltyExceedsCap => "Royalties exceed 100%",
            ContractError::Unauthorized => "Unauthorized",
            ContractError::NotFound => "Not found",
            ContractError::AlreadyExists => "Already exists",
            ContractError::InsufficientBalance => "Insufficient balance",
            ContractError::ClipAlreadyMinted => "Clip already minted",
            ContractError::ContractPaused => "Contract paused",
            ContractError::TokenFrozen => "Token frozen",
            ContractError::CooldownActive => "Mint cooldown active",
            ContractError::InvalidSignature => "Invalid signature",
            ContractError::SignatureExpired => "Signature expired",
            ContractError::NonceAlreadyUsed => "Nonce already used",
            ContractError::ApprovalNotFound => "Approval not found",
            ContractError::TokenNotFound => "Token not found",
        };
        write!(f, "{}", msg)
    }
}
