#![no_std]

mod errors;
mod types;

use crate::errors::MilestoneError;
use crate::types::{DataKey, MilestoneConfig, MilestoneRecord, MilestoneStatus};
use soroban_sdk::{contract, contractimpl, Address, BytesN, Env};

const INSTANCE_LIFETIME_THRESHOLD: u32 = 129_600; // ~7.5 days
const INSTANCE_BUMP_AMOUNT: u32 = 518_400; // ~30 days

/// Milestone Disbursement Contract
#[contract]
pub struct MilestoneContract;

impl MilestoneContract {
    fn read_config(env: &Env) -> Result<MilestoneConfig, MilestoneError> {
        env.storage()
            .instance()
            .get(&DataKey::Config)
            .ok_or(MilestoneError::NotInitialized)
    }

    fn set_milestone(env: &Env, id: &BytesN<32>, record: &MilestoneRecord) {
        env.storage()
            .persistent()
            .set(&DataKey::Milestone(id.clone()), record);
    }
}

#[contractimpl]
impl MilestoneContract {
    /// Initialize the milestone contract with admin, token and lending pool addresses.
    pub fn initialize(env: Env, admin: Address, token: Address, lending_pool: Address) -> Result<(), MilestoneError> {
        if env.storage().instance().has(&DataKey::Config) {
            return Err(MilestoneError::AlreadyInitialized);
        }

        admin.require_auth();

        let config = MilestoneConfig { admin, token, lending_pool };
        env.storage().instance().set(&DataKey::Config, &config);
        env.storage().instance().set(&DataKey::MilestoneCount, &0u32);
        env.storage().instance().extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);

        Ok(())
    }

    /// Propose a new milestone for a loan. Stores the milestone in `Proposed` status.
    pub fn propose_milestone(env: Env, contractor: Address, loan_id: BytesN<32>, amount: i128, evidence: BytesN<32>) -> Result<(), MilestoneError> {
        contractor.require_auth();

        // Ensure initialized
        let _cfg = Self::read_config(&env)?;

        if amount <= 0 {
            return Err(MilestoneError::InvalidAmount);
        }

        // evidence must not be zeroed
        let zero: BytesN<32> = BytesN::from_array(&env, &[0u8; 32]);
        if evidence == zero {
            return Err(MilestoneError::EvidenceRequired);
        }

        // For simple implementation: use the loan_id as the milestone id (one per loan)
        let milestone_id = loan_id.clone();

        let record = MilestoneRecord {
            loan_id: loan_id.clone(),
            contractor: contractor.clone(),
            amount,
            evidence: evidence.clone(),
            status: MilestoneStatus::Proposed,
            created_ledger: env.ledger().sequence(),
        };

        // Persist the milestone
        Self::set_milestone(&env, &milestone_id, &record);

        // increment count
        let count: u32 = env.storage().instance().get(&DataKey::MilestoneCount).unwrap_or(0u32);
        env.storage().instance().set(&DataKey::MilestoneCount, &(count + 1));

        env.storage().instance().extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);

        Ok(())
    }

    /// Returns the contract version.
    pub fn version(_env: Env) -> u32 {
        1
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, BytesN, Env};

    #[test]
    fn test_initialize_and_double_init() {
        let env = Env::default();
        let admin = Address::generate(&env);
        let token = Address::generate(&env);
        let lending = Address::generate(&env);

        let contract_id = env.register(MilestoneContract, ());
        let client = MilestoneContractClient::new(&env, &contract_id);

        // initialize should succeed
        assert_eq!(client.initialize(&admin, &token, &lending), Ok(()));

        // double initialize should return AlreadyInitialized
        let res = client.initialize(&admin, &token, &lending);
        assert_eq!(res, Err(MilestoneError::AlreadyInitialized));
    }

    #[test]
    fn test_propose_milestone_creates_record() {
        let env = Env::default();
        let admin = Address::generate(&env);
        let token = Address::generate(&env);
        let lending = Address::generate(&env);

        let contractor = Address::generate(&env);
        let contract_id = env.register(MilestoneContract, ());
        let client = MilestoneContractClient::new(&env, &contract_id);

        client.initialize(&admin, &token, &lending).unwrap();

        // create a loan_id and evidence
        let loan_id = BytesN::from_array(&env, &[1u8; 32]);
        let evidence = BytesN::from_array(&env, &[2u8; 32]);

        // contractor must auth; in tests Address::generate gives a key that can sign via client helper
        let res = client.propose_milestone(&contractor, &loan_id, &1000i128, &evidence);
        assert_eq!(res, Ok(()));

        // read stored milestone via client low-level storage read
        let record: MilestoneRecord = env.storage().persistent().get(&DataKey::Milestone(loan_id.clone())).expect("milestone missing");
        assert_eq!(record.status, MilestoneStatus::Proposed);
        assert_eq!(record.contractor, contractor);
        assert_eq!(record.amount, 1000i128);
        assert_eq!(record.evidence, evidence);
    }
}
