//! Token minting, backend-signed mint authorization (#1338), per-wallet
//! mint cooldown (#1339) and approval revocation (#1341).

use soroban_sdk::{
    contractimpl, contracttype, xdr::ToXdr, Address, Bytes, BytesN, Env, String, Symbol, Vec,
};

// Glob import brings in `ClipCashNFT` plus the macro-generated client/args
// types the `#[contractimpl]` below needs, across soroban-sdk versions.
use crate::*;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TokenData {
    pub owner: Address,
    pub creator: Address,
    pub clip_id: String,
    pub content_uri: String,
    pub created_at: u64,
}

/// Payload signed off-chain by the backend; XDR-serialized and verified
/// with Ed25519. Binds contract, recipient, token, clip, URI, nonce, expiry.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MintAuthorization {
    pub contract: Address,
    pub recipient: Address,
    pub token_id: u64,
    pub clip_id: String,
    pub metadata_uri: String,
    pub nonce: u64,
    pub expiration: u64,
}

#[contracttype]
#[derive(Clone)]
enum Key {
    Token(u64),
    OwnerTokens(Address),
    Approval(u64),
    Operators(Address),
    ClipMinted(String),
    Nonce(u64),
    LastMint(Address),
    MintSigner,
    MintCooldown,
    Supply,
}

fn admin(env: &Env) -> Result<Address, ContractError> {
    let a = get_owner(env).ok_or(ContractError::NotInitialized)?;
    a.require_auth();
    Ok(a)
}

fn get<V: soroban_sdk::TryFromVal<Env, soroban_sdk::Val>>(env: &Env, k: &Key) -> Option<V> {
    env.storage().persistent().get(k)
}

fn set<V: soroban_sdk::IntoVal<Env, soroban_sdk::Val>>(env: &Env, k: &Key, v: &V) {
    env.storage().persistent().set(k, v);
}

fn owner_tokens(env: &Env, owner: &Address) -> Vec<u64> {
    get(env, &Key::OwnerTokens(owner.clone())).unwrap_or(Vec::new(env))
}

fn operators(env: &Env, owner: &Address) -> Vec<Address> {
    get(env, &Key::Operators(owner.clone())).unwrap_or(Vec::new(env))
}

fn token(env: &Env, id: u64) -> Result<TokenData, ContractError> {
    get(env, &Key::Token(id)).ok_or(ContractError::TokenNotFound)
}

fn remaining_cooldown(env: &Env, wallet: &Address) -> u64 {
    let cooldown: u64 = get(env, &Key::MintCooldown).unwrap_or(0);
    match get::<u64>(env, &Key::LastMint(wallet.clone())) {
        Some(last) if cooldown > 0 => last
            .saturating_add(cooldown)
            .saturating_sub(env.ledger().timestamp()),
        _ => 0,
    }
}

fn do_mint(
    env: &Env,
    to: &Address,
    token_id: u64,
    clip_id: String,
    content_uri: String,
) -> Result<(), ContractError> {
    if env.storage().persistent().has(&Key::Token(token_id)) {
        return Err(ContractError::AlreadyExists);
    }
    if env.storage().persistent().has(&Key::ClipMinted(clip_id.clone())) {
        return Err(ContractError::ClipAlreadyMinted);
    }
    if remaining_cooldown(env, to) > 0 {
        return Err(ContractError::CooldownActive);
    }

    let now = env.ledger().timestamp();
    set(env, &Key::Token(token_id), &TokenData {
        owner: to.clone(),
        creator: to.clone(),
        clip_id: clip_id.clone(),
        content_uri,
        created_at: now,
    });
    let mut list = owner_tokens(env, to);
    list.push_back(token_id);
    set(env, &Key::OwnerTokens(to.clone()), &list);
    set(env, &Key::ClipMinted(clip_id), &true);
    let supply: u64 = get(env, &Key::Supply).unwrap_or(0);
    set(env, &Key::Supply, &(supply + 1));
    // Only recorded after a successful mint.
    set(env, &Key::LastMint(to.clone()), &now);

    env.events().publish(
        ("ClipCashNFT", Symbol::new(env, "mint"), to.clone()),
        token_id,
    );
    Ok(())
}

fn approval_event(env: &Env, owner: &Address, operator: Option<Address>, token_id: Option<u64>, approved: bool) {
    env.events().publish(
        ("ClipCashNFT", Symbol::new(env, "approval_update"), owner.clone()),
        (operator, token_id, approved),
    );
}

#[contractimpl]
impl ClipCashNFT {
    // ───────────── Minting ─────────────

    /// Admin mint.
    pub fn mint(env: Env, to: Address, token_id: u64, clip_id: String, content_uri: String) -> Result<(), ContractError> {
        admin(&env)?;
        do_mint(&env, &to, token_id, clip_id, content_uri)
    }

    /// Admin: set the backend Ed25519 public key that signs mint authorizations.
    pub fn set_mint_signer(env: Env, public_key: BytesN<32>) -> Result<(), ContractError> {
        admin(&env)?;
        set(&env, &Key::MintSigner, &public_key);
        Ok(())
    }

    pub fn get_mint_signer(env: Env) -> Option<BytesN<32>> {
        get(&env, &Key::MintSigner)
    }

    /// Mint with a backend-signed authorization. Any change to the signed
    /// fields invalidates the signature; each nonce is single-use.
    pub fn mint_with_signature(
        env: Env,
        recipient: Address,
        token_id: u64,
        clip_id: String,
        metadata_uri: String,
        nonce: u64,
        expiration: u64,
        signature: BytesN<64>,
    ) -> Result<(), ContractError> {
        recipient.require_auth();
        let signer: BytesN<32> = get(&env, &Key::MintSigner).ok_or(ContractError::InvalidSignature)?;
        if env.ledger().timestamp() > expiration {
            return Err(ContractError::SignatureExpired);
        }
        if env.storage().persistent().has(&Key::Nonce(nonce)) {
            return Err(ContractError::NonceAlreadyUsed);
        }
        let payload = Self::mint_authorization_payload(
            env.clone(), recipient.clone(), token_id, clip_id.clone(), metadata_uri.clone(), nonce, expiration,
        );
        // Traps (tx fails) on a signature mismatch.
        env.crypto().ed25519_verify(&signer, &payload, &signature);

        do_mint(&env, &recipient, token_id, clip_id, metadata_uri)?;
        set(&env, &Key::Nonce(nonce), &true);
        Ok(())
    }

    /// Bytes the backend must sign for `mint_with_signature`.
    pub fn mint_authorization_payload(
        env: Env,
        recipient: Address,
        token_id: u64,
        clip_id: String,
        metadata_uri: String,
        nonce: u64,
        expiration: u64,
    ) -> Bytes {
        MintAuthorization {
            contract: env.current_contract_address(),
            recipient,
            token_id,
            clip_id,
            metadata_uri,
            nonce,
            expiration,
        }
        .to_xdr(&env)
    }

    pub fn is_nonce_used(env: Env, nonce: u64) -> bool {
        env.storage().persistent().has(&Key::Nonce(nonce))
    }

    // ───────────── Cooldown ─────────────

    /// Admin: per-wallet mint cooldown in seconds (0 disables).
    pub fn set_mint_cooldown(env: Env, seconds: u64) -> Result<(), ContractError> {
        admin(&env)?;
        set(&env, &Key::MintCooldown, &seconds);
        Ok(())
    }

    pub fn get_mint_cooldown(env: Env) -> u64 {
        get(&env, &Key::MintCooldown).unwrap_or(0)
    }

    pub fn get_last_mint(env: Env, wallet: Address) -> Option<u64> {
        get(&env, &Key::LastMint(wallet))
    }

    /// Seconds until `wallet` may mint again (0 = allowed now).
    pub fn cooldown_remaining(env: Env, wallet: Address) -> u64 {
        remaining_cooldown(&env, &wallet)
    }

    // ───────────── Ownership / transfers ─────────────

    pub fn owner_of(env: Env, token_id: u64) -> Option<Address> {
        get::<TokenData>(&env, &Key::Token(token_id)).map(|t| t.owner)
    }

    pub fn get_token_data(env: Env, token_id: u64) -> Option<TokenData> {
        get(&env, &Key::Token(token_id))
    }

    pub fn balance_of(env: Env, owner: Address) -> u32 {
        owner_tokens(&env, &owner).len()
    }

    pub fn total_supply(env: Env) -> u64 {
        get(&env, &Key::Supply).unwrap_or(0)
    }

    /// Transfer by owner, single-token approvee or approved operator.
    pub fn transfer_from(env: Env, spender: Address, from: Address, to: Address, token_id: u64) -> Result<(), ContractError> {
        spender.require_auth();
        let mut t = token(&env, token_id)?;
        if t.owner != from {
            return Err(ContractError::Unauthorized);
        }
        let approved = get::<Address>(&env, &Key::Approval(token_id)).map_or(false, |a| a == spender);
        if spender != from && !approved && !operators(&env, &from).contains(&spender) {
            return Err(ContractError::Unauthorized);
        }

        let mut list = owner_tokens(&env, &from);
        if let Some(i) = list.first_index_of(token_id) {
            list.remove(i);
        }
        set(&env, &Key::OwnerTokens(from.clone()), &list);
        let mut to_list = owner_tokens(&env, &to);
        to_list.push_back(token_id);
        set(&env, &Key::OwnerTokens(to.clone()), &to_list);

        t.owner = to.clone();
        set(&env, &Key::Token(token_id), &t);
        env.storage().persistent().remove(&Key::Approval(token_id));

        env.events().publish(
            ("ClipCashNFT", Symbol::new(&env, "transfer"), from, to),
            token_id,
        );
        Ok(())
    }

    // ───────────── Approvals ─────────────

    pub fn approve(env: Env, owner: Address, spender: Address, token_id: u64) -> Result<(), ContractError> {
        owner.require_auth();
        if token(&env, token_id)?.owner != owner {
            return Err(ContractError::Unauthorized);
        }
        set(&env, &Key::Approval(token_id), &spender);
        approval_event(&env, &owner, Some(spender), Some(token_id), true);
        Ok(())
    }

    pub fn get_approved(env: Env, token_id: u64) -> Option<Address> {
        get(&env, &Key::Approval(token_id))
    }

    pub fn set_approval_for_all(env: Env, owner: Address, operator: Address, approved: bool) -> Result<(), ContractError> {
        owner.require_auth();
        let mut ops = operators(&env, &owner);
        match (approved, ops.first_index_of(&operator)) {
            (true, None) => ops.push_back(operator.clone()),
            (false, Some(i)) => { ops.remove(i); }
            _ => {}
        }
        set(&env, &Key::Operators(owner.clone()), &ops);
        approval_event(&env, &owner, Some(operator), None, approved);
        Ok(())
    }

    pub fn is_approved_for_all(env: Env, owner: Address, operator: Address) -> bool {
        operators(&env, &owner).contains(&operator)
    }

    /// Revoke the approval on one token. Requires the token owner's auth.
    pub fn revoke_approval(env: Env, token_id: u32) -> Result<(), ContractError> {
        let token_id = token_id as u64;
        let owner = token(&env, token_id)?.owner;
        owner.require_auth();
        let key = Key::Approval(token_id);
        if !env.storage().persistent().has(&key) {
            return Err(ContractError::ApprovalNotFound);
        }
        env.storage().persistent().remove(&key);
        approval_event(&env, &owner, None, Some(token_id), false);
        Ok(())
    }

    /// Revoke every per-token approval and every operator of `owner`.
    pub fn revoke_all_approvals(env: Env, owner: Address) -> Result<(), ContractError> {
        owner.require_auth();
        for id in owner_tokens(&env, &owner).iter() {
            env.storage().persistent().remove(&Key::Approval(id));
        }
        env.storage().persistent().remove(&Key::Operators(owner.clone()));
        approval_event(&env, &owner, None, None, false);
        Ok(())
    }
}
