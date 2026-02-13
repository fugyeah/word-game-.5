use anchor_lang::prelude::*;

declare_id!("7fB9iz3f9t3CFjYg8G9Y1vWmoW8hS1E7xJ4WwGmXh7Xu");

#[program]
pub mod word_game_anchor {
    use super::*;

    pub fn initialize_game(
        ctx: Context<InitializeGame>,
        request_cooldown_seconds: i64,
        max_retries: u8,
    ) -> Result<()> {
        require!(
            request_cooldown_seconds >= 0,
            WordGameError::InvalidCooldown
        );
        require!(max_retries > 0, WordGameError::InvalidRetryLimit);

        let game = &mut ctx.accounts.game;
        let randomness = &mut ctx.accounts.randomness;

        game.authority = ctx.accounts.authority.key();
        game.randomness_account = randomness.key();
        game.status = GameStatus::ReadyToRoll;
        game.settled = false;
        game.last_request_timestamp = 0;
        game.request_cooldown_seconds = request_cooldown_seconds;
        game.retry_count = 0;
        game.max_retries = max_retries;
        game.last_callback_slot = 0;
        game.pending_request_id = [0u8; 32];
        game.last_outcome = 0;

        randomness.authority = ctx.accounts.authority.key();
        randomness.game = game.key();
        randomness.oracle_authority = ctx.accounts.oracle_authority.key();
        randomness.last_request_id = [0u8; 32];
        randomness.last_fulfilled_request_id = [0u8; 32];
        randomness.last_callback_slot = 0;

        Ok(())
    }

    pub fn request_roll(ctx: Context<RequestRoll>, request_id: [u8; 32]) -> Result<()> {
        let game_key = ctx.accounts.game.key();
        let randomness_key = ctx.accounts.randomness.key();
        let authority_key = ctx.accounts.authority.key();

        let game = &mut ctx.accounts.game;
        let randomness = &mut ctx.accounts.randomness;

        validate_randomness_link(game, game_key, randomness, randomness_key, authority_key)?;

        require!(
            matches!(
                game.status,
                GameStatus::ReadyToRoll | GameStatus::PointEstablished
            ),
            WordGameError::InvalidGameState
        );
        require!(!game.settled, WordGameError::GameAlreadySettled);

        let now = Clock::get()?.unix_timestamp;
        if game.last_request_timestamp != 0 {
            let elapsed = now.saturating_sub(game.last_request_timestamp);
            require!(
                elapsed >= game.request_cooldown_seconds,
                WordGameError::CooldownActive
            );
        }

        require!(
            game.retry_count < game.max_retries,
            WordGameError::RetriesExhausted
        );
        require!(request_id != [0u8; 32], WordGameError::InvalidRequestId);

        game.last_request_timestamp = now;
        game.retry_count = game.retry_count.saturating_add(1);
        game.pending_request_id = request_id;
        randomness.last_request_id = request_id;

        Ok(())
    }

    pub fn consume_randomness_callback(
        ctx: Context<ConsumeRandomnessCallback>,
        request_id: [u8; 32],
        randomness_bytes: Vec<u8>,
    ) -> Result<()> {
        let game_key = ctx.accounts.game.key();
        let randomness_key = ctx.accounts.randomness.key();

        let game = &mut ctx.accounts.game;
        let randomness = &mut ctx.accounts.randomness;

        validate_randomness_link(game, game_key, randomness, randomness_key, game.authority)?;
        require_keys_eq!(
            ctx.accounts.oracle_authority.key(),
            randomness.oracle_authority,
            WordGameError::InvalidOracleAuthority
        );
        require!(!game.settled, WordGameError::GameAlreadySettled);
        require!(request_id != [0u8; 32], WordGameError::InvalidRequestId);

        let slot = Clock::get()?.slot;
        require!(
            slot > game.last_callback_slot,
            WordGameError::NonMonotonicCallbackSlot
        );
        require!(
            slot > randomness.last_callback_slot,
            WordGameError::NonMonotonicCallbackSlot
        );

        require!(
            game.pending_request_id == request_id,
            WordGameError::RequestCorrelationMismatch
        );
        require!(
            randomness.last_request_id == request_id,
            WordGameError::RequestCorrelationMismatch
        );

        let outcome = rejection_sample_sum_2_to_12(&randomness_bytes)?;
        game.last_outcome = outcome;
        game.last_callback_slot = slot;
        game.pending_request_id = [0u8; 32];
        game.retry_count = 0;
        game.settled = true;
        game.status = GameStatus::Settled;

        randomness.last_fulfilled_request_id = request_id;
        randomness.last_callback_slot = slot;

        Ok(())
    }
}

fn validate_randomness_link(
    game: &GameState,
    game_key: Pubkey,
    randomness: &GameRandomness,
    randomness_key: Pubkey,
    expected_authority: Pubkey,
) -> Result<()> {
    require_keys_eq!(
        game.authority,
        expected_authority,
        WordGameError::InvalidAuthority
    );
    require_keys_eq!(
        game.randomness_account,
        randomness_key,
        WordGameError::RandomnessAccountMismatch
    );
    require_keys_eq!(
        randomness.game,
        game_key,
        WordGameError::GameAccountMismatch
    );
    require_keys_eq!(
        randomness.authority,
        game.authority,
        WordGameError::RandomnessAuthorityMismatch
    );
    Ok(())
}

pub fn rejection_sample_sum_2_to_12(randomness_bytes: &[u8]) -> Result<u8> {
    const BINS: u8 = 11;
    const ACCEPTANCE_BOUND: u8 = 253;

    for &byte in randomness_bytes {
        if byte < ACCEPTANCE_BOUND {
            return Ok((byte % BINS) + 2);
        }
    }

    err!(WordGameError::InsufficientRandomnessEntropy)
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum GameStatus {
    ReadyToRoll,
    PointEstablished,
    Settled,
}

#[account]
pub struct GameState {
    pub authority: Pubkey,
    pub randomness_account: Pubkey,
    pub status: GameStatus,
    pub settled: bool,
    pub last_request_timestamp: i64,
    pub request_cooldown_seconds: i64,
    pub retry_count: u8,
    pub max_retries: u8,
    pub last_callback_slot: u64,
    pub pending_request_id: [u8; 32],
    pub last_outcome: u8,
}

impl GameState {
    pub const SPACE: usize = 8 + 32 + 32 + 1 + 1 + 8 + 8 + 1 + 1 + 8 + 32 + 1;
}

#[account]
pub struct GameRandomness {
    pub authority: Pubkey,
    pub game: Pubkey,
    pub oracle_authority: Pubkey,
    pub last_request_id: [u8; 32],
    pub last_fulfilled_request_id: [u8; 32],
    pub last_callback_slot: u64,
}

impl GameRandomness {
    pub const SPACE: usize = 8 + 32 + 32 + 32 + 32 + 32 + 8;
}

#[derive(Accounts)]
pub struct InitializeGame<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    /// CHECK: Program-side pubkey validation only.
    pub oracle_authority: UncheckedAccount<'info>,
    #[account(
        init,
        payer = authority,
        space = GameState::SPACE
    )]
    pub game: Account<'info, GameState>,
    #[account(
        init,
        payer = authority,
        space = GameRandomness::SPACE
    )]
    pub randomness: Account<'info, GameRandomness>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RequestRoll<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(mut, has_one = authority)]
    pub game: Account<'info, GameState>,
    #[account(mut)]
    pub randomness: Account<'info, GameRandomness>,
}

#[derive(Accounts)]
pub struct ConsumeRandomnessCallback<'info> {
    #[account(mut)]
    pub oracle_authority: Signer<'info>,
    #[account(mut)]
    pub game: Account<'info, GameState>,
    #[account(mut)]
    pub randomness: Account<'info, GameRandomness>,
}

#[error_code]
pub enum WordGameError {
    #[msg("The game state does not allow a new randomness request")]
    InvalidGameState,
    #[msg("The cooldown between requests has not elapsed")]
    CooldownActive,
    #[msg("The game has already been settled")]
    GameAlreadySettled,
    #[msg("Maximum retry limit reached")]
    RetriesExhausted,
    #[msg("Provided request id is invalid")]
    InvalidRequestId,
    #[msg("Game and randomness account mismatch")]
    RandomnessAccountMismatch,
    #[msg("Randomness account does not point to this game")]
    GameAccountMismatch,
    #[msg("Randomness account authority mismatch")]
    RandomnessAuthorityMismatch,
    #[msg("Invalid authority")]
    InvalidAuthority,
    #[msg("Invalid oracle authority")]
    InvalidOracleAuthority,
    #[msg("Callback slot must increase monotonically")]
    NonMonotonicCallbackSlot,
    #[msg("Callback request id does not match pending request")]
    RequestCorrelationMismatch,
    #[msg("Randomness payload does not include enough entropy")]
    InsufficientRandomnessEntropy,
    #[msg("Invalid cooldown value")]
    InvalidCooldown,
    #[msg("Invalid retry limit")]
    InvalidRetryLimit,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn map_byte(b: u8) -> Option<u8> {
        rejection_sample_sum_2_to_12(&[b]).ok()
    }

    #[test]
    fn rejection_sampling_is_uniform_across_accepted_domain() {
        let mut counts = [0u16; 11];

        for b in 0u8..253u8 {
            let mapped = map_byte(b).expect("bytes under 253 must map");
            let idx = (mapped - 2) as usize;
            counts[idx] += 1;
        }

        for count in counts {
            assert_eq!(count, 23);
        }
    }

    #[test]
    fn rejection_sampling_uses_next_byte_when_first_is_rejected() {
        let roll = rejection_sample_sum_2_to_12(&[255, 252]).expect("second byte accepted");
        assert_eq!(roll, 12);
    }

    #[test]
    fn rejection_sampling_fails_when_all_bytes_rejected() {
        let err = rejection_sample_sum_2_to_12(&[253, 254, 255]).unwrap_err();
        match err {
            Error::AnchorError(anchor_err) => {
                assert_eq!(
                    anchor_err.error_code_number,
                    6000 + WordGameError::InsufficientRandomnessEntropy as u32
                );
            }
            _ => panic!("unexpected error variant"),
        }
    }

    #[test]
    fn callback_rejects_mismatched_request_id_state() {
        let mut game = GameState {
            authority: Pubkey::new_unique(),
            randomness_account: Pubkey::new_unique(),
            status: GameStatus::PointEstablished,
            settled: false,
            last_request_timestamp: 50,
            request_cooldown_seconds: 5,
            retry_count: 1,
            max_retries: 3,
            last_callback_slot: 9,
            pending_request_id: [3u8; 32],
            last_outcome: 0,
        };

        let mut rand = GameRandomness {
            authority: game.authority,
            game: Pubkey::new_unique(),
            oracle_authority: Pubkey::new_unique(),
            last_request_id: [4u8; 32],
            last_fulfilled_request_id: [0u8; 32],
            last_callback_slot: 9,
        };

        let validation = (|| -> Result<()> {
            require!(
                game.pending_request_id == rand.last_request_id,
                WordGameError::RequestCorrelationMismatch
            );
            game.settled = true;
            rand.last_fulfilled_request_id = rand.last_request_id;
            Ok(())
        })();

        assert!(validation.is_err());
        assert!(!game.settled);
        assert_eq!(rand.last_fulfilled_request_id, [0u8; 32]);
    }
}
