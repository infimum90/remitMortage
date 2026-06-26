use soroban_sdk::Env;
use soroban_sdk::testutils::Ledger as _;

/// Advances the env.ledger().sequence() by `count`.
pub fn advance_ledger_sequence(env: &Env, count: u32) {
    env.ledger().with_mut(|li| {
        li.sequence_number += count;
    });
}

/// Advances the env.ledger().timestamp() by `seconds`.
pub fn advance_ledger_time(env: &Env, seconds: u64) {
    env.ledger().with_mut(|li| {
        li.timestamp += seconds;
    });
}
