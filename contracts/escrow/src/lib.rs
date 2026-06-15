#![no_std]

mod errors;
mod types;

use crate::errors::EscrowError;
use crate::types::{DataKey, EscrowConfig};
use soroban_sdk::{contract, contractimpl, Address, Env};

const INSTANCE_BUMP_AMOUNT: u32 = 518_400; // ~30 days
const INSTANCE_LIFETIME_THRESHOLD: u32 = 129_600; // ~7.5 days

/// Escrow Contract
///
/// Holds borrower contributions toward a 30% down-payment savings target.
/// Accepts USDC deposits, tracks individual balances, and releases funds
/// once the savings target is met — or refunds the borrower on early withdrawal.
#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    /// Initialize the escrow contract with configuration parameters.
    ///
    /// # Arguments
    /// - `admin` — The address authorized to release funds and manage the contract.
    /// - `token` — The USDC token contract address.
    /// - `savings_target` — The target amount each borrower must save (in token units).
    /// - `max_duration_ledgers` — Maximum number of ledgers for the savings period.
    /// - `early_withdrawal_penalty_bps` — Penalty for early withdrawal in basis points.
    pub fn initialize(
        env: Env,
        admin: Address,
        token: Address,
        savings_target: i128,
        max_duration_ledgers: u32,
        early_withdrawal_penalty_bps: u32,
    ) -> Result<(), EscrowError> {
        // Prevent re-initialization.
        if env.storage().instance().has(&DataKey::Config) {
            return Err(EscrowError::AlreadyInitialized);
        }

        // Validate inputs.
        if savings_target <= 0 {
            return Err(EscrowError::InvalidAmount);
        }

        admin.require_auth();

        let config = EscrowConfig {
            admin,
            token,
            savings_target,
            max_duration_ledgers,
            early_withdrawal_penalty_bps,
        };

        env.storage().instance().set(&DataKey::Config, &config);
        env.storage().instance().set(&DataKey::TotalPooled, &0i128);
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);

        Ok(())
    }

    /// Returns the contract version.
    pub fn version(env: Env) -> u32 {
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
        1
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env};

    #[test]
    fn test_initialize() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(EscrowContract, ());
        let client = EscrowContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let token = Address::generate(&env);

        client.initialize(
            &admin,
            &token,
            &10_000_0000000i128, // 10,000 USDC (7 decimals)
            &518_400u32,         // ~30 days
            &500u32,             // 5% penalty
        );

        // Verify config was stored by reading from the contract's context.
        env.as_contract(&contract_id, || {
            let stored_config: EscrowConfig = env
                .storage()
                .instance()
                .get(&DataKey::Config)
                .unwrap();

            assert_eq!(stored_config.admin, admin);
            assert_eq!(stored_config.token, token);
            assert_eq!(stored_config.savings_target, 10_000_0000000i128);
            assert_eq!(stored_config.max_duration_ledgers, 518_400u32);
            assert_eq!(stored_config.early_withdrawal_penalty_bps, 500u32);
        });
    }

    #[test]
    fn test_double_initialize_fails() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(EscrowContract, ());
        let client = EscrowContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let token = Address::generate(&env);

        client.initialize(&admin, &token, &10_000_0000000i128, &518_400u32, &500u32);

        // Second initialization should fail.
        let result = client.try_initialize(&admin, &token, &10_000_0000000i128, &518_400u32, &500u32);
        assert!(result.is_err());
    }

    #[test]
    fn test_version() {
        let env = Env::default();
        let contract_id = env.register(EscrowContract, ());
        let client = EscrowContractClient::new(&env, &contract_id);
        assert_eq!(client.version(), 1);
    }
}

