#![cfg(test)]

use crate::{ClipsNftContract, ClipsNftContractClient, Error, TokenData};
use soroban_sdk::{testutils::Address as _, Address, Env, String};

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
