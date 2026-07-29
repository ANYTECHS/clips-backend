use soroban_sdk::{Address, Env, Symbol};

pub struct Admin;

pub fn has_admin(env: &Env) -> bool {
    env.storage().instance().has(&Symbol::new(env, "admin"))
}

pub fn set_admin(env: &Env, admin: &Address) {
    env.storage().instance().set(&Symbol::new(env, "admin"), admin);
}

pub fn get_admin(env: &Env) -> Option<Address> {
    env.storage().instance().get(&Symbol::new(env, "admin"))
}
