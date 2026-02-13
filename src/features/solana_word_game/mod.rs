use crate::types::{ContributorRecord, WordGameAccount, MAX_CONTRIBUTORS};
use thiserror::Error;

#[derive(Error, Debug, PartialEq, Eq)]
pub enum ProgramError {
    #[error("invalid treasury basis points")]
    InvalidTreasuryBps,
    #[error("round is already closed")]
    RoundAlreadyClosed,
    #[error("round is still open")]
    RoundStillOpen,
    #[error("contributor is not registered")]
    ContributorNotFound,
    #[error("contributor table is full")]
    ContributorTableFull,
    #[error("invalid amount")]
    InvalidAmount,
    #[error("already claimed in current round")]
    DoubleClaim,
    #[error("owner already withdrew in current round")]
    DoubleWithdraw,
    #[error("math overflow")]
    MathOverflow,
}

pub type ProgramResult<T> = Result<T, ProgramError>;

pub fn initialize(owner: [u8; 32], treasury_bps: u16) -> ProgramResult<WordGameAccount> {
    if treasury_bps > 10_000 {
        return Err(ProgramError::InvalidTreasuryBps);
    }
    Ok(WordGameAccount::new(owner, treasury_bps))
}

pub fn contribute(
    account: &mut WordGameAccount,
    contributor: [u8; 32],
    lamports: u64,
) -> ProgramResult<()> {
    if lamports == 0 {
        return Err(ProgramError::InvalidAmount);
    }
    if account.current_round.is_closed {
        return Err(ProgramError::RoundAlreadyClosed);
    }

    let idx = find_or_create_contributor_slot(&mut account.contributors, contributor)?;
    let record = &mut account.contributors[idx];

    record.total_contributed_lamports = record
        .total_contributed_lamports
        .checked_add(lamports)
        .ok_or(ProgramError::MathOverflow)?;

    account.current_round.total_round_contributions = account
        .current_round
        .total_round_contributions
        .checked_add(lamports)
        .ok_or(ProgramError::MathOverflow)?;

    Ok(())
}

pub fn close_round(account: &mut WordGameAccount) -> ProgramResult<()> {
    if account.current_round.is_closed {
        return Err(ProgramError::RoundAlreadyClosed);
    }

    let treasury_cut = ((account.current_round.total_round_contributions as u128)
        .checked_mul(account.treasury_bps as u128)
        .ok_or(ProgramError::MathOverflow)?)
        / 10_000u128;
    let treasury_cut_u64 = u64::try_from(treasury_cut).map_err(|_| ProgramError::MathOverflow)?;

    account.current_round.owner_withdrawable_lamports = treasury_cut_u64;
    account.current_round.total_round_claimable = account
        .current_round
        .total_round_contributions
        .checked_sub(treasury_cut_u64)
        .ok_or(ProgramError::MathOverflow)?;

    for record in &mut account.contributors {
        if record.is_initialized {
            let claimable = ((record.total_contributed_lamports as u128)
                .checked_mul((10_000u16 - account.treasury_bps) as u128)
                .ok_or(ProgramError::MathOverflow)?)
                / 10_000u128;
            record.claimable_lamports =
                u64::try_from(claimable).map_err(|_| ProgramError::MathOverflow)?;
            record.claimed_lamports = 0;
            record.has_claimed_current_round = false;
        }
    }

    account.current_round.is_closed = true;
    Ok(())
}

pub fn claim(account: &mut WordGameAccount, contributor: [u8; 32]) -> ProgramResult<u64> {
    if !account.current_round.is_closed {
        return Err(ProgramError::RoundStillOpen);
    }

    let idx = find_contributor_slot(&account.contributors, contributor)
        .ok_or(ProgramError::ContributorNotFound)?;
    let record = &mut account.contributors[idx];

    if record.has_claimed_current_round {
        return Err(ProgramError::DoubleClaim);
    }

    let amount = record.claimable_lamports;
    if amount == 0 {
        return Err(ProgramError::InvalidAmount);
    }

    record.claimed_lamports = amount;
    record.claimable_lamports = 0;
    record.has_claimed_current_round = true;

    account.current_round.total_round_claimed = account
        .current_round
        .total_round_claimed
        .checked_add(amount)
        .ok_or(ProgramError::MathOverflow)?;

    Ok(amount)
}

pub fn owner_withdraw(account: &mut WordGameAccount) -> ProgramResult<u64> {
    if !account.current_round.is_closed {
        return Err(ProgramError::RoundStillOpen);
    }
    if account.current_round.owner_has_withdrawn {
        return Err(ProgramError::DoubleWithdraw);
    }

    let amount = account.current_round.owner_withdrawable_lamports;
    account.current_round.owner_withdrawable_lamports = 0;
    account.current_round.owner_has_withdrawn = true;
    Ok(amount)
}

pub fn reset_round(account: &mut WordGameAccount) -> ProgramResult<()> {
    if !account.current_round.is_closed {
        return Err(ProgramError::RoundStillOpen);
    }

    for record in &mut account.contributors {
        if record.is_initialized {
            record.total_contributed_lamports = 0;
            record.claimable_lamports = 0;
            record.claimed_lamports = 0;
            record.has_claimed_current_round = false;
        }
    }

    let next_round = account
        .current_round
        .round_id
        .checked_add(1)
        .ok_or(ProgramError::MathOverflow)?;
    account.current_round = crate::types::RoundState::new(next_round);

    Ok(())
}

fn find_contributor_slot(
    contributors: &[ContributorRecord],
    contributor: [u8; 32],
) -> Option<usize> {
    contributors
        .iter()
        .position(|record| record.is_initialized && record.contributor == contributor)
}

fn find_or_create_contributor_slot(
    contributors: &mut [ContributorRecord],
    contributor: [u8; 32],
) -> ProgramResult<usize> {
    if let Some(index) = find_contributor_slot(contributors, contributor) {
        return Ok(index);
    }

    let index = contributors
        .iter()
        .position(|record| !record.is_initialized)
        .ok_or(ProgramError::ContributorTableFull)?;

    contributors[index].is_initialized = true;
    contributors[index].contributor = contributor;
    contributors[index].total_contributed_lamports = 0;
    contributors[index].claimable_lamports = 0;
    contributors[index].claimed_lamports = 0;
    contributors[index].has_claimed_current_round = false;

    if index >= MAX_CONTRIBUTORS {
        return Err(ProgramError::ContributorTableFull);
    }

    Ok(index)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn key(seed: u8) -> [u8; 32] {
        [seed; 32]
    }

    #[test]
    fn happy_path_claim_and_owner_withdraw_and_reset() {
        let mut account = initialize(key(1), 1_000).expect("init must succeed");

        contribute(&mut account, key(9), 1_000).expect("contribute1 must succeed");
        contribute(&mut account, key(7), 3_000).expect("contribute2 must succeed");

        close_round(&mut account).expect("close must succeed");

        let claim_1 = claim(&mut account, key(9)).expect("claim1 must succeed");
        let claim_2 = claim(&mut account, key(7)).expect("claim2 must succeed");
        let owner_take = owner_withdraw(&mut account).expect("owner withdraw must succeed");

        assert_eq!(claim_1, 900);
        assert_eq!(claim_2, 2_700);
        assert_eq!(owner_take, 400);
        assert_eq!(account.current_round.total_round_claimed, 3_600);

        reset_round(&mut account).expect("reset must succeed");

        assert_eq!(account.current_round.round_id, 2);
        assert!(!account.current_round.is_closed);
        assert_eq!(account.current_round.total_round_contributions, 0);

        let idx =
            find_contributor_slot(&account.contributors, key(9)).expect("must retain contributor");
        assert_eq!(account.contributors[idx].total_contributed_lamports, 0);
        assert!(!account.contributors[idx].has_claimed_current_round);
    }

    #[test]
    fn blocks_double_claim() {
        let mut account = initialize(key(1), 500).expect("init must succeed");
        contribute(&mut account, key(2), 1_000).expect("contribute must succeed");
        close_round(&mut account).expect("close must succeed");

        let first = claim(&mut account, key(2)).expect("first claim must succeed");
        assert_eq!(first, 950);

        let second = claim(&mut account, key(2));
        assert_eq!(second, Err(ProgramError::DoubleClaim));
    }

    #[test]
    fn blocks_double_owner_withdraw() {
        let mut account = initialize(key(1), 1_000).expect("init must succeed");
        contribute(&mut account, key(4), 2_000).expect("contribute must succeed");
        close_round(&mut account).expect("close must succeed");

        let first = owner_withdraw(&mut account).expect("first withdraw must succeed");
        assert_eq!(first, 200);

        let second = owner_withdraw(&mut account);
        assert_eq!(second, Err(ProgramError::DoubleWithdraw));
    }

    #[test]
    fn errors_when_claim_before_close() {
        let mut account = initialize(key(1), 0).expect("init must succeed");
        contribute(&mut account, key(10), 100).expect("contribute must succeed");
        let claim_result = claim(&mut account, key(10));
        assert_eq!(claim_result, Err(ProgramError::RoundStillOpen));
    }
}
