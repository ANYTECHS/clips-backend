#![no_std]

use soroban_sdk::{contract, contractimpl, token, Address, BytesN, Env, String, Symbol, Vec};

mod types;
mod storage;
mod error;

use types::*;
use storage::*;
use error::ContractError;

/// ClipCashNFT - NFT minting and royalty management contract
/// 
/// Handles:
/// - NFT minting with creator and platform royalty support
/// - Ownership tracking
/// - Royalty distribution and claims
/// - Contract administration and upgrades
#[contract]
pub struct ClipCashNFT;

#[contractimpl]
impl ClipCashNFT {
    /// Initialize the contract with the owner and royalty configuration
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `owner` - The admin address (typically the platform)
    /// * `creator_royalty_bps` - Creator royalty in basis points (0-10000)
    /// * `platform_royalty_bps` - Platform royalty in basis points (0-10000)
    ///
    /// # Returns
    /// `Result<(), ContractError>` - Success or error
    pub fn initialize(
        env: Env,
        owner: Address,
        creator_royalty_bps: u32,
        platform_royalty_bps: u32,
    ) -> Result<(), ContractError> {
        // Check if already initialized
        if has_owner(&env) {
            return Err(ContractError::AlreadyInitialized);
        }

        // Validate royalty basis points (max 100%)
        if creator_royalty_bps > 10000 || platform_royalty_bps > 10000 {
            return Err(ContractError::InvalidRoyaltyBps);
        }

        // Ensure royalties don't exceed 100%
        if creator_royalty_bps + platform_royalty_bps > 10000 {
            return Err(ContractError::RoyaltyExceedsCap);
        }

        // Store owner
        set_owner(&env, &owner);

        // Store royalty configuration
        set_creator_royalty_bps(&env, creator_royalty_bps);
        set_platform_royalty_bps(&env, platform_royalty_bps);

        // Token counters and schema marker
        storage::init_counters(&env);
        storage::set_schema_version(&env, storage::CURRENT_SCHEMA_VERSION);

        // Emit initialization event
        env.events().publish(
            ("ClipCashNFT", Symbol::new(&env, "initialized")),
            (
                owner.clone(),
                creator_royalty_bps,
                platform_royalty_bps,
            ),
        );

        Ok(())
    }

    /// Get the current contract owner
    ///
    /// # Arguments
    /// * `env` - The contract environment
    ///
    /// # Returns
    /// The owner's address
    pub fn get_owner(env: Env) -> Address {
        get_owner(&env).expect("Owner not initialized")
    }

    /// Get the creator royalty in basis points
    ///
    /// # Arguments
    /// * `env` - The contract environment
    ///
    /// # Returns
    /// Creator royalty in basis points (0-10000)
    pub fn get_creator_royalty_bps(env: Env) -> u32 {
        get_creator_royalty_bps(&env).unwrap_or(1000) // Default 10%
    }

    /// Get the platform royalty in basis points
    ///
    /// # Arguments
    /// * `env` - The contract environment
    ///
    /// # Returns
    /// Platform royalty in basis points (0-10000)
    pub fn get_platform_royalty_bps(env: Env) -> u32 {
        get_platform_royalty_bps(&env).unwrap_or(1000) // Default 10%
    }

    /// Return the contract's public metadata and current platform fee.
    ///
    /// `platform_fee` is reported in basis points and uses the platform
    /// royalty configuration already stored by `initialize`.
    pub fn contract_info(env: Env) -> ContractInfo {
        ContractInfo {
            name: soroban_sdk::String::from_str(&env, "ClipCash NFT"),
            symbol: soroban_sdk::String::from_str(&env, "CLIP"),
            version: soroban_sdk::String::from_str(&env, env!("CARGO_PKG_VERSION")),
            owner: get_owner(&env).expect("Owner not initialized"),
            platform_fee: get_platform_royalty_bps(&env).unwrap_or(1000),
        }
    }

    /// Update royalty configuration (owner only)
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `creator_royalty_bps` - New creator royalty in basis points
    /// * `platform_royalty_bps` - New platform royalty in basis points
    ///
    /// # Returns
    /// `Result<(), ContractError>` - Success or error
    pub fn update_royalty_config(
        env: Env,
        creator_royalty_bps: u32,
        platform_royalty_bps: u32,
    ) -> Result<(), ContractError> {
        let owner = get_owner(&env).ok_or(ContractError::NotInitialized)?;
        owner.require_auth();

        // Validate new royalty basis points
        if creator_royalty_bps > 10000 || platform_royalty_bps > 10000 {
            return Err(ContractError::InvalidRoyaltyBps);
        }

        if creator_royalty_bps + platform_royalty_bps > 10000 {
            return Err(ContractError::RoyaltyExceedsCap);
        }

        // Update configuration
        set_creator_royalty_bps(&env, creator_royalty_bps);
        set_platform_royalty_bps(&env, platform_royalty_bps);

        // Emit update event
        env.events().publish(
            ("ClipCashNFT", Symbol::new(&env, "royalty_config_updated")),
            (creator_royalty_bps, platform_royalty_bps),
        );

        Ok(())
    }

    /// Transfer ownership to a new owner (owner only)
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `new_owner` - The new owner's address
    ///
    /// # Returns
    /// `Result<(), ContractError>` - Success or error
    pub fn transfer_ownership(env: Env, new_owner: Address) -> Result<(), ContractError> {
        let current_owner = get_owner(&env).ok_or(ContractError::NotInitialized)?;
        current_owner.require_auth();

        // Update owner
        set_owner(&env, &new_owner);

        // Emit ownership transfer event
        env.events().publish(
            ("ClipCashNFT", Symbol::new(&env, "ownership_transferred")),
            (current_owner, new_owner),
        );

        Ok(())
    }

    // -----------------------------------------------------------------------
    // Tokens: mint, transfer, burn, ownership and supply
    // -----------------------------------------------------------------------

    /// Mint a clip NFT to `to` (owner only) and return its token ID.
    ///
    /// IDs start at 1 and are never reused, even after a burn. `creator` is
    /// credited with the token and is its initial royalty recipient. Increments
    /// `total_supply` and adds the token to `to`'s ownership list.
    ///
    /// Emits `Mint` with topics `(token_id, to)` and value `uri`.
    pub fn mint(
        env: Env,
        to: Address,
        creator: Address,
        uri: String,
    ) -> Result<u32, ContractError> {
        Self::require_owner(&env)?;

        let token_id = storage::next_token_id(&env)?;
        storage::set_token_owner(&env, token_id, &to);
        storage::set_token_creator(&env, token_id, &creator);
        storage::set_token_uri(&env, token_id, &uri);
        storage::set_royalty_recipient(&env, token_id, &creator);
        storage::add_owned(&env, &to, token_id)?;
        storage::increment_supply(&env)?;

        env.events()
            .publish((Symbol::new(&env, "Mint"), token_id, to), uri);
        Ok(token_id)
    }

    /// Transfer a token from `from` to `to`. `from` must own it and sign.
    ///
    /// Moves the token between the two ownership lists. Transferring to
    /// yourself changes nothing and emits no event. Emits `Transfer` with
    /// topics `(token_id, from, to)`.
    pub fn transfer(
        env: Env,
        from: Address,
        to: Address,
        token_id: u32,
    ) -> Result<(), ContractError> {
        from.require_auth();

        let current = storage::get_token_owner(&env, token_id).ok_or(ContractError::NotFound)?;
        if current != from {
            return Err(ContractError::Unauthorized);
        }
        if from == to {
            return Ok(());
        }

        storage::remove_owned(&env, &from, token_id)?;
        storage::add_owned(&env, &to, token_id)?;
        storage::set_token_owner(&env, token_id, &to);

        env.events()
            .publish((Symbol::new(&env, "Transfer"), token_id, from, to), ());
        Ok(())
    }

    /// Burn a token. `owner` must own it and sign.
    ///
    /// Removes it from the ownership list and decrements `total_supply`. The
    /// token's royalty recipient and unclaimed balance are kept, so royalties
    /// accrued before the burn can still be claimed. Emits `Burn` with topics
    /// `(token_id, owner)`.
    pub fn burn(env: Env, owner: Address, token_id: u32) -> Result<(), ContractError> {
        owner.require_auth();

        let current = storage::get_token_owner(&env, token_id).ok_or(ContractError::NotFound)?;
        if current != owner {
            return Err(ContractError::Unauthorized);
        }

        storage::remove_owned(&env, &owner, token_id)?;
        storage::remove_token(&env, token_id);
        storage::decrement_supply(&env)?;

        env.events()
            .publish((Symbol::new(&env, "Burn"), token_id, owner), ());
        Ok(())
    }

    /// Current owner of a token. Errors with `NotFound` for IDs that were never
    /// minted or have been burned.
    pub fn owner_of(env: Env, token_id: u32) -> Result<Address, ContractError> {
        storage::get_token_owner(&env, token_id).ok_or(ContractError::NotFound)
    }

    /// Metadata URI of a token, or `NotFound`.
    pub fn token_uri(env: Env, token_id: u32) -> Result<String, ContractError> {
        storage::get_token_uri(&env, token_id).ok_or(ContractError::NotFound)
    }

    /// Number of tokens currently in existence: minted minus burned.
    ///
    /// Read-only. Moves only in `mint` (+1) and `burn` (-1); transfers never
    /// change it.
    pub fn total_supply(env: Env) -> u32 {
        storage::total_supply(&env)
    }

    /// One page of the tokens `owner` holds.
    ///
    /// * `limit`  - page size; clamped to `1..=100`.
    /// * `cursor` - 0-based offset into the owner's list; pass `0` for the
    ///   first page and each page's `next_cursor` afterwards.
    ///
    /// Reads at most `limit` entries however many tokens the owner holds, so a
    /// very large holding costs the same per page as a small one. An owner with
    /// no tokens, or a `cursor` at or past the end, returns an empty page with
    /// `next_cursor: None`. The list is reordered when a token is transferred
    /// away or burned (swap-remove), so a cursor is only reliable while the
    /// owner's holdings do not change between calls.
    pub fn get_user_tokens(env: Env, owner: Address, limit: u32, cursor: u32) -> UserTokensPage {
        let total = storage::owned_count(&env, &owner);
        let limit = limit.clamp(1, storage::MAX_PAGE_SIZE);

        let mut tokens = Vec::new(&env);
        if cursor >= total {
            return UserTokensPage {
                tokens,
                next_cursor: None,
                total,
            };
        }

        let end = cursor.saturating_add(limit).min(total);
        for index in cursor..end {
            if let Some(token_id) = storage::owned_at(&env, &owner, index) {
                tokens.push_back(token_id);
            }
        }
        UserTokensPage {
            tokens,
            next_cursor: if end < total { Some(end) } else { None },
            total,
        }
    }

    // -----------------------------------------------------------------------
    // Royalties: asset, recipient, deposits and claims
    // -----------------------------------------------------------------------

    /// Set the asset (token contract) royalties are paid and claimed in
    /// (owner only).
    pub fn set_royalty_asset(env: Env, asset: Address) -> Result<(), ContractError> {
        let owner = Self::require_owner(&env)?;
        storage::set_royalty_asset(&env, &asset);
        env.events().publish(
            (
                Symbol::new(&env, "ConfigurationUpdated"),
                Symbol::new(&env, "royalty_asset"),
                owner,
            ),
            asset,
        );
        Ok(())
    }

    /// The configured royalty asset, if any.
    pub fn get_royalty_asset(env: Env) -> Option<Address> {
        storage::get_royalty_asset(&env)
    }

    /// Change who may claim a token's royalties. The current recipient must
    /// sign. Balances already accrued move with the recipient.
    pub fn set_royalty_recipient(
        env: Env,
        token_id: u32,
        new_recipient: Address,
    ) -> Result<(), ContractError> {
        let current =
            storage::get_royalty_recipient(&env, token_id).ok_or(ContractError::NotFound)?;
        current.require_auth();
        storage::set_royalty_recipient(&env, token_id, &new_recipient);
        env.events().publish(
            (Symbol::new(&env, "RoyaltyUpdated"), token_id),
            (current, new_recipient),
        );
        Ok(())
    }

    /// Credit `amount` of the royalty asset to a token's royalty balance.
    ///
    /// `payer` signs and the asset moves from `payer` into this contract, so
    /// every credited unit is backed by tokens the contract holds. The amount
    /// is whatever the sale computed as royalty; the contract does not
    /// recompute it from the basis points. Emits `RoyaltyPaid` with topics
    /// `(token_id, payer, recipient)` and value `(amount, asset)`.
    pub fn deposit_royalty(
        env: Env,
        payer: Address,
        token_id: u32,
        amount: i128,
    ) -> Result<(), ContractError> {
        payer.require_auth();
        if amount <= 0 {
            return Err(ContractError::InvalidAmount);
        }
        let recipient =
            storage::get_royalty_recipient(&env, token_id).ok_or(ContractError::NotFound)?;
        let asset = storage::get_royalty_asset(&env).ok_or(ContractError::RoyaltyAssetNotSet)?;

        let balance = storage::get_royalty_balance(&env, token_id)
            .checked_add(amount)
            .ok_or(ContractError::Overflow)?;
        storage::set_royalty_balance(&env, token_id, balance);

        token::Client::new(&env, &asset).transfer(&payer, &env.current_contract_address(), &amount);

        env.events().publish(
            (Symbol::new(&env, "RoyaltyPaid"), token_id, payer, recipient),
            (amount, asset),
        );
        Ok(())
    }

    /// Royalties `recipient` could claim for a token right now. Zero when
    /// `recipient` is not the token's royalty recipient. Read-only.
    pub fn get_claimable_royalties(env: Env, token_id: u32, recipient: Address) -> i128 {
        match storage::get_royalty_recipient(&env, token_id) {
            Some(current) if current == recipient => storage::get_royalty_balance(&env, token_id),
            _ => 0,
        }
    }

    /// Pay out a token's accrued royalties to its royalty recipient and return
    /// the amount.
    ///
    /// The recipient stored for the token must authorize the call, so nobody
    /// else can trigger or redirect the payout. The balance is reset to zero
    /// before the transfer, which makes a second call fail with
    /// `NoRoyaltiesToClaim` instead of paying twice. Emits `RoyaltyClaimed`
    /// with topics `(token_id, recipient)` and value `(amount, asset)`.
    ///
    /// # Errors
    /// * `NotFound`            - the token never existed.
    /// * `NoRoyaltiesToClaim`  - nothing is owed.
    /// * `RoyaltyAssetNotSet`  - no royalty asset is configured.
    pub fn claim_royalties(env: Env, token_id: u32) -> Result<i128, ContractError> {
        let recipient =
            storage::get_royalty_recipient(&env, token_id).ok_or(ContractError::NotFound)?;
        recipient.require_auth();

        let amount = storage::get_royalty_balance(&env, token_id);
        if amount <= 0 {
            return Err(ContractError::NoRoyaltiesToClaim);
        }
        let asset = storage::get_royalty_asset(&env).ok_or(ContractError::RoyaltyAssetNotSet)?;

        // Effects before the external call: reset the balance first.
        storage::set_royalty_balance(&env, token_id, 0);

        token::Client::new(&env, &asset).transfer(&env.current_contract_address(), &recipient, &amount);

        env.events().publish(
            (Symbol::new(&env, "RoyaltyClaimed"), token_id, recipient),
            (amount, asset),
        );
        Ok(amount)
    }

    // -----------------------------------------------------------------------
    // Versioning, upgrades and migration
    // -----------------------------------------------------------------------

    /// Contract version, taken from `Cargo.toml` at build time. Read-only.
    pub fn version(env: Env) -> String {
        String::from_str(&env, env!("CARGO_PKG_VERSION"))
    }

    /// Schema version of the stored layout: 1 before tokens existed, 2 now.
    /// After an upgrade this stays at the old value until `migrate` runs.
    pub fn schema_version(env: Env) -> u32 {
        storage::schema_version(&env)
    }

    /// Replace this contract's WASM in place (owner only).
    ///
    /// The address and all storage are kept, so ownership, metadata, royalties
    /// and configuration survive. Run `migrate` afterwards if the new code
    /// bumped the schema. Upload the WASM first (`stellar contract upload`) and
    /// pass the hash it prints. Emits `ConfigurationUpdated` for `wasm_hash`.
    pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) -> Result<(), ContractError> {
        let owner = Self::require_owner(&env)?;
        env.deployer()
            .update_current_contract_wasm(new_wasm_hash.clone());
        env.events().publish(
            (
                Symbol::new(&env, "ConfigurationUpdated"),
                Symbol::new(&env, "wasm_hash"),
                owner,
            ),
            new_wasm_hash,
        );
        Ok(())
    }

    /// Bring stored data up to the schema this code expects (owner only) and
    /// return the new schema version.
    ///
    /// 1 -> 2 writes the token counters (`NextTokenId` 1, `TotalSupply` 0) if
    /// they are missing and records the schema version. It changes no existing
    /// entry: the owner, royalty configuration and anything else already stored
    /// are left as they are. Errors with `AlreadyMigrated` when storage is
    /// already current, so it cannot be applied twice.
    pub fn migrate(env: Env) -> Result<u32, ContractError> {
        let owner = Self::require_owner(&env)?;
        let from = storage::schema_version(&env);
        if from >= storage::CURRENT_SCHEMA_VERSION {
            return Err(ContractError::AlreadyMigrated);
        }

        storage::init_counters(&env);
        storage::set_schema_version(&env, storage::CURRENT_SCHEMA_VERSION);

        env.events().publish(
            (
                Symbol::new(&env, "ConfigurationUpdated"),
                Symbol::new(&env, "schema_version"),
                owner,
            ),
            (from, storage::CURRENT_SCHEMA_VERSION),
        );
        Ok(storage::CURRENT_SCHEMA_VERSION)
    }

    /// Load the owner and require their signature.
    fn require_owner(env: &Env) -> Result<Address, ContractError> {
        let owner = get_owner(env).ok_or(ContractError::NotInitialized)?;
        owner.require_auth();
        Ok(owner)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::Address as _;

    /// Registers and initializes the contract. Tests build their own client
    /// from the returned ID so it can borrow the returned `Env`.
    fn setup() -> (Env, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, ClipCashNFT);
        let owner = Address::generate(&env);
        ClipCashNFTClient::new(&env, &contract_id).initialize(&owner, &250, &500);
        (env, contract_id, owner)
    }

    fn uri(env: &Env) -> String {
        String::from_str(env, "ipfs://clip")
    }

    #[test]
    fn test_initialization() {
        let (env, contract_id, owner) = setup();
        let client = ClipCashNFTClient::new(&env, &contract_id);

        let info = client.contract_info();
        assert_eq!(info.name, String::from_str(&env, "ClipCash NFT"));
        assert_eq!(info.symbol, String::from_str(&env, "CLIP"));
        assert_eq!(info.version, String::from_str(&env, env!("CARGO_PKG_VERSION")));
        assert_eq!(info.owner, owner);
        assert_eq!(info.platform_fee, 500);
        assert_eq!(client.version(), info.version);
        assert_eq!(client.schema_version(), 2);
        assert_eq!(client.total_supply(), 0);
    }

    #[test]
    fn mint_tracks_ownership_and_supply() {
        let (env, contract_id, _) = setup();
        let client = ClipCashNFTClient::new(&env, &contract_id);
        let alice = Address::generate(&env);

        let first = client.mint(&alice, &alice, &uri(&env));
        let second = client.mint(&alice, &alice, &uri(&env));

        assert_eq!((first, second), (1, 2));
        assert_eq!(client.total_supply(), 2);
        assert_eq!(client.owner_of(&1), alice);
        assert_eq!(client.get_user_tokens(&alice, &10, &0).total, 2);
    }

    #[test]
    fn transfer_moves_token_between_owner_lists_without_changing_supply() {
        let (env, contract_id, _) = setup();
        let client = ClipCashNFTClient::new(&env, &contract_id);
        let alice = Address::generate(&env);
        let bob = Address::generate(&env);
        for _ in 0..3 {
            client.mint(&alice, &alice, &uri(&env));
        }

        client.transfer(&alice, &bob, &1);

        assert_eq!(client.total_supply(), 3);
        assert_eq!(client.owner_of(&1), bob);
        // Token 3 filled the slot token 1 left (swap-remove).
        assert_eq!(client.get_user_tokens(&alice, &10, &0).tokens, soroban_sdk::vec![&env, 3, 2]);
        assert_eq!(client.get_user_tokens(&bob, &10, &0).tokens, soroban_sdk::vec![&env, 1]);
        assert_eq!(
            client.try_transfer(&alice, &bob, &1),
            Err(Ok(ContractError::Unauthorized))
        );
    }

    #[test]
    fn burn_decrements_supply_and_removes_the_token() {
        let (env, contract_id, _) = setup();
        let client = ClipCashNFTClient::new(&env, &contract_id);
        let alice = Address::generate(&env);
        client.mint(&alice, &alice, &uri(&env));
        client.mint(&alice, &alice, &uri(&env));

        client.burn(&alice, &1);

        assert_eq!(client.total_supply(), 1);
        assert_eq!(client.try_owner_of(&1), Err(Ok(ContractError::NotFound)));
        assert_eq!(client.get_user_tokens(&alice, &10, &0).tokens, soroban_sdk::vec![&env, 2]);
        // IDs are not reused.
        assert_eq!(client.mint(&alice, &alice, &uri(&env)), 3);
        assert_eq!(client.total_supply(), 2);
    }

    #[test]
    fn get_user_tokens_pages_with_a_cursor() {
        let (env, contract_id, _) = setup();
        let client = ClipCashNFTClient::new(&env, &contract_id);
        let alice = Address::generate(&env);
        for _ in 0..5 {
            client.mint(&alice, &alice, &uri(&env));
        }

        let page = client.get_user_tokens(&alice, &2, &0);
        assert_eq!(page.tokens, soroban_sdk::vec![&env, 1, 2]);
        assert_eq!(page.next_cursor, Some(2));
        assert_eq!(page.total, 5);

        let page = client.get_user_tokens(&alice, &2, &2);
        assert_eq!(page.tokens, soroban_sdk::vec![&env, 3, 4]);
        assert_eq!(page.next_cursor, Some(4));

        let page = client.get_user_tokens(&alice, &2, &4);
        assert_eq!(page.tokens, soroban_sdk::vec![&env, 5]);
        assert_eq!(page.next_cursor, None);

        // A limit of 0 is raised to 1; a huge limit is capped at 100.
        assert_eq!(client.get_user_tokens(&alice, &0, &0).tokens.len(), 1);
        assert_eq!(client.get_user_tokens(&alice, &u32::MAX, &0).tokens.len(), 5);
    }

    #[test]
    fn get_user_tokens_handles_empty_and_out_of_range() {
        let (env, contract_id, _) = setup();
        let client = ClipCashNFTClient::new(&env, &contract_id);
        let alice = Address::generate(&env);
        let nobody = Address::generate(&env);
        client.mint(&alice, &alice, &uri(&env));

        let empty = client.get_user_tokens(&nobody, &10, &0);
        assert_eq!(empty.tokens.len(), 0);
        assert_eq!(empty.next_cursor, None);
        assert_eq!(empty.total, 0);

        let past_end = client.get_user_tokens(&alice, &10, &7);
        assert_eq!(past_end.tokens.len(), 0);
        assert_eq!(past_end.next_cursor, None);
        assert_eq!(past_end.total, 1);
    }

    #[test]
    fn claim_royalties_pays_the_recipient_once() {
        let (env, contract_id, _) = setup();
        let client = ClipCashNFTClient::new(&env, &contract_id);
        let creator = Address::generate(&env);
        let payer = Address::generate(&env);
        let asset_admin = Address::generate(&env);
        let asset = env.register_stellar_asset_contract_v2(asset_admin).address();
        token::StellarAssetClient::new(&env, &asset).mint(&payer, &1_000);

        client.set_royalty_asset(&asset);
        let token_id = client.mint(&creator, &creator, &uri(&env));
        client.deposit_royalty(&payer, &token_id, &400);
        client.deposit_royalty(&payer, &token_id, &100);
        assert_eq!(client.get_claimable_royalties(&token_id, &creator), 500);
        assert_eq!(client.get_claimable_royalties(&token_id, &payer), 0);

        assert_eq!(client.claim_royalties(&token_id), 500);

        // The recipient signed the claim.
        assert_eq!(env.auths()[0].0, creator);
        let asset_client = token::Client::new(&env, &asset);
        assert_eq!(asset_client.balance(&creator), 500);
        assert_eq!(asset_client.balance(&contract_id), 0);
        assert_eq!(client.get_claimable_royalties(&token_id, &creator), 0);

        // A second claim finds nothing owed and pays nothing.
        assert_eq!(
            client.try_claim_royalties(&token_id),
            Err(Ok(ContractError::NoRoyaltiesToClaim))
        );
        assert_eq!(asset_client.balance(&creator), 500);
    }

    #[test]
    fn claim_royalties_follows_the_current_recipient_and_survives_burn() {
        let (env, contract_id, _) = setup();
        let client = ClipCashNFTClient::new(&env, &contract_id);
        let creator = Address::generate(&env);
        let new_recipient = Address::generate(&env);
        let payer = Address::generate(&env);
        let asset = env
            .register_stellar_asset_contract_v2(Address::generate(&env))
            .address();
        token::StellarAssetClient::new(&env, &asset).mint(&payer, &1_000);
        client.set_royalty_asset(&asset);

        let token_id = client.mint(&creator, &creator, &uri(&env));
        client.deposit_royalty(&payer, &token_id, &300);
        client.set_royalty_recipient(&token_id, &new_recipient);
        client.burn(&creator, &token_id);

        assert_eq!(client.get_claimable_royalties(&token_id, &creator), 0);
        assert_eq!(client.claim_royalties(&token_id), 300);
        assert_eq!(token::Client::new(&env, &asset).balance(&new_recipient), 300);
    }

    #[test]
    fn claim_royalties_rejects_unknown_tokens_and_missing_asset() {
        let (env, contract_id, _) = setup();
        let client = ClipCashNFTClient::new(&env, &contract_id);
        let creator = Address::generate(&env);

        assert_eq!(client.try_claim_royalties(&99), Err(Ok(ContractError::NotFound)));

        let token_id = client.mint(&creator, &creator, &uri(&env));
        assert_eq!(
            client.try_claim_royalties(&token_id),
            Err(Ok(ContractError::NoRoyaltiesToClaim))
        );
        assert_eq!(
            client.try_deposit_royalty(&creator, &token_id, &10),
            Err(Ok(ContractError::RoyaltyAssetNotSet))
        );
        assert_eq!(
            client.try_deposit_royalty(&creator, &token_id, &0),
            Err(Ok(ContractError::InvalidAmount))
        );
    }

    #[test]
    fn migrate_upgrades_schema_one_once_and_keeps_existing_state() {
        let (env, contract_id, owner) = setup();
        let client = ClipCashNFTClient::new(&env, &contract_id);
        let alice = Address::generate(&env);
        client.mint(&alice, &alice, &uri(&env));

        // Already current: nothing to do.
        assert_eq!(client.try_migrate(), Err(Ok(ContractError::AlreadyMigrated)));

        // Put the contract back into the schema-1 shape (no counters, no marker).
        env.as_contract(&contract_id, || {
            let instance = env.storage().instance();
            instance.remove(&DataKey::SchemaVersion);
            instance.remove(&DataKey::NextTokenId);
            instance.remove(&DataKey::TotalSupply);
        });
        assert_eq!(client.schema_version(), 1);

        assert_eq!(client.migrate(), 2);
        assert_eq!(client.schema_version(), 2);
        assert_eq!(client.get_owner(), owner);
        assert_eq!(client.get_creator_royalty_bps(), 250);
        assert_eq!(client.get_platform_royalty_bps(), 500);
        assert_eq!(client.try_migrate(), Err(Ok(ContractError::AlreadyMigrated)));
    }
}
