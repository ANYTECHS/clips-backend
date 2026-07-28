#![cfg(test)]

use crate::{ClipsNftContract, ClipsNftContractClient, Error, TokenData};
use soroban_sdk::{testutils::Address as _, Address, BytesN, Env, String};

fn setup_env() -> (Env, Address, ClipsNftContractClient<'static>) {
    let env = Env::default();
    let contract_id = env.register_contract(None, ClipsNftContract);
    let client = ClipsNftContractClient::new(&env, &contract_id);
    (env, contract_id, client)
}

#[test]
fn test_initialize() {
    let (env, _contract_id, client) = setup_env();
    let admin = Address::generate(&env);
    
    client.initialize(&admin);
    
    // Verify double initialization fails
    let result = client.try_initialize(&admin);
    assert!(result.is_err());
}

#[test]
fn test_mint_regular_token() {
    let (env, _contract_id, client) = setup_env();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    
    client.initialize(&admin);
    
    env.mock_all_auths();
    
    let clip_id = String::from_str(&env, "clip_001");
    let content_uri = String::from_str(&env, "https://clips.cash/clip_001");
    let is_soulbound = false;
    
    client.mint(&owner, &1, &clip_id, &content_uri, &is_soulbound);
    
    assert_eq!(client.owner_of(&1), Some(owner.clone()));
    assert_eq!(client.is_soulbound(&1), false);
    assert_eq!(client.balance_of(&owner), 1);
    assert_eq!(client.total_supply(), 1);
}

#[test]
fn test_mint_soulbound_token() {
    let (env, _contract_id, client) = setup_env();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    
    client.initialize(&admin);
    
    env.mock_all_auths();
    
    let clip_id = String::from_str(&env, "clip_002");
    let content_uri = String::from_str(&env, "https://clips.cash/clip_002");
    let is_soulbound = true;
    
    client.mint(&owner, &2, &clip_id, &content_uri, &is_soulbound);
    
    assert_eq!(client.owner_of(&2), Some(owner.clone()));
    assert_eq!(client.is_soulbound(&2), true);
    assert_eq!(client.balance_of(&owner), 1);
    
    // Verify token data
    let token_data = client.get_token_data(&2).unwrap();
    assert_eq!(token_data.is_soulbound, true);
    assert_eq!(token_data.creator, owner);
}

#[test]
fn test_transfer_regular_token() {
    let (env, _contract_id, client) = setup_env();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let recipient = Address::generate(&env);
    
    client.initialize(&admin);
    
    env.mock_all_auths();
    
    // Mint regular (non-soulbound) token
    let clip_id = String::from_str(&env, "clip_003");
    let content_uri = String::from_str(&env, "https://clips.cash/clip_003");
    client.mint(&owner, &3, &clip_id, &content_uri, &false);
    
    assert_eq!(client.balance_of(&owner), 1);
    
    // Transfer should succeed
    client.transfer(&owner, &recipient, &3);
    
    assert_eq!(client.owner_of(&3), Some(recipient.clone()));
    assert_eq!(client.balance_of(&owner), 0);
    assert_eq!(client.balance_of(&recipient), 1);
}

#[test]
fn test_transfer_soulbound_token_fails() {
    let (env, _contract_id, client) = setup_env();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let recipient = Address::generate(&env);
    
    client.initialize(&admin);
    
    env.mock_all_auths();
    
    // Mint soulbound token
    let clip_id = String::from_str(&env, "clip_004");
    let content_uri = String::from_str(&env, "https://clips.cash/clip_004");
    client.mint(&owner, &4, &clip_id, &content_uri, &true);
    
    // Attempt to transfer should fail with SoulboundTokenNotTransferable error
    let result = client.try_transfer(&owner, &recipient, &4);
    assert!(result.is_err());
}

#[test]
fn test_approve_regular_token() {
    let (env, _contract_id, client) = setup_env();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let spender = Address::generate(&env);
    
    client.initialize(&admin);
    
    env.mock_all_auths();
    
    // Mint regular token
    let clip_id = String::from_str(&env, "clip_005");
    let content_uri = String::from_str(&env, "https://clips.cash/clip_005");
    client.mint(&owner, &5, &clip_id, &content_uri, &false);
    
    // Approve should succeed
    client.approve(&owner, &spender, &5);
    assert_eq!(client.get_approved(&5), Some(spender));
}

#[test]
fn test_approve_soulbound_token_fails() {
    let (env, _contract_id, client) = setup_env();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let spender = Address::generate(&env);
    
    client.initialize(&admin);
    
    env.mock_all_auths();
    
    // Mint soulbound token
    let clip_id = String::from_str(&env, "clip_006");
    let content_uri = String::from_str(&env, "https://clips.cash/clip_006");
    client.mint(&owner, &6, &clip_id, &content_uri, &true);
    
    // Attempt to approve should fail
    let result = client.try_approve(&owner, &spender, &6);
    assert!(result.is_err());
}

#[test]
fn test_transfer_from_soulbound_token_fails() {
    let (env, _contract_id, client) = setup_env();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let spender = Address::generate(&env);
    let recipient = Address::generate(&env);
    
    client.initialize(&admin);
    
    env.mock_all_auths();
    
    // Mint a regular token and approve spender first
    let clip_id = String::from_str(&env, "clip_007");
    let content_uri = String::from_str(&env, "https://clips.cash/clip_007");
    client.mint(&owner, &7, &clip_id, &content_uri, &false);
    client.approve(&owner, &spender, &7);
    
    // Regular token transfer_from should succeed
    client.transfer_from(&spender, &owner, &recipient, &7);
    assert_eq!(client.owner_of(&7), Some(recipient.clone()));
    
    // Now test soulbound token
    let clip_id_2 = String::from_str(&env, "clip_008");
    let content_uri_2 = String::from_str(&env, "https://clips.cash/clip_008");
    client.mint(&owner, &8, &clip_id_2, &content_uri_2, &true);
    
    // Even with approval, soulbound token cannot be transferred
    let result = client.try_transfer_from(&owner, &owner, &recipient, &8);
    assert!(result.is_err());
}

#[test]
fn test_get_token_data() {
    let (env, _contract_id, client) = setup_env();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    
    client.initialize(&admin);
    
    env.mock_all_auths();
    
    let clip_id = String::from_str(&env, "clip_009");
    let content_uri = String::from_str(&env, "https://clips.cash/clip_009");
    client.mint(&owner, &9, &clip_id, &content_uri, &true);
    
    let token_data = client.get_token_data(&9).unwrap();
    assert_eq!(token_data.owner, owner);
    assert_eq!(token_data.creator, owner);
    assert_eq!(token_data.is_soulbound, true);
    assert_eq!(token_data.clip_id, clip_id);
    assert_eq!(token_data.content_uri, content_uri);
    assert!(token_data.created_at > 0);
}

#[test]
fn test_get_creator() {
    let (env, _contract_id, client) = setup_env();
    let admin = Address::generate(&env);
    let creator = Address::generate(&env);
    
    client.initialize(&admin);
    
    env.mock_all_auths();
    
    let clip_id = String::from_str(&env, "clip_010");
    let content_uri = String::from_str(&env, "https://clips.cash/clip_010");
    client.mint(&creator, &10, &clip_id, &content_uri, &false);
    
    assert_eq!(client.get_creator(&10), Some(creator));
}

// ── Default royalty BPS configuration ────────────────────────────────────────

#[test]
fn test_get_default_royalty_bps_returns_none_before_set() {
    let (env, _contract_id, client) = setup_env();
    let admin = Address::generate(&env);

    client.initialize(&admin);

    // No royalty has been configured yet — should return None.
    assert_eq!(client.get_default_royalty_bps(), None);
}

#[test]
fn test_set_and_get_default_royalty_bps() {
    let (env, _contract_id, client) = setup_env();
    let admin = Address::generate(&env);

    client.initialize(&admin);
    env.mock_all_auths();

    // Set to 1000 BPS (10 %).
    client.set_default_royalty_bps(&1000);

    assert_eq!(client.get_default_royalty_bps(), Some(1000));
}

#[test]
fn test_set_default_royalty_bps_zero_is_valid() {
    let (env, _contract_id, client) = setup_env();
    let admin = Address::generate(&env);

    client.initialize(&admin);
    env.mock_all_auths();

    // 0 BPS is a valid value (no royalty).
    client.set_default_royalty_bps(&0);

    assert_eq!(client.get_default_royalty_bps(), Some(0));
}

#[test]
fn test_set_default_royalty_bps_max_boundary_is_valid() {
    let (env, _contract_id, client) = setup_env();
    let admin = Address::generate(&env);

    client.initialize(&admin);
    env.mock_all_auths();

    // 10 000 BPS = 100 % — the maximum allowed value.
    client.set_default_royalty_bps(&10_000);

    assert_eq!(client.get_default_royalty_bps(), Some(10_000));
}

#[test]
fn test_set_default_royalty_bps_above_max_is_rejected() {
    let (env, _contract_id, client) = setup_env();
    let admin = Address::generate(&env);

    client.initialize(&admin);
    env.mock_all_auths();

    // 10 001 BPS exceeds the 10 000 BPS ceiling — must return InvalidRoyaltyBps.
    let result = client.try_set_default_royalty_bps(&10_001);
    assert!(result.is_err());
}

#[test]
fn test_set_default_royalty_bps_requires_admin() {
    let (env, _contract_id, client) = setup_env();
    let admin = Address::generate(&env);

    client.initialize(&admin);
    // Intentionally do NOT call env.mock_all_auths() — auth will not be satisfied.

    // The call must fail because the non-admin caller cannot provide admin auth.
    let result = client.try_set_default_royalty_bps(&500);
    assert!(result.is_err());
}

#[test]
fn test_set_default_royalty_bps_updates_value() {
    let (env, _contract_id, client) = setup_env();
    let admin = Address::generate(&env);

    client.initialize(&admin);
    env.mock_all_auths();

    // First write.
    client.set_default_royalty_bps(&500);
    assert_eq!(client.get_default_royalty_bps(), Some(500));

    // Update to a different value — latest write wins.
    client.set_default_royalty_bps(&1500);
    assert_eq!(client.get_default_royalty_bps(), Some(1500));
}

#[test]
fn test_set_default_royalty_bps_not_initialized_is_rejected() {
    let env = Env::default();
    let contract_id = env.register_contract(None, ClipsNftContract);
    let client = ClipsNftContractClient::new(&env, &contract_id);

    // Contract has never been initialized — no admin exists.
    env.mock_all_auths();
    let result = client.try_set_default_royalty_bps(&1000);
    assert!(result.is_err());
}

// ── Issue #641: Upgradeability ──────────────────────────────────────────────

#[test]
fn test_upgrade_sets_wasm_hash() {
    let (env, _contract_id, client) = setup_env();
    let admin = Address::generate(&env);
    client.initialize(&admin);
    env.mock_all_auths();

    let hash = BytesN::from_array(&env, &[1u8; 32]);
    client.upgrade(&hash);
    assert_eq!(client.get_wasm_hash(), Some(hash));
}

#[test]
fn test_upgrade_zero_hash_rejected() {
    let (env, _contract_id, client) = setup_env();
    let admin = Address::generate(&env);
    client.initialize(&admin);
    env.mock_all_auths();

    let zero_hash = BytesN::from_array(&env, &[0u8; 32]);
    let result = client.try_upgrade(&zero_hash);
    assert!(result.is_err());
}

#[test]
fn test_upgrade_requires_admin() {
    let (env, _contract_id, client) = setup_env();
    let admin = Address::generate(&env);
    client.initialize(&admin);
    // No mock_all_auths — auth not satisfied.

    let hash = BytesN::from_array(&env, &[1u8; 32]);
    let result = client.try_upgrade(&hash);
    assert!(result.is_err());
}

#[test]
fn test_set_and_get_contract_version() {
    let (env, _contract_id, client) = setup_env();
    let admin = Address::generate(&env);
    client.initialize(&admin);
    env.mock_all_auths();

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
    client.initialize(&admin);
    env.mock_all_auths();

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
    client.initialize(&admin);
    env.mock_all_auths();

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
    client.initialize(&admin);
    env.mock_all_auths();

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
    client.initialize(&admin);
    env.mock_all_auths();

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
    client.initialize(&admin);
    env.mock_all_auths();

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
    client.initialize(&admin);
    env.mock_all_auths();

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
    client.initialize(&admin);
    env.mock_all_auths();

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
    client.initialize(&admin);
    env.mock_all_auths();

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
    client.initialize(&admin);
    env.mock_all_auths();

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
