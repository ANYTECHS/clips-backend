#![cfg(test)]

use crate::{ClipMetadata, ClipsNftContract, ClipsNftContractClient, Error};
use soroban_sdk::{testutils::Address as _, testutils::Ledger as _, Address, BytesN, Env, String, Vec};


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
    // AC-01 fix: admin must authorise its own appointment.
    env.mock_all_auths();
    client.initialize(&admin);
}

#[test]
fn test_initialize_requires_admin_auth() {
    // AC-01 regression test: initialize without admin auth must fail.
    let (env, _cid, client) = setup_env();
    let admin = Address::generate(&env);
    // Intentionally do NOT call env.mock_all_auths().
    let result = client.try_initialize(&admin);
    assert!(
        result.is_err(),
        "initialize without admin auth must fail (AC-01 frontrunning prevention)"
    );
}

#[test]
fn test_initialize_rejects_double_init() {
    let (env, _cid, client) = setup_env();
    let admin = Address::generate(&env);
    env.mock_all_auths();
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

    env.mock_all_auths();
    client.initialize(&admin);

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

    env.mock_all_auths();
    client.initialize(&admin);

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

    env.mock_all_auths();
    client.initialize(&admin);

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

    env.mock_all_auths();
    client.initialize(&admin);

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

    // admin.require_auth() is now enforced by initialize (AC-01 fix).
    env.mock_all_auths();
    client.initialize(&admin);
    // Clear recorded auths so subsequent calls have no auth — as intended by this test.
    env.mock_auths(&[]);
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
    env.mock_all_auths(); // needed for initialize (AC-01 fix)
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
    env.mock_all_auths();
    client.initialize(&admin);

    client.set_default_royalty_bps(&1000);
    assert_eq!(client.get_default_royalty_bps(), Some(1000));
}

#[test]
fn test_royalty_bps_zero_is_valid() {
    let (env, _cid, client) = setup_env();
    let admin = Address::generate(&env);
    env.mock_all_auths();
    client.initialize(&admin);

    client.set_default_royalty_bps(&0);
    assert_eq!(client.get_default_royalty_bps(), Some(0));
}

#[test]
fn test_royalty_bps_max_boundary_is_valid() {
    let (env, _cid, client) = setup_env();
    let admin = Address::generate(&env);
    env.mock_all_auths();
    client.initialize(&admin);

    // 10 000 BPS == 100% — must be accepted.
    client.set_default_royalty_bps(&10_000);
    assert_eq!(client.get_default_royalty_bps(), Some(10_000));
}

#[test]
fn test_royalty_bps_above_max_is_rejected() {
    let (env, _cid, client) = setup_env();
    let admin = Address::generate(&env);
    env.mock_all_auths();
    client.initialize(&admin);

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
    env.mock_all_auths();
    client.initialize(&admin);

    client.set_default_royalty_bps(&500);
    assert_eq!(client.get_default_royalty_bps(), Some(500));

    client.set_default_royalty_bps(&1500);
    assert_eq!(client.get_default_royalty_bps(), Some(1500));
}

#[test]
fn test_royalty_bps_requires_admin_auth() {
    let (env, _cid, client) = setup_env();
    let admin = Address::generate(&env);
    env.mock_all_auths(); // needed for initialize (AC-01 fix)
    client.initialize(&admin);
    env.mock_auths(&[]); // clear — No mock_all_auths for the subsequent call: auth check must fail.

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

    env.mock_all_auths();
    client.initialize(&admin);

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

    env.mock_all_auths();
    client.initialize(&admin);

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

    env.mock_all_auths();
    client.initialize(&admin);

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

    env.mock_all_auths();
    client.initialize(&admin);

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

    env.mock_all_auths();
    client.initialize(&admin);

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

    env.mock_all_auths();
    client.initialize(&admin);

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

    env.mock_all_auths();
    client.initialize(&admin);

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
    env.mock_all_auths(); // needed for initialize (AC-01 fix)
    client.initialize(&admin);

    assert_eq!(client.owner_of(&42), None);
}

#[test]
fn test_get_token_data_fields() {
    let (env, _cid, client) = setup_env();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);

    env.mock_all_auths();
    env.ledger().set_timestamp(1700000000);
    client.initialize(&admin);

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

    env.mock_all_auths();
    client.initialize(&admin);

    client.mint(&creator, &10, &s(&env, "clip_010"), &s(&env, "uri://10"), &false);
    assert_eq!(client.get_creator(&10), Some(creator));
}

#[test]
fn test_creator_is_preserved_after_transfer() {
    let (env, _cid, client) = setup_env();
    let admin = Address::generate(&env);
    let creator = Address::generate(&env);
    let buyer = Address::generate(&env);

    env.mock_all_auths();
    client.initialize(&admin);

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

// Events — assert published topics and data
// ─────────────────────────────────────────────────────────────

#[test]
fn test_mint_emits_mint_event() {
    use soroban_sdk::testutils::Events as _;
    use soroban_sdk::{symbol_short, vec as svec, IntoVal};

    let (env, contract_id, client) = setup_env();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);

    env.mock_all_auths();
    client.initialize(&admin);
    client.mint(&owner, &50, &s(&env, "clip_050"), &s(&env, "uri://50"), &false);
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

    assert_eq!(client.balance_of(&owner), 0);

    client.mint(&owner, &52, &s(&env, "clip_052"), &s(&env, "uri://52"), &false);
    assert_eq!(client.balance_of(&owner), 1);

    client.mint(&owner, &53, &s(&env, "clip_053"), &s(&env, "uri://53"), &false);
    assert_eq!(client.balance_of(&owner), 2);
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

    assert_eq!(client.balance_of(&sender), 1);
    assert_eq!(client.balance_of(&recipient), 1);
    assert_eq!(client.owner_of(&55), Some(recipient.clone()));
    assert_eq!(client.owner_of(&56), Some(sender.clone()));
}

#[test]
fn test_pay_royalty_unknown_token_is_rejected() {
    let (env, _cid, client) = setup_env();
    let admin = Address::generate(&env);
    let payer = Address::generate(&env);

    env.mock_all_auths();
    client.initialize(&admin);

    let result = client.try_pay_royalty(&9999, &payer, &1_000_000);
    assert_eq!(
        result.unwrap_err().unwrap(),
        Error::TokenNotFound,
    );
}


// ── Issue #641: Upgradeability ──────────────────────────────────────────────



#[test]
fn test_upgrade_sets_wasm_hash() {
    let (env, _contract_id, client) = setup_env();
    let admin = Address::generate(&env);
    env.mock_all_auths();
    client.initialize(&admin);

    let hash = BytesN::from_array(&env, &[1u8; 32]);
    client.upgrade(&hash);
    assert_eq!(client.get_wasm_hash(), Some(hash));
}

#[test]
fn test_upgrade_zero_hash_rejected() {
    let (env, _contract_id, client) = setup_env();
    let admin = Address::generate(&env);
    env.mock_all_auths();
    client.initialize(&admin);

    let zero_hash = BytesN::from_array(&env, &[0u8; 32]);
    let result = client.try_upgrade(&zero_hash);
    assert!(result.is_err());
}

#[test]
fn test_upgrade_requires_admin() {
    let (env, _contract_id, client) = setup_env();
    let admin = Address::generate(&env);
    env.mock_all_auths();
    client.initialize(&admin);
    env.mock_auths(&[]); // clear auths so upgrade call fails auth

    let hash = BytesN::from_array(&env, &[1u8; 32]);
    let result = client.try_upgrade(&hash);
    assert!(result.is_err());
}

#[test]
fn test_set_and_get_contract_version() {
    let (env, _contract_id, client) = setup_env();
    let admin = Address::generate(&env);
    env.mock_all_auths();
    client.initialize(&admin);

    let version = String::from_str(&env, "2.0.0");
    client.set_contract_version(&version);
    assert_eq!(client.get_contract_version(), Some(version));
}

// ── Issue #643: Clip Verification ───────────────────────────────────────────

#[test]
fn test_mint_verified_happy_path() {
    let (env, _contract_id, client) = setup_env();
    let admin = Address::generate(&env);
    let caller = Address::generate(&env);
    env.mock_all_auths();
    client.initialize(&admin);

    let clip_hash = BytesN::from_array(&env, &[2u8; 32]);
    client.verify_clip(&clip_hash);

    let content_uri = String::from_str(&env, "https://clips.cash/verified_001");
    client.mint_verified(&caller, &100, &clip_hash, &content_uri, &false, &1);

    assert_eq!(client.owner_of(&100), Some(caller.clone()));
    assert_eq!(client.get_nonce(&caller), 1);
}

#[test]
fn test_mint_verified_unverified_clip_rejected() {
    let (env, _contract_id, client) = setup_env();
    let admin = Address::generate(&env);
    let caller = Address::generate(&env);
    env.mock_all_auths();
    client.initialize(&admin);

    let unverified_hash = BytesN::from_array(&env, &[3u8; 32]);
    let content_uri = String::from_str(&env, "https://clips.cash/bad");
    let result = client.try_mint_verified(&caller, &101, &unverified_hash, &content_uri, &false, &1);
    assert!(result.is_err());
}

#[test]
fn test_mint_verified_replay_attack_rejected() {
    let (env, _contract_id, client) = setup_env();
    let admin = Address::generate(&env);
    let caller = Address::generate(&env);
    env.mock_all_auths();
    client.initialize(&admin);

    let clip_hash = BytesN::from_array(&env, &[4u8; 32]);
    client.verify_clip(&clip_hash);

    let content_uri = String::from_str(&env, "https://clips.cash/replay");
    client.mint_verified(&caller, &102, &clip_hash, &content_uri, &false, &1);

    // Replay same nonce — must fail.
    let result = client.try_mint_verified(&caller, &103, &clip_hash, &content_uri, &false, &1);
    assert!(result.is_err());
}

#[test]
fn test_mint_verified_wrong_nonce_rejected() {
    let (env, _contract_id, client) = setup_env();
    let admin = Address::generate(&env);
    let caller = Address::generate(&env);
    env.mock_all_auths();
    client.initialize(&admin);

    let clip_hash = BytesN::from_array(&env, &[5u8; 32]);
    client.verify_clip(&clip_hash);

    let content_uri = String::from_str(&env, "https://clips.cash/nonce");
    // Nonce starts at 0, so first call must use nonce=1.
    let result = client.try_mint_verified(&caller, &104, &clip_hash, &content_uri, &false, &5);
    assert!(result.is_err());
}

#[test]
fn test_mint_verified_sequential_nonces() {
    let (env, _contract_id, client) = setup_env();
    let admin = Address::generate(&env);
    let caller = Address::generate(&env);
    env.mock_all_auths();
    client.initialize(&admin);

    let clip_hash = BytesN::from_array(&env, &[6u8; 32]);
    client.verify_clip(&clip_hash);

    let uri = String::from_str(&env, "https://clips.cash/seq");
    client.mint_verified(&caller, &105, &clip_hash, &uri, &false, &1);
    client.mint_verified(&caller, &106, &clip_hash, &uri, &false, &2);
    client.mint_verified(&caller, &107, &clip_hash, &uri, &false, &3);

    assert_eq!(client.get_nonce(&caller), 3);
    assert_eq!(client.balance_of(&caller), 3);
}


// ── Issue #644: End-to-end integration tests ────────────────────────────────

#[test]
fn test_full_mint_flow() {
    let (env, _contract_id, client) = setup_env();
    let admin = Address::generate(&env);
    let creator = Address::generate(&env);

    // 1. Initialize
    env.mock_all_auths();
    client.initialize(&admin);

    // 2. Set royalty
    client.set_default_royalty_bps(&500);

    // 3. Mint
    let clip_id = String::from_str(&env, "e2e_clip_001");
    let content_uri = String::from_str(&env, "https://clips.cash/e2e_001");
    client.mint(&creator, &200, &clip_id, &content_uri, &false);

    // 4. Verify ownership and data
    assert_eq!(client.owner_of(&200), Some(creator.clone()));
    let data = client.get_token_data(&200).unwrap();
    assert_eq!(data.creator, creator);
    assert_eq!(data.clip_id, clip_id);
    assert_eq!(client.total_supply(), 1);
    assert_eq!(client.get_default_royalty_bps(), Some(500));
}

#[test]
fn test_full_royalty_flow() {
    let (env, _contract_id, client) = setup_env();
    let admin = Address::generate(&env);
    env.mock_all_auths();
    client.initialize(&admin);

    // Set, update, read back.
    client.set_default_royalty_bps(&250);
    assert_eq!(client.get_default_royalty_bps(), Some(250));

    client.set_default_royalty_bps(&750);
    assert_eq!(client.get_default_royalty_bps(), Some(750));

    // Set to zero (no royalty).
    client.set_default_royalty_bps(&0);
    assert_eq!(client.get_default_royalty_bps(), Some(0));
}

#[test]
fn test_failure_mint_duplicate_token_id() {
    let (env, _contract_id, client) = setup_env();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    env.mock_all_auths();
    client.initialize(&admin);

    let clip_id = String::from_str(&env, "dup_clip");
    let content_uri = String::from_str(&env, "https://clips.cash/dup");
    client.mint(&owner, &300, &clip_id, &content_uri, &false);

    // Same token_id again — must fail.
    let result = client.try_mint(&owner, &300, &clip_id, &content_uri, &false);
    assert!(result.is_err());
}

#[test]
fn test_failure_transfer_not_owner() {
    let (env, _contract_id, client) = setup_env();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let thief = Address::generate(&env);
    let recipient = Address::generate(&env);
    env.mock_all_auths();
    client.initialize(&admin);

    let clip_id = String::from_str(&env, "theft_clip");
    let content_uri = String::from_str(&env, "https://clips.cash/theft");
    client.mint(&owner, &301, &clip_id, &content_uri, &false);

    // Thief tries to transfer — must fail.
    let result = client.try_transfer(&thief, &recipient, &301);
    assert!(result.is_err());
}

#[test]
fn test_failure_uninitialized_contract() {
    let env = Env::default();
    let contract_id = env.register_contract(None, ClipsNftContract);
    let client = ClipsNftContractClient::new(&env, &contract_id);
    env.mock_all_auths();

    let owner = Address::generate(&env);
    let clip_id = String::from_str(&env, "no_init");
    let content_uri = String::from_str(&env, "https://clips.cash/no_init");

    // Mint without initialize — must fail.
    let result = client.try_mint(&owner, &400, &clip_id, &content_uri, &false);
    assert!(result.is_err());
}

// ─────────────────────────────────────────────────────────────
// Issue #671: Batch Minting tests
// ─────────────────────────────────────────────────────────────

#[test]
fn test_batch_mint_success() {
    let (env, _contract_id, client) = setup_env();
    let admin = Address::generate(&env);
    let recipient = Address::generate(&env);

    env.mock_all_auths();
    client.initialize(&admin);

    let mut token_ids = Vec::new(&env);
    token_ids.push_back(1001);
    token_ids.push_back(1002);
    token_ids.push_back(1003);

    let mut clip_ids = Vec::new(&env);
    clip_ids.push_back(String::from_str(&env, "clip_1001"));
    clip_ids.push_back(String::from_str(&env, "clip_1002"));
    clip_ids.push_back(String::from_str(&env, "clip_1003"));

    let mut content_uris = Vec::new(&env);
    content_uris.push_back(String::from_str(&env, "ipfs://uri_1001"));
    content_uris.push_back(String::from_str(&env, "ipfs://uri_1002"));
    content_uris.push_back(String::from_str(&env, "ipfs://uri_1003"));

    let mut soulbound_flags = Vec::new(&env);
    soulbound_flags.push_back(false);
    soulbound_flags.push_back(false);
    soulbound_flags.push_back(true);

    client.batch_mint(
        &recipient,
        &token_ids,
        &clip_ids,
        &content_uris,
        &soulbound_flags,
    );

    assert_eq!(client.balance_of(&recipient), 3);
    assert_eq!(client.owner_of(&1001), Some(recipient.clone()));
    assert_eq!(client.owner_of(&1002), Some(recipient.clone()));
    assert_eq!(client.owner_of(&1003), Some(recipient.clone()));
    assert_eq!(client.is_soulbound(&1003), true);
    assert_eq!(client.total_supply(), 3);
}

#[test]
fn test_batch_mint_mismatched_lengths_rejected() {
    let (env, _contract_id, client) = setup_env();
    let admin = Address::generate(&env);
    let recipient = Address::generate(&env);

    env.mock_all_auths();
    client.initialize(&admin);

    let mut token_ids = Vec::new(&env);
    token_ids.push_back(2001);
    token_ids.push_back(2002);

    let mut clip_ids = Vec::new(&env);
    clip_ids.push_back(String::from_str(&env, "clip_2001"));

    let mut content_uris = Vec::new(&env);
    content_uris.push_back(String::from_str(&env, "ipfs://uri_2001"));
    content_uris.push_back(String::from_str(&env, "ipfs://uri_2002"));

    let mut soulbound_flags = Vec::new(&env);
    soulbound_flags.push_back(false);
    soulbound_flags.push_back(false);

    let result = client.try_batch_mint(
        &recipient,
        &token_ids,
        &clip_ids,
        &content_uris,
        &soulbound_flags,
    );

    assert_eq!(
        result.unwrap_err().unwrap(),
        Error::ArrayLengthMismatch
    );
}

#[test]
fn test_batch_mint_empty_or_oversized_rejected() {
    let (env, _contract_id, client) = setup_env();
    let admin = Address::generate(&env);
    let recipient = Address::generate(&env);

    env.mock_all_auths();
    client.initialize(&admin);

    let empty_token_ids = Vec::new(&env);
    let empty_clip_ids = Vec::new(&env);
    let empty_uris = Vec::new(&env);
    let empty_sb = Vec::new(&env);

    let result = client.try_batch_mint(
        &recipient,
        &empty_token_ids,
        &empty_clip_ids,
        &empty_uris,
        &empty_sb,
    );

    assert_eq!(
        result.unwrap_err().unwrap(),
        Error::InvalidBatchSize
    );
}

// ─────────────────────────────────────────────────────────────
// Issue #670: Custom Token URI tests
// ─────────────────────────────────────────────────────────────

#[test]
fn test_set_token_uri_by_owner() {
    let (env, _contract_id, client) = setup_env();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);

    env.mock_all_auths();
    client.initialize(&admin);

    let initial_uri = String::from_str(&env, "https://clips.cash/initial");
    client.mint(&owner, &3001, &String::from_str(&env, "clip_3001"), &initial_uri, &false);

    assert_eq!(client.token_uri(&3001), Some(initial_uri));

    let updated_uri = String::from_str(&env, "ipfs://QmUpdatedMetadataHash123");
    client.set_token_uri(&3001, &updated_uri);

    assert_eq!(client.token_uri(&3001), Some(updated_uri));
}

#[test]
fn test_set_token_uri_unauthorized_non_owner_rejected() {
    let (env, _contract_id, client) = setup_env();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let stranger = Address::generate(&env);

    env.mock_all_auths();
    client.initialize(&admin);

    let initial_uri = String::from_str(&env, "https://clips.cash/initial");
    client.mint(&owner, &3002, &String::from_str(&env, "clip_3002"), &initial_uri, &false);

    env.mock_auths(&[]); // clear auths

    let new_uri = String::from_str(&env, "ipfs://QmHackerUri");
    let result = client.try_set_token_uri(&3002, &new_uri);
    assert!(result.is_err(), "Non-owner setting token URI must fail authorization");
}


// ─────────────────────────────────────────────────────────────
// Issue #685: Fractional Royalty Payments for Assets tests
// ─────────────────────────────────────────────────────────────

#[test]
fn test_fractional_royalty_calculation_seven_decimals() {
    let (env, _contract_id, client) = setup_env();

    // 10 XLM = 100_000_000 stroops (7 decimals)
    // 500 BPS = 5.0% royalty
    // Expected royalty = 5_000_000 stroops (0.5 XLM)
    let sale_price_stroops: u128 = 100_000_000;
    let royalty_bps: u32 = 500;
    let decimals: u32 = 7;

    let royalty = client.calculate_fractional_royalty(&sale_price_stroops, &royalty_bps, &decimals);
    assert_eq!(royalty, 5_000_000);
}

#[test]
fn test_fractional_royalty_precision_and_rounding() {
    let (env, _contract_id, client) = setup_env();

    // 1.5 XLM = 15_000_000 stroops (7 decimals)
    // 250 BPS = 2.5% royalty
    // Expected royalty = 15_000_000 * 250 / 10_000 = 375_000 stroops (0.0375 XLM)
    let sale_price_stroops: u128 = 15_000_000;
    let royalty_bps: u32 = 250;
    let decimals: u32 = 7;

    let royalty = client.calculate_fractional_royalty(&sale_price_stroops, &royalty_bps, &decimals);
    assert_eq!(royalty, 375_000);
}

#[test]
fn test_fractional_royalty_overflow_is_rejected() {
    let (env, _contract_id, client) = setup_env();

    let sale_price_stroops: u128 = u128::MAX;
    let royalty_bps: u32 = 10_000;
    let decimals: u32 = 7;

    let result = client.try_calculate_fractional_royalty(&sale_price_stroops, &royalty_bps, &decimals);
    assert_eq!(result.unwrap_err().unwrap(), Error::RoyaltyOverflow);
}

// ─────────────────────────────────────────────────────────────
// Issue #689: Prevent Integer Overflow in Royalty Logic tests
// ─────────────────────────────────────────────────────────────

#[test]
fn test_transfer_with_royalty_overflow_is_rejected() {
    let (env, _contract_id, client) = setup_env();
    let admin = Address::generate(&env);
    let creator = Address::generate(&env);
    let buyer = Address::generate(&env);

    env.mock_all_auths();
    client.initialize(&admin);
    client.mint(&creator, &5101, &String::from_str(&env, "c5101"), &String::from_str(&env, "uri5101"), &false);
    client.set_default_royalty_bps(&10_000); // 100%, maximises the product

    let result = client.try_transfer_with_royalty(&creator, &buyer, &5101, &u64::MAX);
    assert_eq!(result.unwrap_err().unwrap(), Error::RoyaltyOverflow);
}

#[test]
fn test_pay_royalty_with_asset_overflow_is_rejected() {
    let (env, _contract_id, client) = setup_env();
    let admin = Address::generate(&env);
    let creator = Address::generate(&env);
    let payer = Address::generate(&env);
    let asset = Address::generate(&env);

    env.mock_all_auths();
    client.initialize(&admin);
    client.mint(&creator, &5102, &String::from_str(&env, "c5102"), &String::from_str(&env, "uri5102"), &false);
    client.add_supported_asset(&asset);
    client.set_default_royalty_bps(&10_000); // 100%, maximises the product

    // checked_mul overflows before the asset transfer is attempted, so no
    // real Stellar Asset Contract needs to be registered for this case.
    let result = client.try_pay_royalty_with_asset(&payer, &5102, &asset, &i128::MAX);
    assert_eq!(result.unwrap_err().unwrap(), Error::RoyaltyOverflow);
}

// ─────────────────────────────────────────────────────────────
// Issues #672, #686, #683 tests
// ─────────────────────────────────────────────────────────────

#[test]
fn test_name_and_symbol() {
    let (env, _contract_id, client) = setup_env();
    assert_eq!(client.name(), String::from_str(&env, "ClipCash NFT"));
    assert_eq!(client.symbol(), String::from_str(&env, "CLIP"));
}

// ─────────────────────────────────────────────────────────────
// Issue #692: Contract Version Constant tests
// ─────────────────────────────────────────────────────────────

#[test]
fn test_version_is_queryable_without_initialization() {
    let (env, _contract_id, client) = setup_env();
    // No initialize() call — version() must work on a fresh, uninitialized
    // contract since it's a compile-time constant, not stored state.
    assert_eq!(client.version(), String::from_str(&env, crate::VERSION));
}

#[test]
fn test_version_matches_contract_metadata() {
    let (env, _contract_id, client) = setup_env();
    assert_eq!(client.version(), String::from_str(&env, "1.1.0"));
}

#[test]
fn test_update_royalty_recipient_by_recipient() {
    let (env, _contract_id, client) = setup_env();
    let admin = Address::generate(&env);
    let creator = Address::generate(&env);
    let new_recipient = Address::generate(&env);

    env.mock_all_auths();
    client.initialize(&admin);

    client.mint(&creator, &5001, &String::from_str(&env, "c5001"), &String::from_str(&env, "uri5001"), &false);

    assert_eq!(client.get_royalty_recipient(&5001), Some(creator.clone()));

    client.update_royalty_recipient(&5001, &new_recipient);

    assert_eq!(client.get_royalty_recipient(&5001), Some(new_recipient.clone()));

    // Verify transfer_with_royalty uses new recipient
    client.set_default_royalty_bps(&1000); // 10%
    let buyer = Address::generate(&env);
    let royalty_info = client.transfer_with_royalty(&creator, &buyer, &5001, &1000);
    assert_eq!(royalty_info.recipient, new_recipient);
    assert_eq!(royalty_info.royalty_amount, 100);
}

#[test]
fn test_update_royalty_recipient_unauthorized_rejected() {
    let (env, _contract_id, client) = setup_env();
    let admin = Address::generate(&env);
    let creator = Address::generate(&env);
    let stranger = Address::generate(&env);

    env.mock_all_auths();
    client.initialize(&admin);

    client.mint(&creator, &5002, &String::from_str(&env, "c5002"), &String::from_str(&env, "uri5002"), &false);

    env.mock_auths(&[]); // clear auths so authorization fails

    let result = client.try_update_royalty_recipient(&5002, &stranger);
    assert!(result.is_err(), "Unauthorized update of royalty recipient must fail");
}

#[test]
fn test_update_metadata_one_time_enforcement() {
    let (env, _contract_id, client) = setup_env();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);

    env.mock_all_auths();
    client.initialize(&admin);

    client.mint(&owner, &6001, &String::from_str(&env, "c6001"), &String::from_str(&env, "uri6001"), &false);

    let initial_meta = ClipMetadata {
        name: String::from_str(&env, "Updated Clip"),
        description: String::from_str(&env, "Updated description"),
        content_uri: String::from_str(&env, "ipfs://QmUpdatedUri"),
        creator: String::from_str(&env, "CreatorName"),
        royalty_percent: 10,
        is_soulbound: false,
        created_at: env.ledger().timestamp(),
        virality_score: 95,
        original_duration: 30,
    };

    // First update succeeds
    client.update_metadata(&6001, &initial_meta);
    assert_eq!(client.token_uri(&6001), Some(String::from_str(&env, "ipfs://QmUpdatedUri")));

    // Second update attempt fails with MetadataAlreadyUpdated
    let second_meta = ClipMetadata {
        name: String::from_str(&env, "Second Update Attempt"),
        ..initial_meta.clone()
    };

    let result = client.try_update_metadata(&6001, &second_meta);
    assert_eq!(
        result.unwrap_err().unwrap(),
        Error::MetadataAlreadyUpdated,
        "Second metadata update must return MetadataAlreadyUpdated"
    );
}

// ─────────────────────────────────────────────────────────────
// Issue #704: Paginated User Token Query
// ─────────────────────────────────────────────────────────────

#[test]
fn test_get_user_tokens_empty_owner() {
    let (env, _cid, client) = setup_env();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);

    env.mock_all_auths();
    client.initialize(&admin);

    let result = client.get_user_tokens(&owner, &10, &0);
    assert_eq!(result.len(), 0, "empty owner should return empty Vec");
}

#[test]
fn test_get_user_tokens_basic() {
    let (env, _cid, client) = setup_env();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);

    env.mock_all_auths();
    client.initialize(&admin);

    client.mint(&owner, &1, &s(&env, "clip_001"), &s(&env, "uri_001"), &false);
    client.mint(&owner, &2, &s(&env, "clip_002"), &s(&env, "uri_002"), &false);
    client.mint(&owner, &3, &s(&env, "clip_003"), &s(&env, "uri_003"), &false);

    let result = client.get_user_tokens(&owner, &10, &0);
    assert_eq!(result.len(), 3, "should return all 3 tokens");
    assert_eq!(result.get(0).unwrap(), 1);
    assert_eq!(result.get(1).unwrap(), 2);
    assert_eq!(result.get(2).unwrap(), 3);
}

#[test]
fn test_get_user_tokens_pagination_first_page() {
    let (env, _cid, client) = setup_env();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);

    env.mock_all_auths();
    client.initialize(&admin);

    for i in 1..=5 {
        let token_id = i;
        let clip_id = format!("clip_{}", i);
        let uri = format!("uri_{}", i);
        client.mint(&owner, &token_id, &s(&env, &clip_id), &s(&env, &uri), &false);
    }

    let page1 = client.get_user_tokens(&owner, &2, &0);
    assert_eq!(page1.len(), 2, "first page should have 2 tokens");
    assert_eq!(page1.get(0).unwrap(), 1);
    assert_eq!(page1.get(1).unwrap(), 2);
}

#[test]
fn test_get_user_tokens_pagination_second_page() {
    let (env, _cid, client) = setup_env();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);

    env.mock_all_auths();
    client.initialize(&admin);

    for i in 1..=5 {
        let token_id = i;
        let clip_id = format!("clip_{}", i);
        let uri = format!("uri_{}", i);
        client.mint(&owner, &token_id, &s(&env, &clip_id), &s(&env, &uri), &false);
    }

    let page2 = client.get_user_tokens(&owner, &2, &2);
    assert_eq!(page2.len(), 2, "second page should have 2 tokens");
    assert_eq!(page2.get(0).unwrap(), 3);
    assert_eq!(page2.get(1).unwrap(), 4);
}

#[test]
fn test_get_user_tokens_pagination_last_page_partial() {
    let (env, _cid, client) = setup_env();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);

    env.mock_all_auths();
    client.initialize(&admin);

    for i in 1..=5 {
        let token_id = i;
        let clip_id = format!("clip_{}", i);
        let uri = format!("uri_{}", i);
        client.mint(&owner, &token_id, &s(&env, &clip_id), &s(&env, &uri), &false);
    }

    let last_page = client.get_user_tokens(&owner, &2, &4);
    assert_eq!(last_page.len(), 1, "last page should have 1 remaining token");
    assert_eq!(last_page.get(0).unwrap(), 5);
}

#[test]
fn test_get_user_tokens_cursor_beyond_total() {
    let (env, _cid, client) = setup_env();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);

    env.mock_all_auths();
    client.initialize(&admin);

    client.mint(&owner, &1, &s(&env, "clip_001"), &s(&env, "uri_001"), &false);

    let result = client.get_user_tokens(&owner, &10, &100);
    assert_eq!(result.len(), 0, "cursor beyond total should return empty Vec");
}

#[test]
fn test_get_user_tokens_limit_exceeds_total() {
    let (env, _cid, client) = setup_env();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);

    env.mock_all_auths();
    client.initialize(&admin);

    for i in 1..=3 {
        let token_id = i;
        let clip_id = format!("clip_{}", i);
        let uri = format!("uri_{}", i);
        client.mint(&owner, &token_id, &s(&env, &clip_id), &s(&env, &uri), &false);
    }

    let result = client.get_user_tokens(&owner, &100, &0);
    assert_eq!(result.len(), 3, "limit exceeding total should return all tokens");
}

#[test]
fn test_get_user_tokens_zero_limit() {
    let (env, _cid, client) = setup_env();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);

    env.mock_all_auths();
    client.initialize(&admin);

    client.mint(&owner, &1, &s(&env, "clip_001"), &s(&env, "uri_001"), &false);

    let result = client.get_user_tokens(&owner, &0, &0);
    assert_eq!(result.len(), 0, "zero limit should return empty Vec");
}

#[test]
fn test_get_user_tokens_limit_capped_at_100() {
    let (env, _cid, client) = setup_env();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);

    env.mock_all_auths();
    client.initialize(&admin);

    // Mint 50 tokens (batch limit is 50)
    let token_ids: Vec<u64> = (1..=50).collect();
    let clip_ids: Vec<String> = (1..=50).map(|i| String::from_str(&env, &format!("clip_{}", i))).collect();
    let uris: Vec<String> = (1..=50).map(|i| String::from_str(&env, &format!("uri_{}", i))).collect();
    let soulbound: Vec<bool> = (1..=50).map(|_| false).collect();
    client.batch_mint(&owner, &token_ids, &clip_ids, &uris, &soulbound);

    // Request 200 (should be capped to 100, but only 50 exist)
    let result = client.get_user_tokens(&owner, &200, &0);
    assert_eq!(result.len(), 50, "limit capped to available tokens");
}

#[test]
fn test_get_user_tokens_large_collection_multi_page() {
    let (env, _cid, client) = setup_env();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);

    env.mock_all_auths();
    client.initialize(&admin);

    // Mint 50 tokens via batch
    let token_ids: Vec<u64> = (1..=50).collect();
    let clip_ids: Vec<String> = (1..=50).map(|i| String::from_str(&env, &format!("clip_{}", i))).collect();
    let uris: Vec<String> = (1..=50).map(|i| String::from_str(&env, &format!("uri_{}", i))).collect();
    let soulbound: Vec<bool> = (1..=50).map(|_| false).collect();
    client.batch_mint(&owner, &token_ids, &clip_ids, &uris, &soulbound);

    // Page 1
    let page1 = client.get_user_tokens(&owner, &20, &0);
    assert_eq!(page1.len(), 20);
    assert_eq!(page1.get(0).unwrap(), 1);
    assert_eq!(page1.get(19).unwrap(), 20);

    // Page 2
    let page2 = client.get_user_tokens(&owner, &20, &20);
    assert_eq!(page2.len(), 20);
    assert_eq!(page2.get(0).unwrap(), 21);
    assert_eq!(page2.get(19).unwrap(), 40);

    // Page 3 (partial)
    let page3 = client.get_user_tokens(&owner, &20, &40);
    assert_eq!(page3.len(), 10);
    assert_eq!(page3.get(0).unwrap(), 41);
    assert_eq!(page3.get(9).unwrap(), 50);

    // Page 4 (empty)
    let page4 = client.get_user_tokens(&owner, &20, &60);
    assert_eq!(page4.len(), 0, "page beyond end should be empty");
}

#[test]
fn test_get_user_tokens_only_returns_owner_tokens() {
    let (env, _cid, client) = setup_env();
    let admin = Address::generate(&env);
    let owner1 = Address::generate(&env);
    let owner2 = Address::generate(&env);

    env.mock_all_auths();
    client.initialize(&admin);

    client.mint(&owner1, &1, &s(&env, "clip_001"), &s(&env, "uri_001"), &false);
    client.mint(&owner1, &2, &s(&env, "clip_002"), &s(&env, "uri_002"), &false);
    client.mint(&owner2, &3, &s(&env, "clip_003"), &s(&env, "uri_003"), &false);
    client.mint(&owner2, &4, &s(&env, "clip_004"), &s(&env, "uri_004"), &false);
    client.mint(&owner2, &5, &s(&env, "clip_005"), &s(&env, "uri_005"), &false);

    let owner1_tokens = client.get_user_tokens(&owner1, &10, &0);
    assert_eq!(owner1_tokens.len(), 2, "owner1 should have 2 tokens");
    assert_eq!(owner1_tokens.get(0).unwrap(), 1);
    assert_eq!(owner1_tokens.get(1).unwrap(), 2);

    let owner2_tokens = client.get_user_tokens(&owner2, &10, &0);
    assert_eq!(owner2_tokens.len(), 3, "owner2 should have 3 tokens");
    assert_eq!(owner2_tokens.get(0).unwrap(), 3);
    assert_eq!(owner2_tokens.get(1).unwrap(), 4);
    assert_eq!(owner2_tokens.get(2).unwrap(), 5);
}

