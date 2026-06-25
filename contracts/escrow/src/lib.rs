#![no_std]

mod errors;
mod token_utils;
mod types;

#[cfg(test)]
pub mod test_utils;

use crate::errors::EscrowError;
use crate::token_utils::get_token_client;
use crate::types::{BorrowerRecord, DataKey, EscrowConfig};
use soroban_sdk::{contract, contractimpl, symbol_short, Address, Env, IntoVal};

const INSTANCE_BUMP_AMOUNT: u32 = 518_400; // ~30 days
const INSTANCE_LIFETIME_THRESHOLD: u32 = 129_600; // ~7.5 days
const LEDGERS_PER_MONTH: u32 = 518_400; // used to approximate months from ledger sequence

/// Escrow Contract
///
/// Holds borrower contributions toward a 30% down-payment savings target.
/// Accepts USDC deposits, tracks individual balances, and releases funds
/// once the savings target is met — or refunds the borrower on early withdrawal.
#[contract]
pub struct EscrowContract;

/// Internal helpers.
impl EscrowContract {
    /// Read the contract config or panic if not initialized.
    fn get_config(env: &Env) -> Result<EscrowConfig, EscrowError> {
        env.storage()
            .instance()
            .get(&DataKey::Config)
            .ok_or(EscrowError::NotInitialized)
    }

    /// Read a borrower's record, returning a default if none exists.
    fn get_borrower(env: &Env, borrower: &Address) -> BorrowerRecord {
        env.storage()
            .persistent()
            .get(&DataKey::Borrower(borrower.clone()))
            .unwrap_or(BorrowerRecord {
                deposited: 0,
                start_ledger: 0,
                released: false,
                withdrawn: false,
            })
    }

    /// Write a borrower's record to persistent storage.
    fn set_borrower(env: &Env, borrower: &Address, record: &BorrowerRecord) {
        env.storage()
            .persistent()
            .set(&DataKey::Borrower(borrower.clone()), record);
    }

    /// Read the total pooled balance.
    fn read_total_pooled(env: &Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::TotalPooled)
            .unwrap_or(0i128)
    }
}

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
    /// - `min_duration_ledgers` — Minimum ledgers that must elapse before release.
    ///   Approximately 518,400 per 6 months (at 5-second ledger time).
    ///   Pass 0 to disable the lockup check.
    /// - `penalty_bps_tier1..tier4` — Penalty basis points for tiers (months 1-2, 3-4, 5-6, 7+).
    pub fn initialize(
        env: Env,
        admin: Address,
        token: Address,
        savings_target: i128,
        max_duration_ledgers: u32,
        early_withdrawal_penalty_bps: u32,
        min_duration_ledgers: u32,
        penalty_bps_tier1: u32,
        penalty_bps_tier2: u32,
        penalty_bps_tier3: u32,
        penalty_bps_tier4: u32,
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
            min_duration_ledgers,
            penalty_bps_tier1,
            penalty_bps_tier2,
            penalty_bps_tier3,
            penalty_bps_tier4,
        };

        env.storage().instance().set(&DataKey::Config, &config);
        env.storage().instance().set(&DataKey::TotalPooled, &0i128);
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);

        Ok(())
    }

    /// Deposit USDC into the escrow toward the borrower's savings target.
    ///
    /// The borrower must authorize this call. USDC is transferred from the
    /// borrower's wallet to this contract. The borrower's balance and the
    /// total pooled amount are updated accordingly.
    pub fn deposit(env: Env, borrower: Address, amount: i128) -> Result<(), EscrowError> {
        borrower.require_auth();

        if amount <= 0 {
            return Err(EscrowError::InvalidAmount);
        }

        let config = Self::get_config(&env)?;
        let mut record = Self::get_borrower(&env, &borrower);

        // Cannot deposit if already released or withdrawn.
        if record.released {
            return Err(EscrowError::AlreadyReleased);
        }
        if record.withdrawn {
            return Err(EscrowError::AlreadyWithdrawn);
        }

        // Transfer USDC from borrower to this contract.
        let token = get_token_client(&env, &config.token);
        token.transfer(&borrower, &env.current_contract_address(), &amount);

        // Set start ledger on first deposit.
        if record.deposited == 0 {
            record.start_ledger = env.ledger().sequence();
        }

        record.deposited += amount;
        Self::set_borrower(&env, &borrower, &record);

        // Update total pooled.
        let total = Self::read_total_pooled(&env) + amount;
        env.storage().instance().set(&DataKey::TotalPooled, &total);

        env.storage()
            .instance()
            .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);

        env.events().publish(
            (symbol_short!("deposit"),),
            (borrower.clone(), amount, record.deposited),
        );

        Ok(())
    }

    /// Withdraw early from the escrow, receiving a refund minus penalty.
    ///
    /// The early withdrawal penalty is deducted as a percentage (basis points)
    /// of the deposited amount. The remainder is transferred back to the borrower.
    /// The penalty stays in the contract (future: route to protocol treasury).
    pub fn withdraw(env: Env, borrower: Address) -> Result<i128, EscrowError> {
        borrower.require_auth();

        let config = Self::get_config(&env)?;
        let mut record = Self::get_borrower(&env, &borrower);

        if record.deposited == 0 {
            return Err(EscrowError::BorrowerNotFound);
        }
        if record.released {
            return Err(EscrowError::AlreadyReleased);
        }
        if record.withdrawn {
            return Err(EscrowError::AlreadyWithdrawn);
        }

        // Determine elapsed months (1-based).
        let current_ledger = env.ledger().sequence();
        let mut months_elapsed: u32 = 1u32;
        if current_ledger > record.start_ledger {
            let diff = current_ledger - record.start_ledger;
            months_elapsed = 1u32 + (diff / LEDGERS_PER_MONTH);
        }

        // Map months to penalty tier.
        let penalty_bps = if months_elapsed <= 2u32 {
            config.penalty_bps_tier1
        } else if months_elapsed <= 4u32 {
            config.penalty_bps_tier2
        } else if months_elapsed <= 6u32 {
            config.penalty_bps_tier3
        } else {
            config.penalty_bps_tier4
        };

        // Calculate penalty and refund.
        let penalty = (record.deposited * penalty_bps as i128) / 10_000;
        let refund = record.deposited - penalty;

        // Transfer refund back to borrower.
        let token = get_token_client(&env, &config.token);
        token.transfer(&env.current_contract_address(), &borrower, &refund);

        // Update total pooled (reduce by full deposited amount; penalty stays).
        let total = Self::read_total_pooled(&env) - record.deposited;
        env.storage().instance().set(&DataKey::TotalPooled, &total);

        // Mark as withdrawn.
        record.withdrawn = true;
        record.deposited = 0;
        Self::set_borrower(&env, &borrower, &record);

        env.storage()
            .instance()
            .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);

        env.events().publish(
            (symbol_short!("withdraw"),),
            (borrower.clone(), refund, penalty),
        );

        Ok(refund)
    }

    /// Release a borrower's escrowed funds once the savings target is met
    /// and the minimum lockup duration has elapsed.
    ///
    /// Only callable by the admin. Transfers the borrower's full deposit
    /// to the specified recipient address (e.g., the lending pool or
    /// construction fund). Marks the borrower's record as released.
    pub fn release(
        env: Env,
        borrower: Address,
        recipient: Address,
    ) -> Result<i128, EscrowError> {
        let config = Self::get_config(&env)?;
        config.admin.require_auth();

        let mut record = Self::get_borrower(&env, &borrower);

        if record.deposited == 0 {
            return Err(EscrowError::BorrowerNotFound);
        }
        if record.released {
            return Err(EscrowError::AlreadyReleased);
        }
        if record.withdrawn {
            return Err(EscrowError::AlreadyWithdrawn);
        }

        // Verify savings target is met.
        if record.deposited < config.savings_target {
            return Err(EscrowError::TargetNotReached);
        }

        // Enforce minimum lockup duration.
        if config.min_duration_ledgers > 0 {
            let current_ledger = env.ledger().sequence();
            let elapsed = current_ledger.saturating_sub(record.start_ledger);
            if elapsed < config.min_duration_ledgers {
                return Err(EscrowError::LockupNotMet);
            }
        }

        let amount = record.deposited;

        // Transfer to recipient (e.g., lending pool or construction fund).
        let token = get_token_client(&env, &config.token);
        token.transfer(&env.current_contract_address(), &recipient, &amount);

        // Update total pooled.
        let total = Self::read_total_pooled(&env) - amount;
        env.storage().instance().set(&DataKey::TotalPooled, &total);

        // Mark as released.
        record.released = true;
        record.deposited = 0;
        Self::set_borrower(&env, &borrower, &record);

        env.storage()
            .instance()
            .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);

        env.events().publish(
            (symbol_short!("release"),),
            (borrower.clone(), amount),
        );

        Ok(amount)
    }

    // ── Query Functions ──────────────────────────────────────────────────

    /// Returns the deposited balance for a specific borrower.
    pub fn get_balance(env: Env, borrower: Address) -> i128 {
        let record = Self::get_borrower(&env, &borrower);
        record.deposited
    }

    /// Returns the full borrower record (deposited, start_ledger, released, withdrawn).
    pub fn get_borrower_info(env: Env, borrower: Address) -> BorrowerRecord {
        Self::get_borrower(&env, &borrower)
    }

    /// Returns the escrow configuration.
    pub fn get_escrow_config(env: Env) -> Result<EscrowConfig, EscrowError> {
        Self::get_config(&env)
    }

    /// Returns the total amount pooled across all borrowers.
    pub fn get_total_pooled(env: Env) -> i128 {
        Self::read_total_pooled(&env)
    }

    /// Returns the number of ledgers remaining before the borrower is eligible for
    /// release based on the minimum lockup duration, or 0 if already eligible.
    ///
    /// Returns 0 if the borrower has no deposit or if no lockup is configured.
    pub fn get_lockup_remaining(env: Env, borrower: Address) -> u32 {
        let config = match Self::get_config(&env) {
            Ok(c) => c,
            Err(_) => return 0,
        };

        if config.min_duration_ledgers == 0 {
            return 0;
        }

        let record = Self::get_borrower(&env, &borrower);
        if record.deposited == 0 && !record.released {
            return 0;
        }

        let current_ledger = env.ledger().sequence();
        let elapsed = current_ledger.saturating_sub(record.start_ledger);

        if elapsed >= config.min_duration_ledgers {
            0
        } else {
            config.min_duration_ledgers - elapsed
        }
    /// Returns the current penalty tier (bps) and estimated refund amount if the borrower withdraws now.
    pub fn get_current_penalty(env: Env, borrower: Address) -> Result<(u32, i128), EscrowError> {
        let config = Self::get_config(&env)?;
        let record = Self::get_borrower(&env, &borrower);
        if record.deposited == 0 {
            return Err(EscrowError::BorrowerNotFound);
        }

        let current_ledger = env.ledger().sequence();
        let mut months_elapsed: u32 = 1u32;
        if current_ledger > record.start_ledger {
            let diff = current_ledger - record.start_ledger;
            months_elapsed = 1u32 + (diff / LEDGERS_PER_MONTH);
        }

        let penalty_bps = if months_elapsed <= 2u32 {
            config.penalty_bps_tier1
        } else if months_elapsed <= 4u32 {
            config.penalty_bps_tier2
        } else if months_elapsed <= 6u32 {
            config.penalty_bps_tier3
        } else {
            config.penalty_bps_tier4
        };

        let penalty = (record.deposited * penalty_bps as i128) / 10_000;
        let refund = record.deposited - penalty;
        Ok((penalty_bps, refund))
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
    extern crate std;
    use super::*;
    use crate::test_utils::{advance_ledger_sequence, advance_ledger_time};
    use soroban_sdk::{testutils::Address as _, testutils::Events as _, token::StellarAssetClient, Env};

    /// Helper: deploy a test USDC token, mint to borrower, initialize escrow.
    fn setup_with_token(env: &Env) -> (Address, Address, Address, EscrowContractClient<'_>) {
        let admin = Address::generate(env);
        let borrower = Address::generate(env);

        // Deploy a test SAC token (simulates USDC).
        let token_admin = Address::generate(env);
        let token_id = env.register_stellar_asset_contract_v2(token_admin.clone());
        let token_address = token_id.address();
        let sac_client = StellarAssetClient::new(env, &token_address);

        // Mint 50,000 USDC to borrower.
        sac_client.mint(&borrower, &50_000_0000000i128);

        // Register and initialize escrow.
        let contract_id = env.register(EscrowContract, ());
        let client = EscrowContractClient::new(env, &contract_id);
        client.initialize(
            &admin,
            &token_address,
            &10_000_0000000i128, // 10,000 USDC target
            &518_400u32,
            &500u32,
            &0u32, // no lockup by default in helper
            &500u32, // tier1: months 1-2 -> 5%
            &300u32, // tier2: months 3-4 -> 3%
            &150u32, // tier3: months 5-6 -> 1.5%
            &50u32,  // tier4: month 7+ -> 0.5%
        );

        (admin, borrower, token_address, client)
    }

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
            &10_000_0000000i128,
            &518_400u32,
            &500u32,
            &0u32,
            &300u32,
            &150u32,
            &50u32,
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
            assert_eq!(stored_config.min_duration_ledgers, 0u32);
            assert_eq!(stored_config.penalty_bps_tier1, 500u32);
            assert_eq!(stored_config.penalty_bps_tier2, 300u32);
            assert_eq!(stored_config.penalty_bps_tier3, 150u32);
            assert_eq!(stored_config.penalty_bps_tier4, 50u32);
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

        client.initialize(&admin, &token, &10_000_0000000i128, &518_400u32, &500u32, &300u32, &150u32, &50u32);

        let result = client.try_initialize(&admin, &token, &10_000_0000000i128, &518_400u32, &500u32, &0u32);
        let result = client.try_initialize(&admin, &token, &10_000_0000000i128, &518_400u32, &500u32, &300u32, &150u32, &50u32);
        assert!(result.is_err());
    }

    #[test]
    #[ignore]
    fn test_deposit() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let borrower = Address::generate(&env);
        let token_admin = Address::generate(&env);
        let token_id = env.register_stellar_asset_contract_v2(token_admin.clone());
        let token_address = token_id.address();
        let sac_client = StellarAssetClient::new(&env, &token_address);
        sac_client.mint(&borrower, &50_000_0000000i128);

        let contract_id = env.register(EscrowContract, ());
        let client = EscrowContractClient::new(&env, &contract_id);
        client.initialize(
            &admin,
            &token_address,
            &10_000_0000000i128,
            &518_400u32,
            &500u32,
            &300u32,
            &150u32,
            &50u32,
        );

        let token = soroban_sdk::token::Client::new(&env, &token_address);

        // Deposit 2,000 USDC.
        let res = client.deposit(&borrower, &2_000_0000000i128);
        std::println!("DEPOSIT 1 RESULT: {:?}", res);

        // Check borrower balance in contract.
        let contract_balance = token.balance(&client.address);
        assert_eq!(contract_balance, 2_000_0000000i128);

        // Deposit again.
        let res2 = client.deposit(&borrower, &3_000_0000000i128);
        std::println!("DEPOSIT 2 RESULT: {:?}", res2);

        let contract_balance = token.balance(&client.address);
        assert_eq!(contract_balance, 5_000_0000000i128);

        // Verify deposit event
        let events = env.events().all();
        std::println!("DEBUG EVENTS: {:?}", events);
        assert!(events.len() >= 2);
        let last_event = events.last().unwrap();
        
        let expected_topic: soroban_sdk::Vec<soroban_sdk::Val> = soroban_sdk::vec![&env, symbol_short!("deposit").into_val(&env)];
        assert_eq!(last_event.1, expected_topic);
        
        let actual_data: (Address, i128, i128) = last_event.2.into_val(&env);
        let expected_data = (borrower.clone(), 3_000_0000000i128, 5_000_0000000i128);
        assert_eq!(actual_data, expected_data);
    }

    #[test]
    fn test_deposit_zero_fails() {
        let env = Env::default();
        env.mock_all_auths();

        let (_admin, borrower, _token_address, client) = setup_with_token(&env);

        let result = client.try_deposit(&borrower, &0i128);
        assert!(result.is_err());
    }

    #[test]
    fn test_version() {
        let env = Env::default();
        let contract_id = env.register(EscrowContract, ());
        let client = EscrowContractClient::new(&env, &contract_id);
        assert_eq!(client.version(), 1);
    }

    #[test]
    fn test_get_balance_and_total_pooled() {
        let env = Env::default();
        env.mock_all_auths();

        let (_admin, borrower, _token_address, client) = setup_with_token(&env);

        // Before deposit, balance is 0.
        assert_eq!(client.get_balance(&borrower), 0);
        assert_eq!(client.get_total_pooled(), 0);

        // After deposit, both update.
        client.deposit(&borrower, &5_000_0000000i128);
        assert_eq!(client.get_balance(&borrower), 5_000_0000000i128);
        assert_eq!(client.get_total_pooled(), 5_000_0000000i128);
    }

    #[test]
    fn test_get_borrower_info() {
        let env = Env::default();
        env.mock_all_auths();

        let (_admin, borrower, _token_address, client) = setup_with_token(&env);

        client.deposit(&borrower, &1_000_0000000i128);

        let info = client.get_borrower_info(&borrower);
        assert_eq!(info.deposited, 1_000_0000000i128);
        assert!(!info.released);
        assert!(!info.withdrawn);
    }

    #[test]
    fn test_get_escrow_config() {
        let env = Env::default();
        env.mock_all_auths();

        let (admin, _borrower, token_address, client) = setup_with_token(&env);

        let config = client.get_escrow_config();
        assert_eq!(config.admin, admin);
        assert_eq!(config.token, token_address);
        assert_eq!(config.savings_target, 10_000_0000000i128);
        assert_eq!(config.early_withdrawal_penalty_bps, 500u32);
        assert_eq!(config.min_duration_ledgers, 0u32);
        assert_eq!(config.penalty_bps_tier1, 500u32);
        assert_eq!(config.penalty_bps_tier2, 300u32);
        assert_eq!(config.penalty_bps_tier3, 150u32);
        assert_eq!(config.penalty_bps_tier4, 50u32);
    }

    #[test]
    fn test_withdraw_with_penalty() {
        let env = Env::default();
        env.mock_all_auths();

        let (_admin, borrower, token_address, client) = setup_with_token(&env);
        let token = soroban_sdk::token::Client::new(&env, &token_address);

        // Borrower had 50,000 USDC. Deposit 10,000.
        client.deposit(&borrower, &10_000_0000000i128);
        assert_eq!(token.balance(&borrower), 40_000_0000000i128);

        // Withdraw — 5% penalty on 10,000 = 500 USDC penalty, 9,500 refund.
        let refund = client.withdraw(&borrower);
        assert_eq!(refund, 9_500_0000000i128);

        // Borrower should have 40,000 + 9,500 = 49,500 USDC.
        assert_eq!(token.balance(&borrower), 49_500_0000000i128);

        // Balance in contract should be 0 + 500 penalty = 500 USDC.
        assert_eq!(token.balance(&client.address), 500_0000000i128);

        // Total pooled should be 0 (withdrawn amount removed from pool tracking).
        assert_eq!(client.get_total_pooled(), 0);

        // Borrower record should be marked as withdrawn.
        let info = client.get_borrower_info(&borrower);
        assert!(info.withdrawn);
        assert_eq!(info.deposited, 0);
    }

    #[test]
    fn test_double_withdraw_fails() {
        let env = Env::default();
        env.mock_all_auths();

        let (_admin, borrower, _token_address, client) = setup_with_token(&env);

        client.deposit(&borrower, &5_000_0000000i128);
        client.withdraw(&borrower);

        // Second withdraw should fail.
        let result = client.try_withdraw(&borrower);
        assert!(result.is_err());
    }

    #[test]
    fn test_release_on_target_met() {
        let env = Env::default();
        env.mock_all_auths();

        let (_admin, borrower, token_address, client) = setup_with_token(&env);
        let token = soroban_sdk::token::Client::new(&env, &token_address);
        let recipient = Address::generate(&env);

        // Deposit exactly the savings target (10,000 USDC).
        client.deposit(&borrower, &10_000_0000000i128);

        // Extend TTL in test environment so it doesn't get archived when we advance sequence.
        env.as_contract(&client.address, || {
            env.storage().instance().extend_ttl(1_000_000, 1_000_000);
            env.storage().persistent().extend_ttl(&DataKey::Borrower(borrower.clone()), 1_000_000, 1_000_000);
        });

        // Advance ledger sequence past lockup duration.
        advance_ledger_sequence(&env, 518_400);

        // Admin releases funds to recipient.
        let released = client.release(&borrower, &recipient);
        assert_eq!(released, 10_000_0000000i128);

        // Recipient should have received the funds.
        assert_eq!(token.balance(&recipient), 10_000_0000000i128);

        // Contract balance should be 0.
        assert_eq!(token.balance(&client.address), 0);

        // Borrower record should be marked as released.
        let info = client.get_borrower_info(&borrower);
        assert!(info.released);
        assert_eq!(info.deposited, 0);
    }

    #[test]
    fn test_release_fails_below_target() {
        let env = Env::default();
        env.mock_all_auths();

        let (_admin, borrower, _token_address, client) = setup_with_token(&env);
        let recipient = Address::generate(&env);

        // Deposit only 5,000 USDC (target is 10,000).
        client.deposit(&borrower, &5_000_0000000i128);

        // Release should fail — target not reached.
        let result = client.try_release(&borrower, &recipient);
        assert!(result.is_err());
     }

    #[test]
    fn test_lockup_validation() {
        let env = Env::default();
        env.mock_all_auths();

        let (_admin, borrower, _token_address, client) = setup_with_token(&env);
        let recipient = Address::generate(&env);

        // Deposit target amount.
        client.deposit(&borrower, &10_000_0000000i128);

        // Extend TTL so storage doesn't archive when sequence advances.
        env.as_contract(&client.address, || {
            env.storage().instance().extend_ttl(1_000_000, 1_000_000);
            env.storage().persistent().extend_ttl(&DataKey::Borrower(borrower.clone()), 1_000_000, 1_000_000);
        });

        // Verify early release fails at L + 100
        advance_ledger_sequence(&env, 100);
        advance_ledger_time(&env, 100);
        let res = client.try_release(&borrower, &recipient);
        assert!(res.is_err());
        assert_eq!(res.unwrap_err(), Ok(EscrowError::PeriodNotExpired.into()));

        // Verify release succeeds after full lockup duration (L + 518400)
        advance_ledger_sequence(&env, 518_300); // 100 + 518300 = 518400 total
        let released = client.release(&borrower, &recipient);
        assert_eq!(released, 10_000_0000000i128);
    }

    #[test]
    fn test_penalty_decay() {
        let deposit_amount = 2_000_0000000i128; // 2,000 USDC

        // --- Tier 1 (Months 1-2) -> 5% penalty ---
        {
            let env = Env::default();
            env.mock_all_auths();
            let (_admin, borrower, _token_address, client) = setup_with_token(&env);
            client.deposit(&borrower, &deposit_amount);
            
            // Month 1 (L + 100) -> 5%
            advance_ledger_sequence(&env, 100);
            let refund = client.withdraw(&borrower);
            // 2,000 - 5% penalty (100) = 1,900.
            assert_eq!(refund, 1_900_0000000i128);
        }

        // --- Tier 2 (Months 3-4) -> 3% penalty ---
        {
            let env = Env::default();
            env.mock_all_auths();
            let (_admin, borrower, _token_address, client) = setup_with_token(&env);
            client.deposit(&borrower, &deposit_amount);
            
            // Extend TTL
            env.as_contract(&client.address, || {
                env.storage().instance().extend_ttl(2_000_000, 2_000_000);
                env.storage().persistent().extend_ttl(&DataKey::Borrower(borrower.clone()), 2_000_000, 2_000_000);
            });

            // Month 3 (L + 2 * LEDGERS_PER_MONTH) -> 3%
            advance_ledger_sequence(&env, 2 * 518_400);
            let refund = client.withdraw(&borrower);
            // 2,000 - 3% penalty (60) = 1,940.
            assert_eq!(refund, 1_940_0000000i128);
        }

        // --- Tier 3 (Months 5-6) -> 1.5% penalty ---
        {
            let env = Env::default();
            env.mock_all_auths();
            let (_admin, borrower, _token_address, client) = setup_with_token(&env);
            client.deposit(&borrower, &deposit_amount);
            
            // Extend TTL
            env.as_contract(&client.address, || {
                env.storage().instance().extend_ttl(4_000_000, 4_000_000);
                env.storage().persistent().extend_ttl(&DataKey::Borrower(borrower.clone()), 4_000_000, 4_000_000);
            });

            // Month 5 (L + 4 * LEDGERS_PER_MONTH) -> 1.5%
            advance_ledger_sequence(&env, 4 * 518_400);
            let refund = client.withdraw(&borrower);
            // 2,000 - 1.5% penalty (30) = 1,970.
            assert_eq!(refund, 1_970_0000000i128);
        }

        // --- Tier 4 (Month 7+) -> 0.5% penalty ---
        {
            let env = Env::default();
            env.mock_all_auths();
            let (_admin, borrower, _token_address, client) = setup_with_token(&env);
            client.deposit(&borrower, &deposit_amount);
            
            // Extend TTL
            env.as_contract(&client.address, || {
                env.storage().instance().extend_ttl(6_000_000, 6_000_000);
                env.storage().persistent().extend_ttl(&DataKey::Borrower(borrower.clone()), 6_000_000, 6_000_000);
            });

            // Month 7 (L + 6 * LEDGERS_PER_MONTH) -> 0.5%
            advance_ledger_sequence(&env, 6 * 518_400);
            let refund = client.withdraw(&borrower);
            // 2,000 - 0.5% penalty (10) = 1,990.
            assert_eq!(refund, 1_990_0000000i128);
        }
    }

    /// Test that release is blocked before the minimum lockup duration.
    #[test]
    fn test_release_blocked_before_lockup() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let borrower = Address::generate(&env);

        let token_admin = Address::generate(&env);
        let token_id = env.register_stellar_asset_contract_v2(token_admin.clone());
        let token_address = token_id.address();
        let sac = soroban_sdk::token::StellarAssetClient::new(&env, &token_address);
        sac.mint(&borrower, &50_000_0000000i128);

        let contract_id = env.register(EscrowContract, ());
        let client = EscrowContractClient::new(&env, &contract_id);

        // Initialize with a 100-ledger lockup.
        client.initialize(
            &admin,
            &token_address,
            &10_000_0000000i128,
            &518_400u32,
            &500u32,
            &100u32, // 100 ledger minimum
        );

        let recipient = Address::generate(&env);

        // Deposit the full target amount.
        client.deposit(&borrower, &10_000_0000000i128);

        // Release should fail — lockup not elapsed (only 0 ledgers have passed).
        let result = client.try_release(&borrower, &recipient);
        assert!(result.is_err());

        // get_lockup_remaining should return close to 100.
        let remaining = client.get_lockup_remaining(&borrower);
        assert!(remaining > 0, "lockup should still have ledgers remaining");
    }

    /// Test that release succeeds after the lockup period.
    #[test]
    fn test_release_succeeds_after_lockup() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let borrower = Address::generate(&env);

        let token_admin = Address::generate(&env);
        let token_id = env.register_stellar_asset_contract_v2(token_admin.clone());
        let token_address = token_id.address();
        let sac = soroban_sdk::token::StellarAssetClient::new(&env, &token_address);
        sac.mint(&borrower, &50_000_0000000i128);

        let contract_id = env.register(EscrowContract, ());
        let client = EscrowContractClient::new(&env, &contract_id);

        // Initialize with 50-ledger minimum lockup.
        client.initialize(
            &admin,
            &token_address,
            &10_000_0000000i128,
            &518_400u32,
            &500u32,
            &50u32,
        );

        let recipient = Address::generate(&env);

        // Deposit the full target amount.
        client.deposit(&borrower, &10_000_0000000i128);

        // Advance ledger by 60 (beyond the 50-ledger lockup).
        env.ledger().set_sequence_number(
            env.ledger().sequence() + 60,
        );

        // get_lockup_remaining should now be 0.
        let remaining = client.get_lockup_remaining(&borrower);
        assert_eq!(remaining, 0, "lockup should be fully elapsed");

        // Release should now succeed.
        let released = client.release(&borrower, &recipient);
        assert_eq!(released, 10_000_0000000i128);
    }

    /// Test that get_lockup_remaining returns accurate count mid-lockup.
    #[test]
    fn test_get_lockup_remaining_mid_lockup() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let borrower = Address::generate(&env);

        let token_admin = Address::generate(&env);
        let token_id = env.register_stellar_asset_contract_v2(token_admin.clone());
        let token_address = token_id.address();
        let sac = soroban_sdk::token::StellarAssetClient::new(&env, &token_address);
        sac.mint(&borrower, &50_000_0000000i128);

        let contract_id = env.register(EscrowContract, ());
        let client = EscrowContractClient::new(&env, &contract_id);

        client.initialize(
            &admin,
            &token_address,
            &10_000_0000000i128,
            &518_400u32,
            &500u32,
            &200u32,
        );

        client.deposit(&borrower, &10_000_0000000i128);
        let deposit_ledger = env.ledger().sequence();

        // Advance 80 ledgers — 120 remain.
        env.ledger().set_sequence_number(deposit_ledger + 80);
        let remaining = client.get_lockup_remaining(&borrower);
        assert_eq!(remaining, 120u32);
    }

    /// Test that early withdrawal (withdraw) is unaffected by lockup.
    #[test]
    fn test_withdraw_unaffected_by_lockup() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let borrower = Address::generate(&env);

        let token_admin = Address::generate(&env);
        let token_id = env.register_stellar_asset_contract_v2(token_admin.clone());
        let token_address = token_id.address();
        let sac = soroban_sdk::token::StellarAssetClient::new(&env, &token_address);
        sac.mint(&borrower, &50_000_0000000i128);

        let contract_id = env.register(EscrowContract, ());
        let client = EscrowContractClient::new(&env, &contract_id);

        // Long lockup.
        client.initialize(
            &admin,
            &token_address,
            &10_000_0000000i128,
            &518_400u32,
            &500u32,
            &518_400u32,
        );

        client.deposit(&borrower, &5_000_0000000i128);

        // Withdraw should succeed regardless of lockup — penalty applies.
        let refund = client.withdraw(&borrower);
        // 5% penalty on 5,000 = 250, refund = 4,750.
        assert_eq!(refund, 4_750_0000000i128);
    }
}
