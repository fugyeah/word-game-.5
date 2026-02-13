pub const MAX_CONTRIBUTORS: usize = 64;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ContributorRecord {
    pub contributor: [u8; 32],
    pub total_contributed_lamports: u64,
    pub claimable_lamports: u64,
    pub claimed_lamports: u64,
    pub is_initialized: bool,
    pub has_claimed_current_round: bool,
}

impl ContributorRecord {
    pub fn empty() -> Self {
        Self {
            contributor: [0u8; 32],
            total_contributed_lamports: 0,
            claimable_lamports: 0,
            claimed_lamports: 0,
            is_initialized: false,
            has_claimed_current_round: false,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RoundState {
    pub round_id: u64,
    pub is_closed: bool,
    pub total_round_contributions: u64,
    pub total_round_claimable: u64,
    pub total_round_claimed: u64,
    pub owner_withdrawable_lamports: u64,
    pub owner_has_withdrawn: bool,
}

impl RoundState {
    pub fn new(round_id: u64) -> Self {
        Self {
            round_id,
            is_closed: false,
            total_round_contributions: 0,
            total_round_claimable: 0,
            total_round_claimed: 0,
            owner_withdrawable_lamports: 0,
            owner_has_withdrawn: false,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct WordGameAccount {
    pub owner: [u8; 32],
    pub treasury_bps: u16,
    pub current_round: RoundState,
    pub contributors: Vec<ContributorRecord>,
}

impl WordGameAccount {
    pub fn new(owner: [u8; 32], treasury_bps: u16) -> Self {
        Self {
            owner,
            treasury_bps,
            current_round: RoundState::new(1),
            contributors: vec![ContributorRecord::empty(); MAX_CONTRIBUTORS],
        }
    }
}
