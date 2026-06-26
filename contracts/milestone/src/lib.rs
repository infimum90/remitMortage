#![no_std]

mod errors;
mod types;

use crate::errors::MilestoneError;
use crate::types::{DataKey, MilestoneConfig, MilestoneRecord, MilestoneStatus};
use soroban_sdk::{
    contract, contractimpl, symbol_short, vec, Address, Bytes, BytesN, Env, IntoVal, Symbol, Val,
    Vec,
};

const INSTANCE_LIFETIME_THRESHOLD: u32 = 129_600; // ~7.5 days
const INSTANCE_BUMP_AMOUNT: u32 = 518_400; // ~30 days

/// Milestone Disbursement Contract
///
/// Manages releasing funds from the lending pool to whitelisted
/// contractors as construction milestones are completed. Contractors
/// propose milestone completion with an IPFS evidence hash, a multisig
/// set of governance approvers votes to approve it, and once the approval
/// threshold is met the admin releases the funds via a cross-contract
/// call to the lending pool's `disburse` function.
#[contract]
pub struct MilestoneContract;

/// Internal helpers.
impl MilestoneContract {
    fn read_config(env: &Env) -> Result<MilestoneConfig, MilestoneError> {
        env.storage()
            .instance()
            .get(&DataKey::Config)
            .ok_or(MilestoneError::NotInitialized)
    }

    fn read_milestone(
        env: &Env,
        proposal_id: &BytesN<32>,
    ) -> Result<MilestoneRecord, MilestoneError> {
        env.storage()
            .persistent()
            .get(&DataKey::Milestone(proposal_id.clone()))
            .ok_or(MilestoneError::MilestoneNotFound)
    }

    fn set_milestone(env: &Env, proposal_id: &BytesN<32>, record: &MilestoneRecord) {
        env.storage()
            .persistent()
            .set(&DataKey::Milestone(proposal_id.clone()), record);
    }

    fn bump_instance(env: &Env) {
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
    }

    /// Validate that `cid` is a well-formed IPFS CID.
    /// Accepts CIDv0 (46 bytes, starts with "Qm") or CIDv1 (59 bytes, starts with "bafy").
    fn validate_cid(cid: &Bytes) -> Result<(), MilestoneError> {
        let len = cid.len();
        if len == 46
            && cid.get(0) == Some(b'Q' as u32)
            && cid.get(1) == Some(b'm' as u32)
        {
            return Ok(());
        }
        if len == 59
            && cid.get(0) == Some(b'b' as u32)
            && cid.get(1) == Some(b'a' as u32)
            && cid.get(2) == Some(b'f' as u32)
            && cid.get(3) == Some(b'y' as u32)
        {
            return Ok(());
        }
        Err(MilestoneError::InvalidCidFormat)
    }
}

#[contractimpl]
impl MilestoneContract {
    /// Initialize the contract with the admin, token, linked lending pool,
    /// and the multisig governance approver set + approval threshold.
    pub fn initialize(
        env: Env,
        admin: Address,
        token: Address,
        lending_pool: Address,
        approvers: Vec<Address>,
        threshold: u32,
    ) -> Result<(), MilestoneError> {
        if env.storage().instance().has(&DataKey::Config) {
            return Err(MilestoneError::AlreadyInitialized);
        }

        admin.require_auth();

        // Threshold must be achievable: at least one approver and no more
        // votes required than there are approvers.
        if threshold == 0 || threshold > approvers.len() {
            return Err(MilestoneError::InvalidThreshold);
        }

        let config = MilestoneConfig {
            admin,
            token,
            lending_pool,
            approvers,
            threshold,
        };
        env.storage().instance().set(&DataKey::Config, &config);
        env.storage()
            .instance()
            .set(&DataKey::MilestoneCount, &0u32);
        Self::bump_instance(&env);

        Ok(())
    }

    /// Propose a milestone completion for a loan. Stored in `Proposed` status
    /// with zero votes. The contractor must authorize the proposal.
    pub fn propose_milestone(
        env: Env,
        contractor: Address,
        proposal_id: BytesN<32>,
        loan_id: BytesN<32>,
        amount: i128,
        evidence_hash: BytesN<32>,
        cid: Bytes,
    ) -> Result<(), MilestoneError> {
        contractor.require_auth();

        // Ensure initialized.
        let _config = Self::read_config(&env)?;

        if amount <= 0 {
            return Err(MilestoneError::InvalidAmount);
        }

        // Evidence hash must not be zeroed.
        let zero: BytesN<32> = BytesN::from_array(&env, &[0u8; 32]);
        if evidence_hash == zero {
            return Err(MilestoneError::EvidenceRequired);
        }

        // Validate IPFS CID format before storing.
        Self::validate_cid(&cid)?;

        // Proposal IDs are unique; do not clobber an existing milestone.
        if env
            .storage()
            .persistent()
            .has(&DataKey::Milestone(proposal_id.clone()))
        {
            return Err(MilestoneError::MilestoneExists);
        }

        let record = MilestoneRecord {
            loan_id,
            contractor,
            amount,
            evidence_hash,
            cid,
            status: MilestoneStatus::Proposed,
            votes: 0,
            created_ledger: env.ledger().sequence(),
        };
        Self::set_milestone(&env, &proposal_id, &record);

        let count: u32 = env
            .storage()
            .instance()
            .get(&DataKey::MilestoneCount)
            .unwrap_or(0u32);
        env.storage()
            .instance()
            .set(&DataKey::MilestoneCount, &(count + 1));

        Self::bump_instance(&env);

        Ok(())
    }

    /// Cast a governance approval vote for a proposed milestone.
    ///
    /// Only addresses in the configured multisig approver set may vote, each
    /// at most once per proposal. Once the configured threshold of votes is
    /// reached the milestone transitions to `Approved`.
    pub fn approve_milestone(
        env: Env,
        approver: Address,
        proposal_id: BytesN<32>,
    ) -> Result<(), MilestoneError> {
        approver.require_auth();

        let config = Self::read_config(&env)?;

        // Only configured multisig approvers may vote.
        if !config.approvers.contains(&approver) {
            return Err(MilestoneError::Unauthorized);
        }

        let mut record = Self::read_milestone(&env, &proposal_id)?;
        if record.status != MilestoneStatus::Proposed {
            return Err(MilestoneError::InvalidStatus);
        }

        // Each approver may only vote once per proposal.
        let voted_key = DataKey::Voted(proposal_id.clone(), approver.clone());
        if env.storage().persistent().has(&voted_key) {
            return Err(MilestoneError::AlreadyVoted);
        }
        env.storage().persistent().set(&voted_key, &true);

        record.votes += 1;
        if record.votes >= config.threshold {
            record.status = MilestoneStatus::Approved;
        }
        Self::set_milestone(&env, &proposal_id, &record);

        Self::bump_instance(&env);

        Ok(())
    }

    /// Release an approved milestone by disbursing its funds from the lending
    /// pool to the contractor via a cross-contract call.
    ///
    /// Admin-only. The milestone is marked `Disbursed`, so it can never be
    /// released more than once (preventing over-release of the allocation).
    pub fn release_milestone(env: Env, proposal_id: BytesN<32>) -> Result<(), MilestoneError> {
        let config = Self::read_config(&env)?;
        config.admin.require_auth();

        let mut record = Self::read_milestone(&env, &proposal_id)?;
        if record.status != MilestoneStatus::Approved {
            return Err(MilestoneError::InvalidStatus);
        }

        // Cross-contract call: lending_pool.disburse(loan_id, contractor, amount).
        // The lending pool enforces its own caps (e.g. loan principal) and
        // traps if the amount is invalid, which reverts this release.
        let func: Symbol = symbol_short!("disburse");
        let args: Vec<Val> = vec![
            &env,
            record.loan_id.clone().into_val(&env),
            record.contractor.clone().into_val(&env),
            record.amount.into_val(&env),
        ];
        env.invoke_contract::<()>(&config.lending_pool, &func, args);

        record.status = MilestoneStatus::Disbursed;
        Self::set_milestone(&env, &proposal_id, &record);

        Self::bump_instance(&env);

        Ok(())
    }

    /// Fetch a milestone record by proposal ID.
    pub fn get_milestone(
        env: Env,
        proposal_id: BytesN<32>,
    ) -> Result<MilestoneRecord, MilestoneError> {
        Self::read_milestone(&env, &proposal_id)
    }

    /// Returns the contract version.
    pub fn version(_env: Env) -> u32 {
        1
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, vec, Bytes, BytesN, Env, Vec};

    fn make_client(env: &Env) -> (Address, MilestoneContractClient<'_>) {
        let admin = Address::generate(env);
        let token = Address::generate(env);
        let lending = Address::generate(env);
        let approver = Address::generate(env);
        let approvers: Vec<Address> = vec![env, approver];
        let contract_id = env.register(MilestoneContract, ());
        let client = MilestoneContractClient::new(env, &contract_id);
        client.initialize(&admin, &token, &lending, &approvers, &1u32);
        (admin, client)
    }

    fn cidv0(env: &Env) -> Bytes {
        // 46-byte v0 CID starting with "Qm"
        let mut raw = [b'x'; 46];
        raw[0] = b'Q';
        raw[1] = b'm';
        Bytes::from_slice(env, &raw)
    }

    fn cidv1(env: &Env) -> Bytes {
        // 59-byte v1 CID starting with "bafy"
        let mut raw = [b'x'; 59];
        raw[0] = b'b';
        raw[1] = b'a';
        raw[2] = b'f';
        raw[3] = b'y';
        Bytes::from_slice(env, &raw)
    }

    #[test]
    fn test_initialize_and_double_init() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let token = Address::generate(&env);
        let lending = Address::generate(&env);
        let approver = Address::generate(&env);
        let approvers: Vec<Address> = vec![&env, approver];

        let contract_id = env.register(MilestoneContract, ());
        let client = MilestoneContractClient::new(&env, &contract_id);

        client.initialize(&admin, &token, &lending, &approvers, &1u32);

        let res = client.try_initialize(&admin, &token, &lending, &approvers, &1u32);
        assert_eq!(res.unwrap_err(), Ok(MilestoneError::AlreadyInitialized));
    }

    #[test]
    fn test_propose_milestone_creates_record() {
        let env = Env::default();
        env.mock_all_auths();

        let contractor = Address::generate(&env);
        let (_admin, client) = make_client(&env);

        let proposal_id = BytesN::from_array(&env, &[1u8; 32]);
        let loan_id = BytesN::from_array(&env, &[2u8; 32]);
        let evidence = BytesN::from_array(&env, &[3u8; 32]);
        let cid = cidv0(&env);

        client.propose_milestone(&contractor, &proposal_id, &loan_id, &1000i128, &evidence, &cid);

        let record = client.get_milestone(&proposal_id);
        assert_eq!(record.status, MilestoneStatus::Proposed);
        assert_eq!(record.contractor, contractor);
        assert_eq!(record.amount, 1000i128);
        assert_eq!(record.evidence_hash, evidence);
        assert_eq!(record.cid, cid);
    }

    #[test]
    fn test_invalid_cid_reverts() {
        let env = Env::default();
        env.mock_all_auths();

        let contractor = Address::generate(&env);
        let (_admin, client) = make_client(&env);

        let proposal_id = BytesN::from_array(&env, &[10u8; 32]);
        let loan_id = BytesN::from_array(&env, &[11u8; 32]);
        let evidence = BytesN::from_array(&env, &[12u8; 32]);

        // Too short
        let bad_cid = Bytes::from_slice(&env, b"QmShort");
        let res = client.try_propose_milestone(
            &contractor, &proposal_id, &loan_id, &1000i128, &evidence, &bad_cid,
        );
        assert_eq!(res.unwrap_err(), Ok(MilestoneError::InvalidCidFormat));

        // Correct length but wrong prefix
        let mut wrong_prefix = [b'x'; 46];
        wrong_prefix[0] = b'X';
        wrong_prefix[1] = b'z';
        let bad_cid2 = Bytes::from_slice(&env, &wrong_prefix);
        let res2 = client.try_propose_milestone(
            &contractor, &proposal_id, &loan_id, &1000i128, &evidence, &bad_cid2,
        );
        assert_eq!(res2.unwrap_err(), Ok(MilestoneError::InvalidCidFormat));
    }

    #[test]
    fn test_valid_cidv0_passes() {
        let env = Env::default();
        env.mock_all_auths();

        let contractor = Address::generate(&env);
        let (_admin, client) = make_client(&env);

        let proposal_id = BytesN::from_array(&env, &[20u8; 32]);
        let loan_id = BytesN::from_array(&env, &[21u8; 32]);
        let evidence = BytesN::from_array(&env, &[22u8; 32]);

        client.propose_milestone(
            &contractor, &proposal_id, &loan_id, &500i128, &evidence, &cidv0(&env),
        );
        let record = client.get_milestone(&proposal_id);
        assert_eq!(record.status, MilestoneStatus::Proposed);
    }

    #[test]
    fn test_valid_cidv1_passes() {
        let env = Env::default();
        env.mock_all_auths();

        let contractor = Address::generate(&env);
        let (_admin, client) = make_client(&env);

        let proposal_id = BytesN::from_array(&env, &[30u8; 32]);
        let loan_id = BytesN::from_array(&env, &[31u8; 32]);
        let evidence = BytesN::from_array(&env, &[32u8; 32]);

        client.propose_milestone(
            &contractor, &proposal_id, &loan_id, &750i128, &evidence, &cidv1(&env),
        );
        let record = client.get_milestone(&proposal_id);
        assert_eq!(record.status, MilestoneStatus::Proposed);
    }
}
