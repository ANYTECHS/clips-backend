#![cfg(test)]

use crate::{ClipsNftContract, ClipsNftContractClient, Error, TokenData};
use soroban_sdk::{testutils::Address as _, Address, Env, String};

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/// Stand up a fresh environment, register the contract, and return a
/// ready-to-use client together with the contract's own address.
fn setup_env() -> (Env, Address, ClipsNftContractClient<'static>) {
    let env = Env::default();
    let contract_id = env.register_contract(None, ClipsNftContract);
    let client = ClipsNftContractClient::new(&env, &contract_id);
    (env, contract_id, client)
}

/// Shorthand: create a `soroban_sdk::String` from a `&str`.
fn s(env: &Env, v: &str) -> String {
    String::from_str(env, v)
}

// ─────────────────────────────────────────────────────────────
// Initialization
// ─────────────────────────────────────────────────────────────

#[test]
fn test_initialize_succeeds_once() {
    let (env, _cid, client) = setup_env();
    let admin = Address::generate(&env);
    client.initialize(&admin);
}

#[test]
fn test_initialize_rejects_double_init() {
    let (env, _cid, client) = setup_env();
    let admin = Address::generate(&env);
    client.initialize(&admin);

    let result = client.try_initialize(&admin);
    assert_eq!(
        result.unwrap_err().unwrap(),
        Error::AlreadyInitialized,
        "second initialize must return AlreadyInitialized"
    );
}

// ─────────────────────────────────────────────────────────────
// Mint — success paths
// ─────────────────────────────────────────────────────────────

#[test]
fn test_mint_regular_token() {
    let (env, _cid, client) = setup_env();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);

    client.initialize(&admin);
    env.mock_all_auths();

    client.mint(&owner, &1, &s(&env, "clip_001"), &s(&env, "https://clips.cash/1"), &false);

    assert_eq!(client.owner_of(&1), Some(owner.clone()), "owner should be set");
    assert!(!client.is_soulbound(&1), "should NOT be soulbound");
    assert_eq!(client.balance_of(&owner), 1, "owner balance should be 1");
    assert_eq!(client.total_supply(), 1, "total supply should increment");
}

#[test]
fn test_mint_soulbound_token() {
    let (env, _cid, client) = setup_env();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);

    client.initialize(&admin);
    env.mock_all_auths();

    client.mint(&owner, &2, &s(&env, "clip_002"), &s(&env, "https://clips.cash/2"), &true);

    assert_eq!(client.owner_of(&2), Some(owner.clone()));
    assert!(client.is_soulbound(&2), "token MUST be soulbound");

    let td = client.get_token_data(&2).unwrap();
    assert_eq!(td.is_soulbound, true);
    assert_eq!(td.creator, owner, "creator must equal initial recipient");
}

#[test]
fn test_mint_multiple_tokens_increments_supply() {
    let (env, _cid, client) = setup_env();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);

    client.initialize(&admin);
    env.mock_all_auths();

    let ids: [(u64, &str, &str); 5] = [
        (1, "clip_001", "https://clips.cash/1"),
        (2, "clip_002", "https://clips.cash/2"),
        (3, "clip_003", "https://clips.cash/3"),
        (4, "clip_004", "https://clips.cash/4"),
        (5, "clip_005", "https://clips.cash/5"),
    ];
    for (i, cid_str, uri_str) in ids {
        client.mint(&owner, &i, &s(&env, cid_str), &s(&env, uri_str), &false);
    }

    assert_eq!(client.total_supply(), 5);
    assert_eq!(client.balance_of(&owner), 5);
}

// ─────────────────────────────────────────────────────────────
// Mint — duplicate prevention
// ─────────────────────────────────────────────────────────────

#[test]
fn test_mint_duplicate_token_id_is_rejected() {
    let (env, _cid, client) = setup_env();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);

    client.initialize(&admin);
    env.mock_all_auths();

    // First mint succeeds.
    client.mint(&owner, &99, &s(&env, "dup"), &s(&env, "uri://dup"), &false);

    // Second mint with the same token_id must fail with InvalidTokenId.
    let result = client.try_mint(
        &owner,
        &99,
        &s(&env, "dup2"),
        &s(&env, "uri://dup2"),
        &false,
    );
    assert_eq!(
        result.unwrap_err().unwrap(),
        Error::InvalidTokenId,
        "duplicate token_id must return InvalidTokenId"
    );

    // Supply must not have changed.
    assert_eq!(client.total_supply(), 1);
}

// ─────────────────────────────────────────────────────────────
// Mint — access control (unauthorized mint)
// ─────────────────────────────────────────────────────────────

#[test]
fn test_mint_requires_admin_authorization() {
    let (env, _cid, client) = setup_env();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);

    client.initialize(&admin);
    // Intentionally do NOT call env.mock_all_auths() — no auth will be provided.

    let result = client.try_mint(
        &owner,
        &1,
        &s(&env, "clip_unauth"),
        &s(&env, "uri://unauth"),
        &false,
    );
    assert!(
        result.is_err(),
        "mint without admin auth must fail"
    );
}

#[test]
fn test_mint_not_initialized_is_rejected() {
    let env = Env::default();
    let cid = env.register_contract(None, ClipsNftContract);
    let client = ClipsNftContractClient::new(&env, &cid);

    // Contract never initialized — no admin set.
    env.mock_all_auths();
    let owner = Address::generate(&env);

    let result = client.try_mint(
        &owner,
        &1,
        &s(&env, "clip_x"),
        &s(&env, "uri://x"),
        &false,
    );
    assert_eq!(
        result.unwrap_err().unwrap(),
        Error::NotInitialized,
        "mint before initialize must return NotInitialized"
    );
}

// ─────────────────────────────────────────────────────────────
// Royalty BPS — read/write
// ─────────────────────────────────────────────────────────────

#[test]
fn test_royalty_bps_unset_returns_none() {
    let (env, _cid, client) = setup_env();
    let admin = Address::generate(&env);
    client.initialize(&admin);

    assert_eq!(
        client.get_default_royalty_bps(),
        None,
        "royalty must be None before any write"
    );
}

#[test]
fn test_set_and_get_royalty_bps() {
    let (env, _cid, client) = setup_env();
    let admin = Address::generate(&env);
    client.initialize(&admin);
    env.mock_all_auths();

    client.set_default_royalty_bps(&1000);
    assert_eq!(client.get_default_royalty_bps(), Some(1000));
}

#[test]
fn test_royalty_bps_zero_is_valid() {
    let (env, _cid, client) = setup_env();
    let admin = Address::generate(&env);
    client.initialize(&admin);
    env.mock_all_auths();

    client.set_default_royalty_bps(&0);
    assert_eq!(client.get_default_royalty_bps(), Some(0));
}

#[test]
fn test_royalty_bps_max_boundary_is_valid() {
    let (env, _cid, client) = setup_env();
    let admin = Address::generate(&env);
    client.initialize(&admin);
    env.mock_all_auths();

    // 10 000 BPS == 100% — must be accepted.
    client.set_default_royalty_bps(&10_000);
    assert_eq!(client.get_default_royalty_bps(), Some(10_000));
}

#[test]
fn test_royalty_bps_above_max_is_rejected() {
    let (env, _cid, client) = setup_env();
    let admin = Address::generate(&env);
    client.initialize(&admin);
    env.mock_all_auths();

    let result = client.try_set_default_royalty_bps(&10_001);
    assert_eq!(
        result.unwrap_err().unwrap(),
        Error::InvalidRoyaltyBps,
        "10 001 BPS must return InvalidRoyaltyBps"
    );
}

#[test]
fn test_royalty_bps_update_overwrites_previous_value() {
    let (env, _cid, client) = setup_env();
    let admin = Address::generate(&env);
    client.initialize(&admin);
    env.mock_all_auths();

    client.set_default_royalty_bps(&500);
    assert_eq!(client.get_default_royalty_bps(), Some(500));

    client.set_default_royalty_bps(&1500);
    assert_eq!(client.get_default_royalty_bps(), Some(1500));
}

#[test]
fn test_royalty_bps_requires_admin_auth() {
    let (env, _cid, client) = setup_env();
    let admin = Address::generate(&env);
    client.initialize(&admin);
    // No mock_all_auths — auth check must fail.

    let result = client.try_set_default_royalty_bps(&500);
    assert!(
        result.is_err(),
        "set_default_royalty_bps without admin auth must fail"
    );
}

#[test]
fn test_royalty_bps_not_initialized_is_rejected() {
    let env = Env::default();
    let cid = env.register_contract(None, ClipsNftContract);
    let client = ClipsNftContractClient::new(&env, &cid);

    env.mock_all_auths();
    let result = client.try_set_default_royalty_bps(&1000);
    assert_eq!(
        result.unwrap_err().unwrap(),
        Error::NotInitialized,
    );
}

// ─────────────────────────────────────────────────────────────
// Royalty calculation — pure math verification
//
// BPS = basis points; 1 BPS = 0.01%.
// royalty_amount = sale_price * bps / 10_000
// ─────────────────────────────────────────────────────────────

#[test]
fn test_royalty_calculation_ten_percent() {
    // 1000 BPS = 10%. On a 500 unit sale the royalty must be 50.
    let sale_price: u64 = 500;
    let bps: u64 = 1000;
    let royalty = sale_price * bps / 10_000;
    assert_eq!(royalty, 50);
}

#[test]
fn test_royalty_calculation_two_and_half_percent() {
    // 250 BPS = 2.5%. On a 200 unit sale the royalty must be 5.
    let sale_price: u64 = 200;
    let bps: u64 = 250;
    let royalty = sale_price * bps / 10_000;
    assert_eq!(royalty, 5);
}

#[test]
fn test_royalty_calculation_zero_bps_yields_zero() {
    let sale_price: u64 = 1_000_000;
    let bps: u64 = 0;
    let royalty = sale_price * bps / 10_000;
    assert_eq!(royalty, 0);
}

#[test]
fn test_royalty_calculation_full_hundred_percent() {
    // 10 000 BPS = 100%. Entire sale price is the royalty.
    let sale_price: u64 = 300;
    let bps: u64 = 10_000;
    let royalty = sale_price * bps / 10_000;
    assert_eq!(royalty, 300);
}

#[test]
fn test_royalty_calculation_one_bps_precision() {
    // 1 BPS on 10 000 units = 1 unit (integer division is exact here).
    let sale_price: u64 = 10_000;
    let bps: u64 = 1;
    let royalty = sale_price * bps / 10_000;
    assert_eq!(royalty, 1);
}

// ─────────────────────────────────────────────────────────────
// Transfer
// ─────────────────────────────────────────────────────────────

#[test]
fn test_transfer_regular_token() {
    let (env, _cid, client) = setup_env();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let recipient = Address::generate(&env);

    client.initialize(&admin);
    env.mock_all_auths();

    client.mint(&owner, &3, &s(&env, "clip_003"), &s(&env, "uri://3"), &false);
    client.transfer(&owner, &recipient, &3);

    assert_eq!(client.owner_of(&3), Some(recipient.clone()));
    assert_eq!(client.balance_of(&owner), 0);
    assert_eq!(client.balance_of(&recipient), 1);
}

#[test]
fn test_transfer_soulbound_token_is_rejected() {
    let (env, _cid, client) = setup_env();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let recipient = Address::generate(&env);

    client.initialize(&admin);
    env.mock_all_auths();

    client.mint(&owner, &4, &s(&env, "soul"), &s(&env, "uri://soul"), &true);

    let result = client.try_transfer(&owner, &recipient, &4);
    assert_eq!(
        result.unwrap_err().unwrap(),
        Error::SoulboundTokenNotTransferable
    );
}

#[test]
fn test_transfer_nonexistent_token_is_rejected() {
    let (env, _cid, client) = setup_env();
    let admin = Address::generate(&env);
    let a = Address::generate(&env);
    let b = Address::generate(&env);

    client.initialize(&admin);
    env.mock_all_auths();

    let result = client.try_transfer(&a, &b, &9999);
    assert_eq!(result.unwrap_err().unwrap(), Error::TokenNotFound);
}

#[test]
fn test_transfer_by_non_owner_is_rejected() {
    let (env, _cid, client) = setup_env();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let intruder = Address::generate(&env);
    let recipient = Address::generate(&env);

    client.initialize(&admin);
    env.mock_all_auths();

    client.mint(&owner, &5, &s(&env, "clip_005"), &s(&env, "uri://5"), &false);

    // intruder claims to be `from`
    let result = client.try_transfer(&intruder, &recipient, &5);
    assert_eq!(result.unwrap_err().unwrap(), Error::Unauthorized);
}

// ─────────────────────────────────────────────────────────────
// Approve + transfer_from
// ─────────────────────────────────────────────────────────────

#[test]
fn test_approve_and_transfer_from() {
    let (env, _cid, client) = setup_env();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let spender = Address::generate(&env);
    let recipient = Address::generate(&env);

    client.initialize(&admin);
    env.mock_all_auths();

    client.mint(&owner, &7, &s(&env, "clip_007"), &s(&env, "uri://7"), &false);
    client.approve(&owner, &spender, &7);

    assert_eq!(client.get_approved(&7), Some(spender.clone()));

    client.transfer_from(&spender, &owner, &recipient, &7);
    assert_eq!(client.owner_of(&7), Some(recipient.clone()));
    // Approval must be cleared after transfer_from.
    assert_eq!(client.get_approved(&7), None);
}

#[test]
fn test_approve_soulbound_token_is_rejected() {
    let (env, _cid, client) = setup_env();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let spender = Address::generate(&env);

    client.initialize(&admin);
    env.mock_all_auths();

    client.mint(&owner, &6, &s(&env, "soul_006"), &s(&env, "uri://6"), &true);

    let result = client.try_approve(&owner, &spender, &6);
    assert_eq!(
        result.unwrap_err().unwrap(),
        Error::SoulboundTokenNotTransferable
    );
}

#[test]
fn test_transfer_from_unapproved_spender_is_rejected() {
    let (env, _cid, client) = setup_env();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let stranger = Address::generate(&env);
    let recipient = Address::generate(&env);

    client.initialize(&admin);
    env.mock_all_auths();

    client.mint(&owner, &20, &s(&env, "clip_020"), &s(&env, "uri://20"), &false);

    // stranger was never approved.
    let result = client.try_transfer_from(&stranger, &owner, &recipient, &20);
    assert_eq!(result.unwrap_err().unwrap(), Error::Unauthorized);
}

// ─────────────────────────────────────────────────────────────
// Query helpers
// ─────────────────────────────────────────────────────────────

#[test]
fn test_owner_of_unknown_token_returns_none() {
    let (env, _cid, client) = setup_env();
    let admin = Address::generate(&env);
    client.initialize(&admin);

    assert_eq!(client.owner_of(&42), None);
}

#[test]
fn test_get_token_data_fields() {
    let (env, _cid, client) = setup_env();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);

    client.initialize(&admin);
    env.mock_all_auths();

    let clip_id = s(&env, "clip_009");
    let content_uri = s(&env, "https://clips.cash/9");
    client.mint(&owner, &9, &clip_id, &content_uri, &true);

    let td = client.get_token_data(&9).unwrap();
    assert_eq!(td.owner, owner);
    assert_eq!(td.creator, owner);
    assert_eq!(td.is_soulbound, true);
    assert_eq!(td.clip_id, clip_id);
    assert_eq!(td.content_uri, content_uri);
    assert!(td.created_at > 0);
}

#[test]
fn test_get_creator_returns_original_minter() {
    let (env, _cid, client) = setup_env();
    let admin = Address::generate(&env);
    let creator = Address::generate(&env);

    client.initialize(&admin);
    env.mock_all_auths();

    client.mint(&creator, &10, &s(&env, "clip_010"), &s(&env, "uri://10"), &false);
    assert_eq!(client.get_creator(&10), Some(creator));
}

#[test]
fn test_creator_is_preserved_after_transfer() {
    let (env, _cid, client) = setup_env();
    let admin = Address::generate(&env);
    let creator = Address::generate(&env);
    let buyer = Address::generate(&env);

    client.initialize(&admin);
    env.mock_all_auths();

    client.mint(&creator, &15, &s(&env, "clip_015"), &s(&env, "uri://15"), &false);
    client.transfer(&creator, &buyer, &15);

    // Ownership changed, but creator must remain the original minter.
    assert_eq!(client.owner_of(&15), Some(buyer));
    assert_eq!(client.get_creator(&15), Some(creator));
}

#[test]
fn test_balance_of_unknown_address_returns_zero() {
    let (env, _cid, client) = setup_env();
    let admin = Address::generate(&env);
    env.mock_all_auths(); // needed for initialize (AC-01 fix)
    client.initialize(&admin);

    let stranger = Address::generate(&env);
    assert_eq!(client.balance_of(&stranger), 0);
}

// ─────────────────────────────────────────────────────────────
// View functions — owner_of, balance_of, token_uri
// ─────────────────────────────────────────────────────────────

/// token_uri must return the content_uri supplied at mint time.
#[test]
fn test_token_uri_returns_content_uri() {
    let (env, _cid, client) = setup_env();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);

    env.mock_all_auths();
    client.initialize(&admin);

    let uri = s(&env, "ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG");
    client.mint(&owner, &50, &s(&env, "clip_050"), &uri, &false);

    assert_eq!(
        client.token_uri(&50),
        Some(uri),
        "token_uri must equal the content_uri passed to mint"
    );
}

/// token_uri for a token that was never minted must return None.
#[test]
fn test_token_uri_unknown_token_returns_none() {
    let (env, _cid, client) = setup_env();
    let admin = Address::generate(&env);
    env.mock_all_auths();
    client.initialize(&admin);

    assert_eq!(client.token_uri(&9999), None);
}

/// owner_of must return the correct owner immediately after mint.
#[test]
fn test_owner_of_returns_minted_owner() {
    let (env, _cid, client) = setup_env();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);

    env.mock_all_auths();
    client.initialize(&admin);
    client.mint(&owner, &51, &s(&env, "clip_051"), &s(&env, "uri://51"), &false);

    assert_eq!(client.owner_of(&51), Some(owner));
}

/// balance_of must increment by 1 for each token minted to the same address.
#[test]
fn test_balance_of_increments_on_each_mint() {
    let (env, _cid, client) = setup_env();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);

    env.mock_all_auths();
    client.initialize(&admin);

    assert_eq!(client.balance_of(&owner), 0, "balance before any mint must be 0");

    client.mint(&owner, &52, &s(&env, "clip_052"), &s(&env, "uri://52"), &false);
    assert_eq!(client.balance_of(&owner), 1);

    client.mint(&owner, &53, &s(&env, "clip_053"), &s(&env, "uri://53"), &false);
    assert_eq!(client.balance_of(&owner), 2);

    client.mint(&owner, &54, &s(&env, "clip_054"), &s(&env, "uri://54"), &false);
    assert_eq!(client.balance_of(&owner), 3);
}

/// After a transfer, sender balance decrements and recipient balance increments.
#[test]
fn test_balance_of_updates_correctly_on_transfer() {
    let (env, _cid, client) = setup_env();
    let admin = Address::generate(&env);
    let sender = Address::generate(&env);
    let recipient = Address::generate(&env);

    env.mock_all_auths();
    client.initialize(&admin);

    client.mint(&sender, &55, &s(&env, "clip_055"), &s(&env, "uri://55"), &false);
    client.mint(&sender, &56, &s(&env, "clip_056"), &s(&env, "uri://56"), &false);

    assert_eq!(client.balance_of(&sender), 2);
    assert_eq!(client.balance_of(&recipient), 0);

    client.transfer(&sender, &recipient, &55);

    assert_eq!(client.balance_of(&sender), 1, "sender must lose 1 after transfer");
    assert_eq!(client.balance_of(&recipient), 1, "recipient must gain 1 after transfer");
    assert_eq!(client.owner_of(&55), Some(recipient.clone()), "owner_of must reflect new owner");
    assert_eq!(client.owner_of(&56), Some(sender.clone()), "untransferred token must remain with sender");
}
