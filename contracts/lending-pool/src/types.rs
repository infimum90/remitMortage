use soroban_sdk::{contracttype, Address, BytesN};

/// Tranche types for risk stratification of investor deposits.
///
/// Senior tranche offers a lower, fixed yield rate but is protected from losses.
/// Junior tranche absorbs first losses in exchange for higher, variable yield.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
#[repr(u32)]
pub enum Tranche {
    /// Lower fixed yield, protected from losses until junior is exhausted.
    Senior = 0,
    /// Higher variable yield, absorbs losses before senior tranche.
    Junior = 1,
}

/// Pool configuration set during initialization.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct PoolConfig {
    /// Admin address with authority to approve loans and manage the pool.
    pub admin: Address,
    /// USDC token contract address.
    pub token: Address,
    /// Annual interest rate in basis points (e.g. 800 = 8%).
    pub interest_rate_bps: u32,
    /// Fixed yield rate allocated to senior tranche in basis points (e.g. 400 = 4%).
    pub senior_rate_bps: u32,
}

/// Tracks an individual investor's capital contribution.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct InvestorRecord {
    /// Total deposited by this investor.
    pub deposited: i128,
    /// Ledger when first deposit was made.
    pub start_ledger: u32,
    /// The tranche this investor deposited into.
    pub tranche: Tranche,
    /// Accumulated yield credited to this investor (not yet withdrawn).
    pub accrued_yield: i128,
    /// Total losses absorbed by this investor (only non-zero for junior tranche).
    pub absorbed_loss: i128,
}

/// Per-tranche aggregate metrics stored in instance storage.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct TrancheInfo {
    /// Total capital deposited into this tranche.
    pub total_deposited: i128,
    /// Total yield distributed to this tranche so far.
    pub total_yield_distributed: i128,
    /// Total losses absorbed by this tranche so far.
    pub total_loss_absorbed: i128,
}

/// Loan status lifecycle.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
#[repr(u32)]
pub enum LoanStatus {
    /// Loan has been requested but not yet approved.
    Requested = 0,
    /// Loan is approved and funds can be disbursed in milestones.
    Approved = 1,
    /// Loan has been fully repaid.
    Repaid = 2,
    /// Loan was rejected or cancelled.
    Cancelled = 3,
    /// Loan defaulted — losses are distributed via the waterfall.
    Defaulted = 4,
}

/// A loan record for a borrower.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct LoanRecord {
    /// The borrower's address.
    pub borrower: Address,
    /// Total loan principal (the 70% amount).
    pub principal: i128,
    /// Amount already disbursed to contractors/suppliers.
    pub disbursed: i128,
    /// Amount repaid by the borrower so far.
    pub repaid: i128,
    /// Interest rate in basis points (snapshot from pool config at creation).
    pub interest_rate_bps: u32,
    /// Current loan status.
    pub status: LoanStatus,
    /// Ledger when the loan was created.
    pub created_ledger: u32,
}

/// Storage keys for the lending pool contract.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Pool configuration.
    Config,
    /// Investor record keyed by investor address.
    Investor(Address),
    /// Total available liquidity in the pool.
    TotalLiquidity,
    /// Loan record keyed by a unique loan ID (hash).
    Loan(BytesN<32>),
    /// Total number of active loans (for tracking).
    LoanCount,
    /// Aggregate info for the senior tranche.
    SeniorTranche,
    /// Aggregate info for the junior tranche.
    JuniorTranche,
}
