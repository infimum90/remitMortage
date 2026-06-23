use soroban_sdk::{contracttype, Address, BytesN};

/// Configuration for the milestone contract.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct MilestoneConfig {
    pub admin: Address,
    pub token: Address,
    pub lending_pool: Address,
}

/// Milestone status lifecycle.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
#[repr(u32)]
pub enum MilestoneStatus {
    Proposed = 0,
    Approved = 1,
    Disbursed = 2,
}

/// Milestone record stored on-chain.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct MilestoneRecord {
    pub loan_id: BytesN<32>,
    pub contractor: Address,
    pub amount: i128,
    pub evidence: BytesN<32>,
    pub status: MilestoneStatus,
    pub created_ledger: u32,
}

/// Storage keys for the milestone contract.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Config,
    /// Milestone keyed by ID (BytesN<32>)
    Milestone(BytesN<32>),
    /// Total number of milestones
    MilestoneCount,
}
