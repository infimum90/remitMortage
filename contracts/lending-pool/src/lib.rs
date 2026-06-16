#![no_std]

mod errors;
mod types;

use crate::errors::PoolError;
use crate::types::{DataKey, InvestorRecord, LoanRecord, LoanStatus, PoolConfig};
use soroban_sdk::{contract, contractimpl, token, Address, BytesN, Env};

const INSTANCE_BUMP_AMOUNT: u32 = 518_400; // ~30 days
const INSTANCE_LIFETIME_THRESHOLD: u32 = 129_600; // ~7.5 days

/// Lending Pool Contract
///
/// Holds capital from investors/depositors and provides the 70% loan
/// portion for borrowers whose escrow savings target has been met.
/// Supports loan requests, admin approval, milestone-based disbursement,
/// and borrower repayment.
#[contract]
pub struct LendingPoolContract;

/// Internal helpers.
impl LendingPoolContract {
    fn read_config(env: &Env) -> Result<PoolConfig, PoolError> {
        env.storage()
            .instance()
            .get(&DataKey::Config)
            .ok_or(PoolError::NotInitialized)
    }

    fn read_investor(env: &Env, investor: &Address) -> InvestorRecord {
        env.storage()
            .persistent()
            .get(&DataKey::Investor(investor.clone()))
            .unwrap_or(InvestorRecord {
                deposited: 0,
                start_ledger: 0,
            })
    }

    fn set_investor(env: &Env, investor: &Address, record: &InvestorRecord) {
        env.storage()
            .persistent()
            .set(&DataKey::Investor(investor.clone()), record);
    }

    fn read_total_liquidity(env: &Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::TotalLiquidity)
            .unwrap_or(0i128)
    }

    fn read_loan(env: &Env, loan_id: &BytesN<32>) -> Result<LoanRecord, PoolError> {
        env.storage()
            .persistent()
            .get(&DataKey::Loan(loan_id.clone()))
            .ok_or(PoolError::LoanNotFound)
    }

    fn set_loan(env: &Env, loan_id: &BytesN<32>, record: &LoanRecord) {
        env.storage()
            .persistent()
            .set(&DataKey::Loan(loan_id.clone()), record);
    }

    fn token_client<'a>(env: &'a Env, token_addr: &'a Address) -> token::Client<'a> {
        token::Client::new(env, token_addr)
    }
}

#[contractimpl]
impl LendingPoolContract {
    /// Initialize the lending pool contract.
    ///
    /// # Arguments
    /// - `admin` — Address authorized to approve loans and manage the pool.
    /// - `token` — USDC token contract address.
    /// - `interest_rate_bps` — Annual interest rate in basis points (e.g. 800 = 8%).
    pub fn initialize(
        env: Env,
        admin: Address,
        token: Address,
        interest_rate_bps: u32,
    ) -> Result<(), PoolError> {
        if env.storage().instance().has(&DataKey::Config) {
            return Err(PoolError::AlreadyInitialized);
        }

        admin.require_auth();

        let config = PoolConfig {
            admin,
            token,
            interest_rate_bps,
        };

        env.storage().instance().set(&DataKey::Config, &config);
        env.storage()
            .instance()
            .set(&DataKey::TotalLiquidity, &0i128);
        env.storage().instance().set(&DataKey::LoanCount, &0u32);
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);

        Ok(())
    }

    /// Investor deposits capital into the lending pool.
    ///
    /// Transfers USDC from the investor to this contract and updates
    /// the investor's record and the pool's total liquidity.
    pub fn deposit(env: Env, investor: Address, amount: i128) -> Result<(), PoolError> {
        investor.require_auth();

        if amount <= 0 {
            return Err(PoolError::InvalidAmount);
        }

        let config = Self::read_config(&env)?;

        // Transfer USDC from investor to pool.
        let token = Self::token_client(&env, &config.token);
        token.transfer(&investor, &env.current_contract_address(), &amount);

        // Update investor record.
        let mut record = Self::read_investor(&env, &investor);
        if record.deposited == 0 {
            record.start_ledger = env.ledger().sequence();
        }
        record.deposited += amount;
        Self::set_investor(&env, &investor, &record);

        // Update total liquidity.
        let total = Self::read_total_liquidity(&env) + amount;
        env.storage()
            .instance()
            .set(&DataKey::TotalLiquidity, &total);

        env.storage()
            .instance()
            .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);

        Ok(())
    }

    /// Borrower requests a loan for the given principal amount.
    ///
    /// Creates a loan record in `Requested` state. The admin must
    /// approve it before any disbursement can happen.
    pub fn request_loan(
        env: Env,
        borrower: Address,
        loan_id: BytesN<32>,
        principal: i128,
    ) -> Result<(), PoolError> {
        borrower.require_auth();

        if principal <= 0 {
            return Err(PoolError::InvalidAmount);
        }

        // Ensure loan ID doesn't already exist.
        if env
            .storage()
            .persistent()
            .has(&DataKey::Loan(loan_id.clone()))
        {
            return Err(PoolError::LoanAlreadyExists);
        }

        let config = Self::read_config(&env)?;

        let loan = LoanRecord {
            borrower,
            principal,
            disbursed: 0,
            repaid: 0,
            interest_rate_bps: config.interest_rate_bps,
            status: LoanStatus::Requested,
            created_ledger: env.ledger().sequence(),
        };

        Self::set_loan(&env, &loan_id, &loan);

        // Increment loan count.
        let count: u32 = env
            .storage()
            .instance()
            .get(&DataKey::LoanCount)
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::LoanCount, &(count + 1));

        env.storage()
            .instance()
            .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);

        Ok(())
    }

    /// Admin approves a pending loan request.
    ///
    /// Verifies that pool has sufficient liquidity for the loan principal,
    /// then transitions the loan status from Requested to Approved.
    pub fn approve_loan(env: Env, loan_id: BytesN<32>) -> Result<(), PoolError> {
        let config = Self::read_config(&env)?;
        config.admin.require_auth();

        let mut loan = Self::read_loan(&env, &loan_id)?;

        if loan.status != LoanStatus::Requested {
            return Err(PoolError::InvalidLoanState);
        }

        // Verify pool has enough liquidity.
        let liquidity = Self::read_total_liquidity(&env);
        if liquidity < loan.principal {
            return Err(PoolError::InsufficientLiquidity);
        }

        loan.status = LoanStatus::Approved;
        Self::set_loan(&env, &loan_id, &loan);

        env.storage()
            .instance()
            .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);

        Ok(())
    }

    /// Disburse funds from the pool for an approved loan.
    ///
    /// Transfers the specified amount to the recipient (e.g., a contractor
    /// or the milestone disbursement contract). Can be called multiple times
    /// for milestone-based releases up to the loan principal.
    pub fn disburse(
        env: Env,
        loan_id: BytesN<32>,
        recipient: Address,
        amount: i128,
    ) -> Result<(), PoolError> {
        if amount <= 0 {
            return Err(PoolError::InvalidAmount);
        }

        let config = Self::read_config(&env)?;
        config.admin.require_auth();

        let mut loan = Self::read_loan(&env, &loan_id)?;

        if loan.status != LoanStatus::Approved {
            return Err(PoolError::InvalidLoanState);
        }

        // Cannot disburse more than the remaining principal.
        if loan.disbursed + amount > loan.principal {
            return Err(PoolError::InvalidAmount);
        }

        // Verify pool liquidity.
        let liquidity = Self::read_total_liquidity(&env);
        if liquidity < amount {
            return Err(PoolError::InsufficientLiquidity);
        }

        // Transfer funds to recipient.
        let token = Self::token_client(&env, &config.token);
        token.transfer(&env.current_contract_address(), &recipient, &amount);

        loan.disbursed += amount;
        Self::set_loan(&env, &loan_id, &loan);

        // Reduce available liquidity.
        let new_liquidity = liquidity - amount;
        env.storage()
            .instance()
            .set(&DataKey::TotalLiquidity, &new_liquidity);

        env.storage()
            .instance()
            .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);

        Ok(())
    }

    /// Borrower repays toward an approved loan.
    ///
    /// Transfers USDC from the borrower to the pool. Once the full
    /// principal + interest is repaid, the loan is marked as Repaid.
    pub fn repay(
        env: Env,
        borrower: Address,
        loan_id: BytesN<32>,
        amount: i128,
    ) -> Result<(), PoolError> {
        borrower.require_auth();

        if amount <= 0 {
            return Err(PoolError::InvalidAmount);
        }

        let config = Self::read_config(&env)?;
        let mut loan = Self::read_loan(&env, &loan_id)?;

        if loan.status != LoanStatus::Approved {
            return Err(PoolError::InvalidLoanState);
        }

        // Calculate total owed (principal + simple interest).
        let interest = (loan.principal * loan.interest_rate_bps as i128) / 10_000;
        let total_owed = loan.principal + interest;
        let remaining = total_owed - loan.repaid;

        if amount > remaining {
            return Err(PoolError::OverPayment);
        }

        // Transfer USDC from borrower to pool.
        let token = Self::token_client(&env, &config.token);
        token.transfer(&borrower, &env.current_contract_address(), &amount);

        loan.repaid += amount;

        // Mark as repaid if fully paid.
        if loan.repaid >= total_owed {
            loan.status = LoanStatus::Repaid;
        }

        Self::set_loan(&env, &loan_id, &loan);

        // Increase available liquidity with the repayment.
        let liquidity = Self::read_total_liquidity(&env) + amount;
        env.storage()
            .instance()
            .set(&DataKey::TotalLiquidity, &liquidity);

        env.storage()
            .instance()
            .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);

        Ok(())
    }

    // ── Query Functions ──────────────────────────────────────────────────

    /// Returns the pool configuration.
    pub fn get_pool_config(env: Env) -> Result<PoolConfig, PoolError> {
        Self::read_config(&env)
    }

    /// Returns the total available liquidity.
    pub fn get_liquidity(env: Env) -> i128 {
        Self::read_total_liquidity(&env)
    }

    /// Returns an investor's record.
    pub fn get_investor_info(env: Env, investor: Address) -> InvestorRecord {
        Self::read_investor(&env, &investor)
    }

    /// Returns a loan record by ID.
    pub fn get_loan_info(env: Env, loan_id: BytesN<32>) -> Result<LoanRecord, PoolError> {
        Self::read_loan(&env, &loan_id)
    }

    /// Returns the contract version.
    pub fn version(_env: Env) -> u32 {
        1
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, token::StellarAssetClient, Env};

    /// Helper: deploy test token, mint to investor, initialize pool.
    fn setup_pool(env: &Env) -> (Address, Address, Address, LendingPoolContractClient<'_>) {
        let admin = Address::generate(env);
        let investor = Address::generate(env);

        // Deploy test USDC.
        let token_admin = Address::generate(env);
        let token_id = env.register_stellar_asset_contract_v2(token_admin.clone());
        let token_address = token_id.address();
        let sac = StellarAssetClient::new(env, &token_address);

        // Mint 100,000 USDC to investor.
        sac.mint(&investor, &100_000_0000000i128);

        let contract_id = env.register(LendingPoolContract, ());
        let client = LendingPoolContractClient::new(env, &contract_id);
        client.initialize(&admin, &token_address, &800u32); // 8% interest

        (admin, investor, token_address, client)
    }

    #[test]
    fn test_initialize() {
        let env = Env::default();
        env.mock_all_auths();

        let (admin, _investor, token_address, client) = setup_pool(&env);

        let config = client.get_pool_config();
        assert_eq!(config.admin, admin);
        assert_eq!(config.token, token_address);
        assert_eq!(config.interest_rate_bps, 800u32);
        assert_eq!(client.get_liquidity(), 0);
    }

    #[test]
    fn test_deposit() {
        let env = Env::default();
        env.mock_all_auths();

        let (_admin, investor, token_address, client) = setup_pool(&env);
        let token = token::Client::new(&env, &token_address);

        client.deposit(&investor, &50_000_0000000i128);

        assert_eq!(client.get_liquidity(), 50_000_0000000i128);
        assert_eq!(token.balance(&client.address), 50_000_0000000i128);

        let info = client.get_investor_info(&investor);
        assert_eq!(info.deposited, 50_000_0000000i128);
    }

    #[test]
    fn test_deposit_zero_fails() {
        let env = Env::default();
        env.mock_all_auths();

        let (_admin, investor, _token_address, client) = setup_pool(&env);

        let result = client.try_deposit(&investor, &0i128);
        assert!(result.is_err());
    }

    #[test]
    fn test_double_initialize_fails() {
        let env = Env::default();
        env.mock_all_auths();

        let (admin, _investor, token_address, client) = setup_pool(&env);

        let result = client.try_initialize(&admin, &token_address, &800u32);
        assert!(result.is_err());
    }

    fn mock_loan_id(env: &Env) -> BytesN<32> {
        BytesN::from_array(env, &[1u8; 32])
    }

    #[test]
    fn test_request_and_approve_loan() {
        let env = Env::default();
        env.mock_all_auths();

        let (_admin, investor, _token_address, client) = setup_pool(&env);
        let borrower = Address::generate(&env);
        let loan_id = mock_loan_id(&env);

        // Fund the pool.
        client.deposit(&investor, &70_000_0000000i128);

        // Borrower requests a 70,000 USDC loan.
        client.request_loan(&borrower, &loan_id, &70_000_0000000i128);
        let loan = client.get_loan_info(&loan_id);
        assert_eq!(loan.status, LoanStatus::Requested);
        assert_eq!(loan.principal, 70_000_0000000i128);
        assert_eq!(loan.borrower, borrower);

        // Admin approves.
        client.approve_loan(&loan_id);
        let loan = client.get_loan_info(&loan_id);
        assert_eq!(loan.status, LoanStatus::Approved);
    }

    #[test]
    fn test_approve_insufficient_liquidity_fails() {
        let env = Env::default();
        env.mock_all_auths();

        let (_admin, investor, _token_address, client) = setup_pool(&env);
        let borrower = Address::generate(&env);
        let loan_id = mock_loan_id(&env);

        // Only deposit 5,000 but request 70,000.
        client.deposit(&investor, &5_000_0000000i128);
        client.request_loan(&borrower, &loan_id, &70_000_0000000i128);

        let result = client.try_approve_loan(&loan_id);
        assert!(result.is_err());
    }

    #[test]
    fn test_duplicate_loan_id_fails() {
        let env = Env::default();
        env.mock_all_auths();

        let (_admin, investor, _token_address, client) = setup_pool(&env);
        let borrower = Address::generate(&env);
        let loan_id = mock_loan_id(&env);

        client.deposit(&investor, &70_000_0000000i128);
        client.request_loan(&borrower, &loan_id, &10_000_0000000i128);

        // Same loan ID should fail.
        let result = client.try_request_loan(&borrower, &loan_id, &10_000_0000000i128);
        assert!(result.is_err());
    }

    #[test]
    fn test_version() {
        let env = Env::default();
        let contract_id = env.register(LendingPoolContract, ());
        let client = LendingPoolContractClient::new(&env, &contract_id);
        assert_eq!(client.version(), 1);
    }

    #[test]
    fn test_disburse_and_repay_full_lifecycle() {
        let env = Env::default();
        env.mock_all_auths();

        let (_admin, investor, token_address, client) = setup_pool(&env);
        let token = token::Client::new(&env, &token_address);
        let borrower = Address::generate(&env);
        let contractor = Address::generate(&env);
        let loan_id = mock_loan_id(&env);

        // Fund the pool.
        client.deposit(&investor, &70_000_0000000i128);

        // Request + approve loan.
        client.request_loan(&borrower, &loan_id, &70_000_0000000i128);
        client.approve_loan(&loan_id);

        // Disburse 30,000 to contractor (first milestone).
        client.disburse(&loan_id, &contractor, &30_000_0000000i128);
        assert_eq!(token.balance(&contractor), 30_000_0000000i128);
        assert_eq!(client.get_liquidity(), 40_000_0000000i128);

        // Disburse remaining 40,000.
        client.disburse(&loan_id, &contractor, &40_000_0000000i128);
        let loan = client.get_loan_info(&loan_id);
        assert_eq!(loan.disbursed, 70_000_0000000i128);

        // Borrower repays. Total owed = 70,000 + 8% = 75,600.
        let sac = StellarAssetClient::new(&env, &token_address);
        sac.mint(&borrower, &80_000_0000000i128);

        client.repay(&borrower, &loan_id, &75_600_0000000i128);
        let loan = client.get_loan_info(&loan_id);
        assert_eq!(loan.status, LoanStatus::Repaid);
        assert_eq!(loan.repaid, 75_600_0000000i128);
    }

    #[test]
    fn test_disburse_over_principal_fails() {
        let env = Env::default();
        env.mock_all_auths();

        let (_admin, investor, _token_address, client) = setup_pool(&env);
        let borrower = Address::generate(&env);
        let contractor = Address::generate(&env);
        let loan_id = mock_loan_id(&env);

        client.deposit(&investor, &50_000_0000000i128);
        client.request_loan(&borrower, &loan_id, &10_000_0000000i128);
        client.approve_loan(&loan_id);

        // Try to disburse more than principal.
        let result = client.try_disburse(&loan_id, &contractor, &20_000_0000000i128);
        assert!(result.is_err());
    }

    #[test]
    fn test_repay_overpayment_fails() {
        let env = Env::default();
        env.mock_all_auths();

        let (_admin, investor, token_address, client) = setup_pool(&env);
        let borrower = Address::generate(&env);
        let loan_id = mock_loan_id(&env);

        client.deposit(&investor, &50_000_0000000i128);
        client.request_loan(&borrower, &loan_id, &10_000_0000000i128);
        client.approve_loan(&loan_id);

        // Mint USDC to borrower for repayment.
        let sac = StellarAssetClient::new(&env, &token_address);
        sac.mint(&borrower, &20_000_0000000i128);

        // Total owed = 10,000 + 8% = 10,800. Try to repay 15,000.
        let result = client.try_repay(&borrower, &loan_id, &15_000_0000000i128);
        assert!(result.is_err());
    }
}
