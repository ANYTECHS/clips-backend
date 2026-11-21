//! Token, pause and burn functionality for ClipCashNFT.
//!
//! - SEP-0050 style NFT interface (owner_of, balance_of, transfer,
//!   transfer_from, approve, get_approved, name, symbol, token_uri)
//! - Contract-level pause with a human-readable reason (#1349)
//! - Burn with optional royalty refund from escrow (#1347)

use soroban_sdk::{contractimpl, contracttype, token, Address, Env, String};

// Glob import brings the contract type and its macro-generated client/args into scope.
use crate::*;

#[contracttype]
#[derive(Clone)]
pub struct TokenRoyalty {
    pub recipient: Address,
    pub bps: u32,
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

#[contracttype]
pub enum DataKey {
    TokenOwner(u128),
    TokenURI(u128),
    TokenRoyalty(u128),
    TotalSupply,
    Paused,
    PauseReason,
    Balance(Address),
    Approved(u128),
    /// Unclaimed royalty escrow: (payment token, amount)
    UnclaimedRoyalty(u128),
}

#[contractimpl]
impl ClipCashNFT {
    // ---------------------------------------------------------------
    // Standard NFT interface
    // ---------------------------------------------------------------

    /// Mint a new NFT with per-token royalty information
    pub fn mint(env: Env, to: Address, token_id: u128, uri: String, royalty_recipient: Address, royalty_bps: u32) {
        to.require_auth();
        require_not_paused(&env);
        let s = env.storage().instance();
        assert!(!s.has(&DataKey::TokenOwner(token_id)), "Token already exists");
        assert!(royalty_bps <= 1500, "Royalty BPS cannot exceed 1500 (15%)");
        s.set(&DataKey::TokenOwner(token_id), &to);
        s.set(&DataKey::TokenURI(token_id), &uri);
        s.set(&DataKey::TokenRoyalty(token_id), &TokenRoyalty { recipient: royalty_recipient, bps: royalty_bps });
        let supply: u128 = s.get(&DataKey::TotalSupply).unwrap_or(0);
        s.set(&DataKey::TotalSupply, &(supply + 1));
        adjust_balance(&env, &to, 1);
    }

    pub fn owner_of(env: Env, token_id: u128) -> Address {
        env.storage().instance().get(&DataKey::TokenOwner(token_id)).expect("Token does not exist")
    }

    pub fn token_uri(env: Env, token_id: u128) -> String {
        env.storage().instance().get(&DataKey::TokenURI(token_id)).expect("Token does not exist")
    }

    pub fn total_supply(env: Env) -> u128 {
        env.storage().instance().get(&DataKey::TotalSupply).unwrap_or(0)
    }

    pub fn balance_of(env: Env, owner: Address) -> u32 {
        env.storage().instance().get(&DataKey::Balance(owner)).unwrap_or(0)
    }

    pub fn name(env: Env) -> String {
        String::from_str(&env, "ClipCash NFT")
    }

    pub fn symbol(env: Env) -> String {
        String::from_str(&env, "CLIP")
    }

    pub fn transfer(env: Env, from: Address, to: Address, token_id: u128) {
        from.require_auth();
        do_transfer(&env, &from, &to, token_id);
    }

    pub fn transfer_from(env: Env, spender: Address, from: Address, to: Address, token_id: u128) {
        spender.require_auth();
        let approved: Option<Address> = env.storage().instance().get(&DataKey::Approved(token_id));
        assert!(approved == Some(spender), "Spender not approved");
        do_transfer(&env, &from, &to, token_id);
    }

    pub fn approve(env: Env, owner: Address, approved: Address, token_id: u128) {
        owner.require_auth();
        assert!(Self::owner_of(env.clone(), token_id) == owner, "Not the token owner");
        env.storage().instance().set(&DataKey::Approved(token_id), &approved);
    }

    pub fn get_approved(env: Env, token_id: u128) -> Option<Address> {
        env.storage().instance().get(&DataKey::Approved(token_id))
    }

    // ---------------------------------------------------------------
    // Pause with reason (contract owner only)
    // ---------------------------------------------------------------

    pub fn pause(env: Env, reason: Option<String>) {
        require_admin(&env);
        let s = env.storage().instance();
        s.set(&DataKey::Paused, &true);
        match reason {
            Some(r) => s.set(&DataKey::PauseReason, &r),
            None => s.remove(&DataKey::PauseReason),
        }
        env.events().publish((String::from_str(&env, "Paused"),), Self::pause_reason(env.clone()));
    }

    pub fn set_pause_reason(env: Env, reason: String) {
        require_admin(&env);
        assert!(Self::is_paused(env.clone()), "Contract is not paused");
        env.storage().instance().set(&DataKey::PauseReason, &reason);
    }

    pub fn unpause(env: Env) {
        require_admin(&env);
        env.storage().instance().set(&DataKey::Paused, &false);
        env.storage().instance().remove(&DataKey::PauseReason);
        env.events().publish((String::from_str(&env, "Unpaused"),), ());
    }

    pub fn is_paused(env: Env) -> bool {
        env.storage().instance().get(&DataKey::Paused).unwrap_or(false)
    }

    /// Current pause reason (empty string when none is set)
    pub fn pause_reason(env: Env) -> String {
        env.storage().instance().get(&DataKey::PauseReason).unwrap_or(String::from_str(&env, ""))
    }

    // ---------------------------------------------------------------
    // Royalty escrow + burn
    // ---------------------------------------------------------------

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

    pub fn unclaimed_royalty(env: Env, token_id: u128) -> i128 {
        let v: Option<(Address, i128)> = env.storage().instance().get(&DataKey::UnclaimedRoyalty(token_id));
        v.map(|(_, b)| b).unwrap_or(0)
    }

    /// Burn a token; with `refund_royalties` any escrowed royalties go to the
    /// royalty recipient and `Refunded` is emitted. Returns the refunded amount.
    pub fn burn(env: Env, owner: Address, token_id: u128, refund_royalties: bool) -> i128 {
        owner.require_auth();
        require_not_paused(&env);
        assert!(Self::owner_of(env.clone(), token_id) == owner, "Not the token owner");
        let s = env.storage().instance();
        let royalty: TokenRoyalty = s.get(&DataKey::TokenRoyalty(token_id)).expect("Token does not exist");

        let mut refunded: i128 = 0;
        let escrow_key = DataKey::UnclaimedRoyalty(token_id);
        let escrow: Option<(Address, i128)> = s.get(&escrow_key);
        if refund_royalties {
            if let Some((payment_token, amount)) = escrow {
                // Clear first to prevent double refunds
                s.remove(&escrow_key);
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

        s.remove(&DataKey::TokenOwner(token_id));
        s.remove(&DataKey::TokenURI(token_id));
        s.remove(&DataKey::TokenRoyalty(token_id));
        s.remove(&DataKey::Approved(token_id));
        let supply: u128 = s.get(&DataKey::TotalSupply).unwrap_or(0);
        s.set(&DataKey::TotalSupply, &supply.saturating_sub(1));
        adjust_balance(&env, &owner, -1);
        env.events().publish((String::from_str(&env, "Burned"),), token_id);
        refunded
    }
}

fn require_admin(env: &Env) {
    get_owner(env).expect("Not initialized").require_auth();
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
    require_not_paused(env);
    let s = env.storage().instance();
    let current: Address = s.get(&DataKey::TokenOwner(token_id)).expect("Token does not exist");
    assert!(&current == from, "Not the token owner");
    s.set(&DataKey::TokenOwner(token_id), to);
    s.remove(&DataKey::Approved(token_id));
    adjust_balance(env, from, -1);
    adjust_balance(env, to, 1);
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::Address as _;

    fn setup(env: &Env) -> (ClipCashNFTClient<'_>, Address) {
        env.mock_all_auths();
        let id = env.register(ClipCashNFT, ());
        let client = ClipCashNFTClient::new(env, &id);
        let admin = Address::generate(env);
        client.initialize(&admin, &1000, &500);
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
        let (client, _) = setup(&env);
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
    }

    #[test]
    fn test_burn_with_refund_and_zero_balance() {
        let env = Env::default();
        let (client, admin) = setup(&env);
        let owner = Address::generate(&env);
        let creator = Address::generate(&env);
        let sac = env.register_stellar_asset_contract_v2(admin).address();
        soroban_sdk::token::StellarAssetClient::new(&env, &sac).mint(&owner, &1_000);

        client.mint(&owner, &1, &String::from_str(&env, "ipfs://1"), &creator, &500);
        client.deposit_royalty(&owner, &1, &sac, &300);
        assert_eq!(client.unclaimed_royalty(&1), 300);
        assert_eq!(client.burn(&owner, &1, &true), 300);
        assert_eq!(token::Client::new(&env, &sac).balance(&creator), 300);
        assert_eq!(client.unclaimed_royalty(&1), 0);

        client.mint(&owner, &2, &String::from_str(&env, "ipfs://2"), &creator, &500);
        assert_eq!(client.burn(&owner, &2, &true), 0);
    }
}
