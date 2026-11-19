// Soroban NFT Contract with Platform Fee Tracking
// This contract implements ERC-721-like NFT functionality with royalty payments
// and transparent platform fee tracking.

#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, token, Address, Env, String, Vec, Map,
};

/// Storage key for the total accumulated platform fees
const TOTAL_PLATFORM_FEES: &str = "total_platform_fees";

/// Platform fee percentage in basis points (e.g., 500 = 5%)
const PLATFORM_FEE_BPS: u32 = 500; // 5% platform fee

/// Royalty information for a single token
/// Contains the recipient address and royalty percentage in basis points
#[contracttype]
#[derive(Clone)]
pub struct RoyaltyInfo {
    /// The address that receives royalty payments
    pub recipient: Address,
    /// Royalty percentage in basis points (e.g., 1000 = 10%, max 1500 = 15%)
    pub bps: u32,
}

/// Batch royalty information including token ID
/// Used by batch_royalty_info to return royalty data for multiple tokens
#[contracttype]
#[derive(Clone)]
pub struct BatchRoyaltyInfo {
    /// The NFT token ID
    pub token_id: u128,
    /// The address that receives royalty payments (zero address if token doesn't exist)
    pub recipient: Address,
    /// Royalty numerator in basis points (e.g., 500 = 5%)
    pub fee_numerator: u32,
    /// Royalty denominator (always 10000 for basis points calculation)
    pub fee_denominator: u32,
}

#[contracttype]
#[derive(Clone)]
pub struct NFTMetadata {
    pub owner: Address,
    pub uri: String,
    pub royalty_info: RoyaltyInfo,
}

#[contracttype]
pub enum DataKey {
    TokenOwner(u128),
    TokenURI(u128),
    TokenRoyalty(u128),
    TotalSupply,
    Admin,
    Paused,
    PauseReason,
    Balance(Address),
    Approved(u128),
    /// Unclaimed royalty escrow: (payment token, amount)
    UnclaimedRoyalty(u128),
}

/// Event emitted when unclaimed royalties are refunded on burn
#[contracttype]
#[derive(Clone)]
pub struct Refunded {
    pub token_id: u128,
    pub recipient: Address,
    pub payment_token: Address,
    pub amount: i128,
}

/// Event emitted when platform fees are collected
#[contracttype]
#[derive(Clone)]
pub struct PlatformFeeCollected {
    pub amount: i128,
    pub new_total: u128,
}

#[contract]
pub struct NFTContract;

#[contractimpl]
impl NFTContract {
    /// Mint a new NFT with royalty information
    pub fn mint(
        env: Env,
        to: Address,
        token_id: u128,
        uri: String,
        royalty_recipient: Address,
        royalty_bps: u32,
    ) {
        to.require_auth();
        Self::require_not_paused(&env);
        assert!(
            !env.storage().instance().has(&DataKey::TokenOwner(token_id)),
            "Token already exists"
        );
        
        // Validate royalty BPS (max 15%)
        assert!(royalty_bps <= 1500, "Royalty BPS cannot exceed 1500 (15%)");
        
        // Store token owner
        env.storage().instance().set(&DataKey::TokenOwner(token_id), &to);
        
        // Store token URI
        env.storage().instance().set(&DataKey::TokenURI(token_id), &uri);
        
        // Store royalty info
        let royalty_info = RoyaltyInfo {
            recipient: royalty_recipient,
            bps: royalty_bps,
        };
        env.storage().instance().set(&DataKey::TokenRoyalty(token_id), &royalty_info);
        
        // Increment total supply
        let total_supply: u128 = env.storage()
            .instance()
            .get(&DataKey::TotalSupply)
            .unwrap_or(0);
        env.storage().instance().set(&DataKey::TotalSupply, &(total_supply + 1));
        Self::adjust_balance(&env, &to, 1);
    }

    /// Get the owner of a token
    pub fn owner_of(env: Env, token_id: u128) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::TokenOwner(token_id))
            .expect("Token does not exist")
    }

    /// Get royalty information for a token
    pub fn get_royalties(env: Env, token_id: u128) -> Map<Address, u32> {
        let royalty_info: RoyaltyInfo = env.storage()
            .instance()
            .get(&DataKey::TokenRoyalty(token_id))
            .expect("Token does not exist");
        
        let mut royalty_map = Map::new(&env);
        royalty_map.set(royalty_info.recipient, royalty_info.bps);
        royalty_map
    }

    /// Batch query royalty information for multiple tokens in a single call
    /// 
    /// This is a pure view function with no state mutations or access control.
    /// Anyone (including frontends without a wallet signer) can call this function.
    /// 
    /// # Parameters
    /// * `token_ids` - Vector of token IDs to query
    /// 
    /// # Returns
    /// Vector of `BatchRoyaltyInfo` structs in the same order as input.
    /// - If a token doesn't exist or has no royalty set, returns a zero-value entry
    /// - Output array length always equals input array length
    /// - Output index matches input index (output[i] corresponds to token_ids[i])
    /// 
    /// # Edge Cases
    /// - Empty input returns empty output immediately
    /// - Non-existent tokens return zeroed struct (recipient = zero address, fees = 0)
    /// - Does not revert on missing tokens
    /// 
    /// # Warning
    /// Very large batches may hit RPC node gas/timeout limits. The caller should
    /// manage request size based on their RPC provider's constraints.
    /// Recommended batch size: 50-100 tokens per call.
    /// 
    /// # Example
    /// ```ignore
    /// let token_ids = vec![&env, 1, 2, 3];
    /// let royalties = batch_royalty_info(env, token_ids);
    /// // Returns 3 BatchRoyaltyInfo structs with royalty data for tokens 1, 2, 3
    /// ```
    pub fn batch_royalty_info(env: Env, token_ids: Vec<u128>) -> Vec<BatchRoyaltyInfo> {
        // Handle empty input immediately
        if token_ids.is_empty() {
            return Vec::new(&env);
        }

        let mut results = Vec::new(&env);
        
        // Iterate over input token IDs and collect royalty info
        for i in 0..token_ids.len() {
            let token_id = token_ids.get(i).unwrap();
            
            // Try to get royalty info for this token
            let royalty_info_opt: Option<RoyaltyInfo> = env.storage()
                .instance()
                .get(&DataKey::TokenRoyalty(token_id));
            
            let batch_info = match royalty_info_opt {
                Some(royalty_info) => {
                    // Token exists - return actual royalty data
                    BatchRoyaltyInfo {
                        token_id,
                        recipient: royalty_info.recipient,
                        fee_numerator: royalty_info.bps,
                        fee_denominator: 10000, // Basis points denominator
                    }
                }
                None => {
                    // Token doesn't exist - return zero-value entry
                    // Create a zero address (all zeros)
                    let zero_address = Address::from_string(&String::from_str(
                        &env,
                        "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
                    ));
                    
                    BatchRoyaltyInfo {
                        token_id,
                        recipient: zero_address,
                        fee_numerator: 0,
                        fee_denominator: 10000,
                    }
                }
            };
            
            results.push_back(batch_info);
        }
        
        results
    }


    /// Execute a royalty payment for a token sale
    /// This function:
    /// 1. Calculates the royalty amount based on the token's royalty BPS
    /// 2. Calculates the platform fee (5% of sale price)
    /// 3. Transfers royalty to the creator
    /// 4. Transfers platform fee to the platform wallet
    /// 5. Atomically updates total_platform_fees
    /// 6. Emits PlatformFeeCollected event
    ///
    /// @param token_id - The NFT token ID
    /// @param sale_price - The sale price in stroops (1 XLM = 10^7 stroops)
    /// @param payment_token - The token contract address for payment
    /// @param buyer - The buyer's address (payer)
    /// @param platform_wallet - The platform's wallet address
    pub fn execute_royalty_payment(
        env: Env,
        token_id: u128,
        sale_price: i128,
        payment_token: Address,
        buyer: Address,
        platform_wallet: Address,
    ) {
        buyer.require_auth();
        
        // Ensure sale price is positive
        assert!(sale_price > 0, "Sale price must be positive");
        
        // Get royalty info
        let royalty_info: RoyaltyInfo = env.storage()
            .instance()
            .get(&DataKey::TokenRoyalty(token_id))
            .expect("Token does not exist");
        
        // Calculate royalty amount (creator's share)
        let royalty_amount = (sale_price * royalty_info.bps as i128) / 10000;
        
        // Calculate platform fee (5% of sale price)
        let platform_fee_amount = (sale_price * PLATFORM_FEE_BPS as i128) / 10000;
        
        // Calculate seller's net amount
        let seller_amount = sale_price - royalty_amount - platform_fee_amount;
        
        // Get token contract for transfers
        let token_client = token::Client::new(&env, &payment_token);
        
        // Transfer royalty to creator
        if royalty_amount > 0 {
            token_client.transfer(&buyer, &royalty_info.recipient, &royalty_amount);
        }
        
        // Transfer platform fee to platform wallet
        // This MUST happen atomically - cannot be skipped
        if platform_fee_amount > 0 {
            token_client.transfer(&buyer, &platform_wallet, &platform_fee_amount);
            
            // *** CRITICAL: Update total_platform_fees atomically ***
            // This increment happens in the same transaction as the payment
            // and cannot be skipped or made conditional
            let current_total: u128 = env.storage()
                .persistent()
                .get(&String::from_str(&env, TOTAL_PLATFORM_FEES))
                .unwrap_or(0);
            
            let new_total = current_total + platform_fee_amount as u128;
            
            env.storage()
                .persistent()
                .set(&String::from_str(&env, TOTAL_PLATFORM_FEES), &new_total);
            
            // Emit event for off-chain indexers
            env.events().publish(
                (String::from_str(&env, "PlatformFeeCollected"),),
                PlatformFeeCollected {
                    amount: platform_fee_amount,
                    new_total,
                },
            );
        }
        
        // Transfer remaining amount to seller (current token owner)
        let seller = Self::owner_of(env.clone(), token_id);
        if seller_amount > 0 {
            token_client.transfer(&buyer, &seller, &seller_amount);
        }
    }

    /// Get the total accumulated platform revenue
    /// This is a read-only function with no access control - anyone can call it
    /// for transparency.
    ///
    /// @return The total platform fees collected in stroops (1 XLM = 10^7 stroops)
    pub fn get_platform_revenue(env: Env) -> u128 {
        env.storage()
            .persistent()
            .get(&String::from_str(&env, TOTAL_PLATFORM_FEES))
            .unwrap_or(0)
    }

    /// Transfer token ownership (standard ERC-721 / SEP-0050 transfer)
    pub fn transfer(env: Env, from: Address, to: Address, token_id: u128) {
        from.require_auth();
        Self::do_transfer(&env, &from, &to, token_id);
    }

    /// Transfer on behalf of the owner by an approved spender
    pub fn transfer_from(env: Env, spender: Address, from: Address, to: Address, token_id: u128) {
        spender.require_auth();
        let approved: Option<Address> = env.storage().instance().get(&DataKey::Approved(token_id));
        assert!(approved == Some(spender), "Spender not approved");
        Self::do_transfer(&env, &from, &to, token_id);
    }

    /// Approve an address to transfer a single token
    pub fn approve(env: Env, owner: Address, approved: Address, token_id: u128) {
        owner.require_auth();
        assert!(Self::owner_of(env.clone(), token_id) == owner, "Not the token owner");
        env.storage().instance().set(&DataKey::Approved(token_id), &approved);
    }

    /// Get the approved address for a token, if any
    pub fn get_approved(env: Env, token_id: u128) -> Option<Address> {
        env.storage().instance().get(&DataKey::Approved(token_id))
    }

    /// Number of tokens owned by an address
    pub fn balance_of(env: Env, owner: Address) -> u32 {
        env.storage().instance().get(&DataKey::Balance(owner)).unwrap_or(0)
    }

    /// Collection name
    pub fn name(env: Env) -> String {
        String::from_str(&env, "ClipCash Clips")
    }

    /// Collection symbol
    pub fn symbol(env: Env) -> String {
        String::from_str(&env, "CLIP")
    }

    // ---------------------------------------------------------------
    // Admin / pause
    // ---------------------------------------------------------------

    /// One-time initialization of the contract administrator
    pub fn initialize(env: Env, admin: Address) {
        assert!(!env.storage().instance().has(&DataKey::Admin), "Already initialized");
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
    }

    /// Pause the contract with an optional human-readable reason (admin only)
    pub fn pause(env: Env, reason: Option<String>) {
        Self::require_admin(&env);
        env.storage().instance().set(&DataKey::Paused, &true);
        match reason {
            Some(r) => env.storage().instance().set(&DataKey::PauseReason, &r),
            None => env.storage().instance().remove(&DataKey::PauseReason),
        }
        env.events().publish((String::from_str(&env, "Paused"),), Self::pause_reason(env.clone()));
    }

    /// Update the pause reason while paused (admin only)
    pub fn set_pause_reason(env: Env, reason: String) {
        Self::require_admin(&env);
        assert!(Self::is_paused(env.clone()), "Contract is not paused");
        env.storage().instance().set(&DataKey::PauseReason, &reason);
    }

    /// Unpause the contract and clear the reason (admin only)
    pub fn unpause(env: Env) {
        Self::require_admin(&env);
        env.storage().instance().set(&DataKey::Paused, &false);
        env.storage().instance().remove(&DataKey::PauseReason);
        env.events().publish((String::from_str(&env, "Unpaused"),), ());
    }

    pub fn is_paused(env: Env) -> bool {
        env.storage().instance().get(&DataKey::Paused).unwrap_or(false)
    }

    /// Current pause reason (empty string when none is set)
    pub fn pause_reason(env: Env) -> String {
        env.storage()
            .instance()
            .get(&DataKey::PauseReason)
            .unwrap_or(String::from_str(&env, ""))
    }

    // ---------------------------------------------------------------
    // Royalty escrow + burn
    // ---------------------------------------------------------------

    /// Deposit royalties into escrow for a token (claimable by the royalty recipient)
    pub fn deposit_royalty(env: Env, from: Address, token_id: u128, payment_token: Address, amount: i128) {
        from.require_auth();
        assert!(amount > 0, "Amount must be positive");
        let key = DataKey::UnclaimedRoyalty(token_id);
        let current: Option<(Address, i128)> = env.storage().instance().get(&key);
        let balance = match current {
            Some((t, b)) => {
                assert!(t == payment_token, "Payment token mismatch");
                b.checked_add(amount).expect("Overflow")
            }
            None => amount,
        };
        token::Client::new(&env, &payment_token).transfer(&from, &env.current_contract_address(), &amount);
        env.storage().instance().set(&key, &(payment_token, balance));
    }

    /// Unclaimed royalty balance held in escrow for a token
    pub fn unclaimed_royalty(env: Env, token_id: u128) -> i128 {
        let v: Option<(Address, i128)> = env.storage().instance().get(&DataKey::UnclaimedRoyalty(token_id));
        v.map(|(_, b)| b).unwrap_or(0)
    }

    /// Burn a token. If `refund_royalties` is true, any unclaimed royalty
    /// escrow is returned to the configured royalty recipient and a
    /// `Refunded` event is emitted. Returns the refunded amount.
    pub fn burn(env: Env, owner: Address, token_id: u128, refund_royalties: bool) -> i128 {
        owner.require_auth();
        Self::require_not_paused(&env);
        assert!(Self::owner_of(env.clone(), token_id) == owner, "Not the token owner");

        let royalty: RoyaltyInfo = env.storage()
            .instance()
            .get(&DataKey::TokenRoyalty(token_id))
            .expect("Token does not exist");

        let mut refunded: i128 = 0;
        let escrow_key = DataKey::UnclaimedRoyalty(token_id);
        let escrow: Option<(Address, i128)> = env.storage().instance().get(&escrow_key);
        if refund_royalties {
            if let Some((payment_token, amount)) = escrow {
                // Clear first to prevent double refunds
                env.storage().instance().remove(&escrow_key);
                if amount > 0 {
                    token::Client::new(&env, &payment_token)
                        .transfer(&env.current_contract_address(), &royalty.recipient, &amount);
                    refunded = amount;
                    env.events().publish(
                        (String::from_str(&env, "Refunded"),),
                        Refunded { token_id, recipient: royalty.recipient.clone(), payment_token, amount },
                    );
                }
            }
        } else {
            assert!(escrow.map(|(_, b)| b).unwrap_or(0) == 0, "Unclaimed royalties exist; burn with refund");
        }

        let s = env.storage().instance();
        s.remove(&DataKey::TokenOwner(token_id));
        s.remove(&DataKey::TokenURI(token_id));
        s.remove(&DataKey::TokenRoyalty(token_id));
        s.remove(&DataKey::Approved(token_id));
        let supply: u128 = s.get(&DataKey::TotalSupply).unwrap_or(0);
        s.set(&DataKey::TotalSupply, &supply.saturating_sub(1));
        Self::adjust_balance(&env, &owner, -1);
        env.events().publish((String::from_str(&env, "Burned"),), token_id);
        refunded
    }

    /// Get token URI
    pub fn token_uri(env: Env, token_id: u128) -> String {
        env.storage()
            .instance()
            .get(&DataKey::TokenURI(token_id))
            .expect("Token does not exist")
    }

    /// Get total supply of minted tokens
    pub fn total_supply(env: Env) -> u128 {
        env.storage()
            .instance()
            .get(&DataKey::TotalSupply)
            .unwrap_or(0)
    }
}

impl NFTContract {
    fn require_admin(env: &Env) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).expect("Not initialized");
        admin.require_auth();
    }

    fn require_not_paused(env: &Env) {
        let paused: bool = env.storage().instance().get(&DataKey::Paused).unwrap_or(false);
        assert!(!paused, "Contract is paused");
    }

    fn adjust_balance(env: &Env, owner: &Address, delta: i32) {
        let key = DataKey::Balance(owner.clone());
        let bal: u32 = env.storage().instance().get(&key).unwrap_or(0);
        let new_bal = if delta < 0 { bal.saturating_sub(1) } else { bal + 1 };
        env.storage().instance().set(&key, &new_bal);
    }

    fn do_transfer(env: &Env, from: &Address, to: &Address, token_id: u128) {
        Self::require_not_paused(env);
        let current_owner: Address = env.storage()
            .instance()
            .get(&DataKey::TokenOwner(token_id))
            .expect("Token does not exist");
        assert!(&current_owner == from, "Not the token owner");
        env.storage().instance().set(&DataKey::TokenOwner(token_id), to);
        env.storage().instance().remove(&DataKey::Approved(token_id));
        Self::adjust_balance(env, from, -1);
        Self::adjust_balance(env, to, 1);
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env};

    #[test]
    fn test_platform_fee_tracking() {
        let env = Env::default();
        let contract_id = env.register_contract(None, NFTContract);
        let client = NFTContractClient::new(&env, &contract_id);

        let creator = Address::generate(&env);
        let buyer = Address::generate(&env);
        let platform = Address::generate(&env);
        let token_address = Address::generate(&env);

        // Initial platform revenue should be 0
        assert_eq!(client.get_platform_revenue(), 0);

        // Mint a token with 10% royalty
        client.mint(
            &creator,
            &1,
            &String::from_str(&env, "ipfs://test"),
            &creator,
            &1000,
        );

        // Execute royalty payment with 100 XLM sale (1,000,000,000 stroops)
        // Platform fee: 5% = 50,000,000 stroops
        // Royalty: 10% = 100,000,000 stroops
        client.execute_royalty_payment(
            &1,
            &1_000_000_000,
            &token_address,
            &buyer,
            &platform,
        );

        // Platform revenue should now be 50,000,000
        assert_eq!(client.get_platform_revenue(), 50_000_000);

        // Execute another payment
        client.execute_royalty_payment(
            &1,
            &2_000_000_000,
            &token_address,
            &buyer,
            &platform,
        );

        // Platform revenue should accumulate: 50M + 100M = 150M
        assert_eq!(client.get_platform_revenue(), 150_000_000);
    }

    #[test]
    fn test_mint_and_royalty() {
        let env = Env::default();
        let contract_id = env.register_contract(None, NFTContract);
        let client = NFTContractClient::new(&env, &contract_id);

        let creator = Address::generate(&env);
        let token_id = 1u128;

        client.mint(
            &creator,
            &token_id,
            &String::from_str(&env, "ipfs://metadata"),
            &creator,
            &1000, // 10% royalty
        );

        assert_eq!(client.owner_of(&token_id), creator);
        assert_eq!(client.total_supply(), 1);

        let royalties = client.get_royalties(&token_id);
        assert_eq!(royalties.get(creator).unwrap(), 1000);
    }

    #[test]
    fn test_batch_royalty_info_multiple_tokens() {
        let env = Env::default();
        let contract_id = env.register_contract(None, NFTContract);
        let client = NFTContractClient::new(&env, &contract_id);

        let creator1 = Address::generate(&env);
        let creator2 = Address::generate(&env);
        let creator3 = Address::generate(&env);

        // Mint three tokens with different royalties
        client.mint(
            &creator1,
            &1,
            &String::from_str(&env, "ipfs://token1"),
            &creator1,
            &500, // 5% royalty
        );

        client.mint(
            &creator2,
            &2,
            &String::from_str(&env, "ipfs://token2"),
            &creator2,
            &1000, // 10% royalty
        );

        client.mint(
            &creator3,
            &3,
            &String::from_str(&env, "ipfs://token3"),
            &creator3,
            &1500, // 15% royalty
        );

        // Batch query all three tokens
        let token_ids = Vec::from_array(&env, [1u128, 2u128, 3u128]);
        let batch_results = client.batch_royalty_info(&token_ids);

        // Verify results
        assert_eq!(batch_results.len(), 3);

        // Token 1
        let info1 = batch_results.get(0).unwrap();
        assert_eq!(info1.token_id, 1);
        assert_eq!(info1.recipient, creator1);
        assert_eq!(info1.fee_numerator, 500);
        assert_eq!(info1.fee_denominator, 10000);

        // Token 2
        let info2 = batch_results.get(1).unwrap();
        assert_eq!(info2.token_id, 2);
        assert_eq!(info2.recipient, creator2);
        assert_eq!(info2.fee_numerator, 1000);
        assert_eq!(info2.fee_denominator, 10000);

        // Token 3
        let info3 = batch_results.get(2).unwrap();
        assert_eq!(info3.token_id, 3);
        assert_eq!(info3.recipient, creator3);
        assert_eq!(info3.fee_numerator, 1500);
        assert_eq!(info3.fee_denominator, 10000);
    }

    #[test]
    fn test_batch_royalty_info_with_nonexistent_tokens() {
        let env = Env::default();
        let contract_id = env.register_contract(None, NFTContract);
        let client = NFTContractClient::new(&env, &contract_id);

        let creator = Address::generate(&env);

        // Mint only token 1 and 3, skip token 2
        client.mint(
            &creator,
            &1,
            &String::from_str(&env, "ipfs://token1"),
            &creator,
            &500,
        );

        client.mint(
            &creator,
            &3,
            &String::from_str(&env, "ipfs://token3"),
            &creator,
            &1500,
        );

        // Query tokens 1, 2 (doesn't exist), 3
        let token_ids = Vec::from_array(&env, [1u128, 2u128, 3u128]);
        let batch_results = client.batch_royalty_info(&token_ids);

        // Should return 3 results, with token 2 having zero values
        assert_eq!(batch_results.len(), 3);

        // Token 1 - exists
        let info1 = batch_results.get(0).unwrap();
        assert_eq!(info1.token_id, 1);
        assert_eq!(info1.recipient, creator);
        assert_eq!(info1.fee_numerator, 500);

        // Token 2 - doesn't exist, should have zero values
        let info2 = batch_results.get(1).unwrap();
        assert_eq!(info2.token_id, 2);
        assert_eq!(info2.fee_numerator, 0);
        assert_eq!(info2.fee_denominator, 10000);
        // recipient should be zero address

        // Token 3 - exists
        let info3 = batch_results.get(2).unwrap();
        assert_eq!(info3.token_id, 3);
        assert_eq!(info3.recipient, creator);
        assert_eq!(info3.fee_numerator, 1500);
    }

    #[test]
    fn test_batch_royalty_info_empty_input() {
        let env = Env::default();
        let contract_id = env.register_contract(None, NFTContract);
        let client = NFTContractClient::new(&env, &contract_id);

        // Query with empty array
        let token_ids: Vec<u128> = Vec::new(&env);
        let batch_results = client.batch_royalty_info(&token_ids);

        // Should return empty array
        assert_eq!(batch_results.len(), 0);
    }

    #[test]
    fn test_batch_royalty_info_order_preservation() {
        let env = Env::default();
        let contract_id = env.register_contract(None, NFTContract);
        let client = NFTContractClient::new(&env, &contract_id);

        let creator = Address::generate(&env);

        // Mint tokens in non-sequential order
        client.mint(
            &creator,
            &10,
            &String::from_str(&env, "ipfs://token10"),
            &creator,
            &300,
        );

        client.mint(
            &creator,
            &5,
            &String::from_str(&env, "ipfs://token5"),
            &creator,
            &700,
        );

        client.mint(
            &creator,
            &15,
            &String::from_str(&env, "ipfs://token15"),
            &creator,
            &1200,
        );

        // Query in specific order: 15, 5, 10
        let token_ids = Vec::from_array(&env, [15u128, 5u128, 10u128]);
        let batch_results = client.batch_royalty_info(&token_ids);

        // Verify order is preserved
        assert_eq!(batch_results.len(), 3);
        assert_eq!(batch_results.get(0).unwrap().token_id, 15);
        assert_eq!(batch_results.get(0).unwrap().fee_numerator, 1200);
        assert_eq!(batch_results.get(1).unwrap().token_id, 5);
        assert_eq!(batch_results.get(1).unwrap().fee_numerator, 700);
        assert_eq!(batch_results.get(2).unwrap().token_id, 10);
        assert_eq!(batch_results.get(2).unwrap().fee_numerator, 300);
    }

    #[test]
    fn test_batch_royalty_info_single_token() {
        let env = Env::default();
        let contract_id = env.register_contract(None, NFTContract);
        let client = NFTContractClient::new(&env, &contract_id);

        let creator = Address::generate(&env);

        client.mint(
            &creator,
            &42,
            &String::from_str(&env, "ipfs://token42"),
            &creator,
            &850,
        );

        // Query single token
        let token_ids = Vec::from_array(&env, [42u128]);
        let batch_results = client.batch_royalty_info(&token_ids);

        assert_eq!(batch_results.len(), 1);
        let info = batch_results.get(0).unwrap();
        assert_eq!(info.token_id, 42);
        assert_eq!(info.recipient, creator);
        assert_eq!(info.fee_numerator, 850);
        assert_eq!(info.fee_denominator, 10000);
    }

    fn setup(env: &Env) -> (NFTContractClient<'_>, Address) {
        env.mock_all_auths();
        let id = env.register_contract(None, NFTContract);
        let client = NFTContractClient::new(env, &id);
        let admin = Address::generate(env);
        client.initialize(&admin);
        (client, admin)
    }

    #[test]
    fn test_pause_with_reason() {
        let env = Env::default();
        let (client, _) = setup(&env);
        client.pause(&Some(String::from_str(&env, "Scheduled contract maintenance")));
        assert!(client.is_paused());
        assert_eq!(client.pause_reason(), String::from_str(&env, "Scheduled contract maintenance"));
        client.unpause();
        assert!(!client.is_paused());
        assert_eq!(client.pause_reason(), String::from_str(&env, ""));
    }

    #[test]
    fn test_pause_without_reason() {
        let env = Env::default();
        let (client, _) = setup(&env);
        client.pause(&None);
        assert!(client.is_paused());
        assert_eq!(client.pause_reason(), String::from_str(&env, ""));
    }

    #[test]
    #[should_panic]
    fn test_unauthorized_pause_reason_update() {
        let env = Env::default();
        let id = env.register_contract(None, NFTContract);
        let client = NFTContractClient::new(&env, &id);
        let admin = Address::generate(&env);
        env.mock_all_auths();
        client.initialize(&admin);
        client.pause(&None);
        env.set_auths(&[]);
        client.set_pause_reason(&String::from_str(&env, "hijack"));
    }

    #[test]
    fn test_burn_without_refund_and_standards() {
        let env = Env::default();
        let (client, _) = setup(&env);
        let owner = Address::generate(&env);
        let other = Address::generate(&env);
        client.mint(&owner, &1, &String::from_str(&env, "ipfs://1"), &owner, &500);
        assert_eq!(client.balance_of(&owner), 1);
        client.approve(&owner, &other, &1);
        client.transfer_from(&other, &owner, &other, &1);
        assert_eq!(client.owner_of(&1), other);
        assert_eq!(client.balance_of(&owner), 0);
        assert_eq!(client.get_approved(&1), None);
        assert_eq!(client.burn(&other, &1, &false), 0);
        assert_eq!(client.total_supply(), 0);
        assert_eq!(client.balance_of(&other), 0);
    }

    #[test]
    fn test_burn_with_refund_and_zero_balance() {
        let env = Env::default();
        let (client, admin) = setup(&env);
        let owner = Address::generate(&env);
        let creator = Address::generate(&env);
        let sac = env.register_stellar_asset_contract(admin.clone());
        let token = soroban_sdk::token::Client::new(&env, &sac);
        soroban_sdk::token::StellarAssetClient::new(&env, &sac).mint(&owner, &1_000);

        client.mint(&owner, &1, &String::from_str(&env, "ipfs://1"), &creator, &500);
        client.deposit_royalty(&owner, &1, &sac, &300);
        assert_eq!(client.unclaimed_royalty(&1), 300);
        assert_eq!(client.burn(&owner, &1, &true), 300);
        assert_eq!(token.balance(&creator), 300);
        assert_eq!(client.unclaimed_royalty(&1), 0);

        // zero royalty balance
        client.mint(&owner, &2, &String::from_str(&env, "ipfs://2"), &creator, &500);
        assert_eq!(client.burn(&owner, &2, &true), 0);
    }
}
