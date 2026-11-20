//! Reusable test helpers for common contract scenarios.
//!
//! Usage:
//! ```ignore
//! let (env, admin, client) = setup_initialized();
//! let owner = Address::generate(&env);
//! mint_test_clip(&env, &client, &owner, MintOpts::default());
//! set_test_royalty(&client, 500);
//! let buyer = simulate_test_sale(&env, &client, &owner, 1);
//! ```
//! All helpers call `env.mock_all_auths()` so auth is never the failing factor
//! unless a test explicitly sets up its own auth expectations.
#![cfg(test)]

use crate::{ClipsNftContract, ClipsNftContractClient};
use soroban_sdk::{testutils::Address as _, Address, Env, String};

/// Configurable values for `mint_test_clip`.
pub struct MintOpts<'a> {
    pub token_id: u64,
    pub clip_id: &'a str,
    pub content_uri: &'a str,
    pub is_soulbound: bool,
}

impl Default for MintOpts<'_> {
    fn default() -> Self {
        Self {
            token_id: 1,
            clip_id: "clip_test",
            content_uri: "https://clips.cash/clip_test",
            is_soulbound: false,
        }
    }
}

/// Register the contract and initialize it with a fresh admin.
pub fn setup_initialized() -> (Env, Address, ClipsNftContractClient<'static>) {
    let env = Env::default();
    let contract_id = env.register_contract(None, ClipsNftContract);
    let client = ClipsNftContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    client.initialize(&admin);
    env.mock_all_auths();
    (env, admin, client)
}

/// Mint a clip NFT to `to` using the given options. Returns the token id.
pub fn mint_test_clip(
    env: &Env,
    client: &ClipsNftContractClient,
    to: &Address,
    opts: MintOpts,
) -> u64 {
    env.mock_all_auths();
    client.mint(
        to,
        &opts.token_id,
        &String::from_str(env, opts.clip_id),
        &String::from_str(env, opts.content_uri),
        &opts.is_soulbound,
    );
    opts.token_id
}

/// Set the default royalty (basis points) as admin.
pub fn set_test_royalty(client: &ClipsNftContractClient, bps: u32) {
    client.env.mock_all_auths();
    client.set_default_royalty_bps(&bps);
}

/// Simulate a sale: `seller` transfers `token_id` to a newly generated buyer.
/// Returns the buyer address.
pub fn simulate_test_sale(
    env: &Env,
    client: &ClipsNftContractClient,
    seller: &Address,
    token_id: u64,
) -> Address {
    env.mock_all_auths();
    let buyer = Address::generate(env);
    client.transfer(seller, &buyer, &token_id);
    buyer
}
