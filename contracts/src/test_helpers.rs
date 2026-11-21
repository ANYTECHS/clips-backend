//! Reusable test helpers for common contract scenarios.
//!
//! ```ignore
//! let (env, owner, client) = setup_initialized(250, 500);
//! let clip = mint_test_clip(&env, TestClipOpts::default());
//! set_test_royalty(&client, 300, 700);
//! let sale = simulate_test_sale(&client, &clip, 1_000_000);
//! assert_eq!(sale.creator_amount, 30_000);
//! ```
//! All helpers mock auths so authorization is never the failing factor
//! unless a test explicitly sets up its own auth expectations.
#![cfg(test)]

use crate::{ClipCashNFT, ClipCashNFTClient};
use soroban_sdk::{testutils::Address as _, Address, Env, String};

/// Configurable values for `mint_test_clip`.
pub struct TestClipOpts<'a> {
    pub token_id: u32,
    pub clip_id: &'a str,
    pub creator: Option<Address>,
    pub owner: Option<Address>,
}

impl Default for TestClipOpts<'_> {
    fn default() -> Self {
        Self { token_id: 1, clip_id: "clip_test", creator: None, owner: None }
    }
}

/// A test clip NFT fixture.
pub struct TestClip {
    pub token_id: u32,
    pub clip_id: String,
    pub creator: Address,
    pub owner: Address,
}

/// Outcome of `simulate_test_sale`.
pub struct TestSale {
    pub buyer: Address,
    pub price: i128,
    pub creator_amount: i128,
    pub platform_amount: i128,
    pub seller_amount: i128,
}

/// Register the contract and initialize it with a fresh owner and royalties.
pub fn setup_initialized(
    creator_bps: u32,
    platform_bps: u32,
) -> (Env, Address, ClipCashNFTClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, ClipCashNFT);
    let client = ClipCashNFTClient::new(&env, &contract_id);
    let owner = Address::generate(&env);
    client.initialize(&owner, &creator_bps, &platform_bps);
    (env, owner, client)
}

/// Build a test clip NFT fixture with configurable values.
pub fn mint_test_clip(env: &Env, opts: TestClipOpts) -> TestClip {
    let creator = opts.creator.unwrap_or_else(|| Address::generate(env));
    TestClip {
        token_id: opts.token_id,
        clip_id: String::from_str(env, opts.clip_id),
        owner: opts.owner.unwrap_or_else(|| creator.clone()),
        creator,
    }
}

/// Update creator/platform royalties (basis points) as the contract owner.
pub fn set_test_royalty(client: &ClipCashNFTClient, creator_bps: u32, platform_bps: u32) {
    client.env.mock_all_auths();
    client.update_royalty_config(&creator_bps, &platform_bps);
}

/// Simulate a sale of `clip` at `price`, splitting royalties per the contract
/// configuration. Fails with `TokenFrozen` semantics if the clip is frozen.
pub fn simulate_test_sale(client: &ClipCashNFTClient, clip: &TestClip, price: i128) -> TestSale {
    client.ensure_transferable(&clip.token_id);
    let creator_amount = price * client.get_creator_royalty_bps() as i128 / 10_000;
    let platform_amount = price * client.get_platform_royalty_bps() as i128 / 10_000;
    TestSale {
        buyer: Address::generate(&client.env),
        price,
        creator_amount,
        platform_amount,
        seller_amount: price - creator_amount - platform_amount,
    }
}
