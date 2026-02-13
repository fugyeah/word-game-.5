use anchor_lang::prelude::*;
use anchor_lang::solana_program::{clock::Clock, program::invoke, system_instruction};

declare_id!("CrpS111111111111111111111111111111111111111");

const CONFIG_SEED: &[u8] = b"config";
const GAME_SEED: &[u8] = b"game";
const MAX_FADERS: usize = 16;
const BPS_DENOMINATOR: u64 = 10_000;

#[program]
pub mod solana_street_craps {
    use super::*;

    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        tax_bps: u16,
        join_timeout_slots: u64,
        roll_timeout_slots: u64,
        max_faders: u8,
    ) -> Result<()> {
        require!(tax_bps <= 2_500, CrapsError::InvalidTaxBps);
        require!(join_timeout_slots > 0, CrapsError::InvalidTimeout);
        require!(roll_timeout_slots > 0, CrapsError::InvalidTimeout);
        require!(max_faders > 0 && (max_faders as usize) <= MAX_FADERS, CrapsError::InvalidMaxFaders);

        let config = &mut ctx.accounts.config;
        config.bump = ctx.bumps.config;
        config.authority = ctx.accounts.authority.key();
        config.randomness_program = ctx.accounts.randomness_program.key();
        config.randomness_authority = ctx.accounts.randomness_authority.key();
        config.treasury = ctx.accounts.treasury.key();
        config.tax_bps = tax_bps;
        config.join_timeout_slots = join_timeout_slots;
        config.roll_timeout_slots = roll_timeout_slots;
        config.max_faders = max_faders;
        config.frozen = false;
        Ok(())
    }

    pub fn update_config(
        ctx: Context<UpdateConfig>,
        tax_bps: u16,
        join_timeout_slots: u64,
        roll_timeout_slots: u64,
        max_faders: u8,
        randomness_program: Pubkey,
        randomness_authority: Pubkey,
        treasury: Pubkey,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        require!(!config.frozen, CrapsError::ConfigFrozen);
        require_keys_eq!(ctx.accounts.authority.key(), config.authority, CrapsError::Unauthorized);
        require!(tax_bps <= 2_500, CrapsError::InvalidTaxBps);
        require!(join_timeout_slots > 0, CrapsError::InvalidTimeout);
        require!(roll_timeout_slots > 0, CrapsError::InvalidTimeout);
        require!(max_faders > 0 && (max_faders as usize) <= MAX_FADERS, CrapsError::InvalidMaxFaders);

        config.tax_bps = tax_bps;
        config.join_timeout_slots = join_timeout_slots;
        config.roll_timeout_slots = roll_timeout_slots;
        config.max_faders = max_faders;
        config.randomness_program = randomness_program;
        config.randomness_authority = randomness_authority;
        config.treasury = treasury;
        Ok(())
    }

    pub fn set_config_frozen(ctx: Context<SetConfigFrozen>, frozen: bool) -> Result<()> {
        let config = &mut ctx.accounts.config;
        require_keys_eq!(ctx.accounts.authority.key(), config.authority, CrapsError::Unauthorized);
        config.frozen = frozen;
        Ok(())
    }

    pub fn create_game(ctx: Context<CreateGame>, game_id: u64, shooter_stake: u64) -> Result<()> {
        let config = &ctx.accounts.config;
        require!(!config.frozen, CrapsError::ConfigFrozen);
        require!(shooter_stake > 0, CrapsError::InvalidStake);

        let game = &mut ctx.accounts.game;
        game.bump = ctx.bumps.game;
        game.game_id = game_id;
        game.config = config.key();
        game.shooter = ctx.accounts.shooter.key();
        game.state = GameState::Open;
        game.shooter_stake = shooter_stake;
        game.total_fader_stake = 0;
        game.total_pot = shooter_stake;
        game.tax_amount = 0;
        game.point = 0;
        game.winner_is_shooter = false;
        game.pending_roll_request = Pubkey::default();
        game.last_roll_slot = 0;
        game.last_action_slot = Clock::get()?.slot;
        game.fader_count = 0;
        game.closed = false;
        game.fader_keys = [Pubkey::default(); MAX_FADERS];
        game.fader_stakes = [0; MAX_FADERS];
        game.fader_payouts = [0; MAX_FADERS];
        game.fader_claimed = [false; MAX_FADERS];
        game.shooter_payout = 0;
        game.shooter_claimed = false;

        transfer_lamports(
            &ctx.accounts.shooter.to_account_info(),
            &ctx.accounts.game.to_account_info(),
            shooter_stake,
            &ctx.accounts.system_program.to_account_info(),
        )?;

        Ok(())
    }

    pub fn join_game(ctx: Context<JoinGame>, fader_stake: u64) -> Result<()> {
        let clock = Clock::get()?;
        let config = &ctx.accounts.config;
        let game = &mut ctx.accounts.game;
        require!(!config.frozen, CrapsError::ConfigFrozen);
        require!(game.state == GameState::Open || game.state == GameState::ReadyToRoll, CrapsError::InvalidState);
        require!(game.shooter != ctx.accounts.fader.key(), CrapsError::ShooterCannotFade);
        require!(fader_stake > 0, CrapsError::InvalidStake);
        require!((game.fader_count as usize) < config.max_faders as usize, CrapsError::TooManyFaders);
        require!(clock.slot <= game.last_action_slot.saturating_add(config.join_timeout_slots), CrapsError::JoinTimeout);

        let existing_index = game.find_fader_index(&ctx.accounts.fader.key());
        let idx = if let Some(existing) = existing_index {
            existing
        } else {
            let next_index = game.fader_count as usize;
            game.fader_keys[next_index] = ctx.accounts.fader.key();
            game.fader_count = game.fader_count.checked_add(1).ok_or(CrapsError::MathOverflow)?;
            next_index
        };

        game.fader_stakes[idx] = game.fader_stakes[idx].checked_add(fader_stake).ok_or(CrapsError::MathOverflow)?;
        game.total_fader_stake = game.total_fader_stake.checked_add(fader_stake).ok_or(CrapsError::MathOverflow)?;
        game.total_pot = game.total_pot.checked_add(fader_stake).ok_or(CrapsError::MathOverflow)?;
        game.state = GameState::ReadyToRoll;
        game.last_action_slot = clock.slot;

        transfer_lamports(
            &ctx.accounts.fader.to_account_info(),
            &ctx.accounts.game.to_account_info(),
            fader_stake,
            &ctx.accounts.system_program.to_account_info(),
        )?;

        Ok(())
    }

    pub fn request_roll(ctx: Context<RequestRoll>, roll_request: Pubkey) -> Result<()> {
        let clock = Clock::get()?;
        let config = &ctx.accounts.config;
        let game = &mut ctx.accounts.game;
        require!(!config.frozen, CrapsError::ConfigFrozen);
        require_keys_eq!(ctx.accounts.shooter.key(), game.shooter, CrapsError::Unauthorized);
        require!(game.state == GameState::ReadyToRoll || game.state == GameState::PointEstablished, CrapsError::InvalidState);
        require!(roll_request != Pubkey::default(), CrapsError::InvalidRollRequest);
        require!(game.pending_roll_request == Pubkey::default(), CrapsError::InvalidState);
        require!(clock.slot <= game.last_action_slot.saturating_add(config.roll_timeout_slots), CrapsError::RollRequestTimeout);

        game.pending_roll_request = roll_request;
        game.state = GameState::Rolling;
        game.last_roll_slot = clock.slot;
        game.last_action_slot = clock.slot;
        Ok(())
    }

    pub fn consume_randomness_callback(
        ctx: Context<ConsumeRandomnessCallback>,
        roll_request: Pubkey,
        random_word: u64,
    ) -> Result<()> {
        let game = &mut ctx.accounts.game;
        let config = &ctx.accounts.config;
        require_keys_eq!(ctx.accounts.randomness_program.key(), config.randomness_program, CrapsError::InvalidRandomnessProgram);
        require!(ctx.accounts.randomness_program.executable, CrapsError::InvalidRandomnessProgram);
        require_keys_eq!(ctx.accounts.randomness_authority.key(), config.randomness_authority, CrapsError::Unauthorized);
        require!(ctx.accounts.randomness_authority.is_signer, CrapsError::MissingSigner);
        require!(game.state == GameState::Rolling, CrapsError::InvalidState);
        require_keys_eq!(game.pending_roll_request, roll_request, CrapsError::InvalidRollRequest);

        let die_one = (random_word % 6) + 1;
        let die_two = ((random_word / 6) % 6) + 1;
        let roll = die_one + die_two;

        match game.point {
            0 => {
                if roll == 7 || roll == 11 {
                    settle_game(game, config, true)?;
                } else if roll == 2 || roll == 3 || roll == 12 {
                    settle_game(game, config, false)?;
                } else {
                    game.point = roll as u8;
                    game.state = GameState::PointEstablished;
                }
            }
            point => {
                if roll == point as u64 {
                    settle_game(game, config, true)?;
                } else if roll == 7 {
                    settle_game(game, config, false)?;
                } else {
                    game.state = GameState::PointEstablished;
                }
            }
        }

        game.pending_roll_request = Pubkey::default();
        game.last_action_slot = Clock::get()?.slot;
        Ok(())
    }

    pub fn cancel_game(ctx: Context<CancelGame>) -> Result<()> {
        let game = &mut ctx.accounts.game;
        require_keys_eq!(ctx.accounts.shooter.key(), game.shooter, CrapsError::Unauthorized);
        require!(game.state == GameState::Open || game.state == GameState::ReadyToRoll, CrapsError::InvalidState);
        game.state = GameState::Canceled;
        game.last_action_slot = Clock::get()?.slot;
        Ok(())
    }

    pub fn withdraw_cancelled(ctx: Context<WithdrawCancelled>) -> Result<()> {
        let game = &mut ctx.accounts.game;
        require!(game.state == GameState::Canceled, CrapsError::InvalidState);

        let claimer = ctx.accounts.claimer.key();
        let payout = if claimer == game.shooter {
            require!(!game.shooter_claimed, CrapsError::AlreadyClaimed);
            game.shooter_claimed = true;
            game.shooter_stake
        } else if let Some(i) = game.find_fader_index(&claimer) {
            require!(!game.fader_claimed[i], CrapsError::AlreadyClaimed);
            game.fader_claimed[i] = true;
            game.fader_stakes[i]
        } else {
            return err!(CrapsError::NotParticipant);
        };

        payout_from_game(game, payout, &ctx.accounts.claimer.to_account_info())?;
        Ok(())
    }

    pub fn forfeit_unrolled(ctx: Context<ForfeitUnrolled>) -> Result<()> {
        let clock = Clock::get()?;
        let config = &ctx.accounts.config;
        let game = &mut ctx.accounts.game;
        require!(
            ctx.accounts.caller.key() == game.shooter || game.find_fader_index(&ctx.accounts.caller.key()).is_some(),
            CrapsError::Unauthorized
        );
        require!(game.state == GameState::ReadyToRoll || game.state == GameState::PointEstablished, CrapsError::InvalidState);
        require!(clock.slot > game.last_action_slot.saturating_add(config.roll_timeout_slots), CrapsError::RollWindowActive);
        settle_game(game, config, false)?;
        game.last_action_slot = clock.slot;
        Ok(())
    }

    pub fn claim_payout(ctx: Context<ClaimPayout>) -> Result<()> {
        let game = &mut ctx.accounts.game;
        require!(game.state == GameState::Settled, CrapsError::InvalidState);

        if ctx.accounts.claimer.key() == game.shooter {
            require!(!game.shooter_claimed, CrapsError::AlreadyClaimed);
            let shooter_payout = game.shooter_payout;
            game.shooter_claimed = true;
            payout_from_game(game, shooter_payout, &ctx.accounts.claimer.to_account_info())?;
            return Ok(());
        }

        let Some(index) = game.find_fader_index(&ctx.accounts.claimer.key()) else {
            return err!(CrapsError::NotParticipant);
        };
        require!(!game.fader_claimed[index], CrapsError::AlreadyClaimed);
        let amount = game.fader_payouts[index];
        game.fader_claimed[index] = true;
        payout_from_game(game, amount, &ctx.accounts.claimer.to_account_info())?;
        Ok(())
    }

    pub fn close_game(ctx: Context<CloseGame>) -> Result<()> {
        let game = &mut ctx.accounts.game;
        require_keys_eq!(ctx.accounts.shooter.key(), game.shooter, CrapsError::Unauthorized);
        require!(!game.closed, CrapsError::AlreadyClosed);
        require!(game.state == GameState::Settled || game.state == GameState::Canceled, CrapsError::InvalidState);

        if game.state == GameState::Settled {
            require!(game.shooter_claimed, CrapsError::OutstandingClaims);
            for i in 0..game.fader_count as usize {
                if game.fader_payouts[i] > 0 {
                    require!(game.fader_claimed[i], CrapsError::OutstandingClaims);
                }
            }
        }

        if game.state == GameState::Canceled {
            require!(game.shooter_claimed, CrapsError::OutstandingClaims);
            for i in 0..game.fader_count as usize {
                if game.fader_stakes[i] > 0 {
                    require!(game.fader_claimed[i], CrapsError::OutstandingClaims);
                }
            }
        }

        game.closed = true;
        Ok(())
    }
}

fn settle_game(game: &mut Account<Game>, config: &Account<Config>, shooter_wins: bool) -> Result<()> {
    let tax = game
        .total_pot
        .checked_mul(config.tax_bps as u64)
        .ok_or(CrapsError::MathOverflow)?
        .checked_div(BPS_DENOMINATOR)
        .ok_or(CrapsError::MathOverflow)?;

    game.tax_amount = tax;
    game.winner_is_shooter = shooter_wins;
    game.state = GameState::Settled;

    if shooter_wins {
        game.shooter_payout = game.total_pot.checked_sub(tax).ok_or(CrapsError::MathOverflow)?;
        for i in 0..game.fader_count as usize {
            game.fader_payouts[i] = 0;
        }
        return Ok(());
    }

    let distributable = game
        .total_pot
        .checked_sub(tax)
        .ok_or(CrapsError::MathOverflow)?;
    let mut allocated: u64 = 0;

    if game.total_fader_stake == 0 {
        game.shooter_payout = distributable;
        return Ok(());
    }

    for i in 0..game.fader_count as usize {
        let stake = game.fader_stakes[i];
        if stake == 0 {
            game.fader_payouts[i] = 0;
            continue;
        }

        let payout = distributable
            .checked_mul(stake)
            .ok_or(CrapsError::MathOverflow)?
            .checked_div(game.total_fader_stake)
            .ok_or(CrapsError::MathOverflow)?;

        game.fader_payouts[i] = payout;
        allocated = allocated.checked_add(payout).ok_or(CrapsError::MathOverflow)?;
    }

    let remainder = distributable.checked_sub(allocated).ok_or(CrapsError::MathOverflow)?;
    if game.fader_count > 0 {
        game.fader_payouts[0] = game.fader_payouts[0].checked_add(remainder).ok_or(CrapsError::MathOverflow)?;
    }
    game.shooter_payout = 0;
    Ok(())
}

fn transfer_lamports(
    from: &AccountInfo,
    to: &AccountInfo,
    amount: u64,
    system_program: &AccountInfo,
) -> Result<()> {
    invoke(
        &system_instruction::transfer(from.key, to.key, amount),
        &[from.clone(), to.clone(), system_program.clone()],
    )?;
    Ok(())
}

fn payout_from_game(game: &mut Account<Game>, amount: u64, recipient: &AccountInfo) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }

    let game_info = game.to_account_info();
    require!(game_info.lamports() >= amount, CrapsError::InsufficientVaultBalance);

    **game_info.try_borrow_mut_lamports()? = game_info
        .lamports()
        .checked_sub(amount)
        .ok_or(CrapsError::MathOverflow)?;

    **recipient.try_borrow_mut_lamports()? = recipient
        .lamports()
        .checked_add(amount)
        .ok_or(CrapsError::MathOverflow)?;
    Ok(())
}

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        seeds = [CONFIG_SEED],
        bump,
        space = 8 + Config::INIT_SPACE
    )]
    pub config: Account<'info, Config>,
    pub randomness_program: UncheckedAccount<'info>,
    pub randomness_authority: UncheckedAccount<'info>,
    pub treasury: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    pub authority: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
}

#[derive(Accounts)]
pub struct SetConfigFrozen<'info> {
    pub authority: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
}

#[derive(Accounts)]
#[instruction(game_id: u64)]
pub struct CreateGame<'info> {
    #[account(mut)]
    pub shooter: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        init,
        payer = shooter,
        seeds = [GAME_SEED, config.key().as_ref(), &game_id.to_le_bytes()],
        bump,
        space = 8 + Game::INIT_SPACE
    )]
    pub game: Account<'info, Game>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct JoinGame<'info> {
    #[account(mut)]
    pub fader: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        seeds = [GAME_SEED, config.key().as_ref(), &game.game_id.to_le_bytes()],
        bump = game.bump,
        has_one = config
    )]
    pub game: Account<'info, Game>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RequestRoll<'info> {
    pub shooter: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        seeds = [GAME_SEED, config.key().as_ref(), &game.game_id.to_le_bytes()],
        bump = game.bump,
        has_one = config
    )]
    pub game: Account<'info, Game>,
}

#[derive(Accounts)]
pub struct ConsumeRandomnessCallback<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        seeds = [GAME_SEED, config.key().as_ref(), &game.game_id.to_le_bytes()],
        bump = game.bump,
        has_one = config
    )]
    pub game: Account<'info, Game>,
    pub randomness_program: UncheckedAccount<'info>,
    pub randomness_authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct CancelGame<'info> {
    pub shooter: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        seeds = [GAME_SEED, config.key().as_ref(), &game.game_id.to_le_bytes()],
        bump = game.bump,
        has_one = config
    )]
    pub game: Account<'info, Game>,
}

#[derive(Accounts)]
pub struct WithdrawCancelled<'info> {
    #[account(mut)]
    pub claimer: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        seeds = [GAME_SEED, config.key().as_ref(), &game.game_id.to_le_bytes()],
        bump = game.bump,
        has_one = config
    )]
    pub game: Account<'info, Game>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ForfeitUnrolled<'info> {
    pub caller: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        seeds = [GAME_SEED, config.key().as_ref(), &game.game_id.to_le_bytes()],
        bump = game.bump,
        has_one = config
    )]
    pub game: Account<'info, Game>,
}

#[derive(Accounts)]
pub struct ClaimPayout<'info> {
    #[account(mut)]
    pub claimer: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        seeds = [GAME_SEED, config.key().as_ref(), &game.game_id.to_le_bytes()],
        bump = game.bump,
        has_one = config
    )]
    pub game: Account<'info, Game>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CloseGame<'info> {
    #[account(mut)]
    pub shooter: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        close = treasury,
        seeds = [GAME_SEED, config.key().as_ref(), &game.game_id.to_le_bytes()],
        bump = game.bump,
        has_one = config
    )]
    pub game: Account<'info, Game>,
    #[account(mut, address = config.treasury)]
    pub treasury: UncheckedAccount<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub bump: u8,
    pub authority: Pubkey,
    pub randomness_program: Pubkey,
    pub randomness_authority: Pubkey,
    pub treasury: Pubkey,
    pub tax_bps: u16,
    pub max_faders: u8,
    pub frozen: bool,
    pub join_timeout_slots: u64,
    pub roll_timeout_slots: u64,
}

#[account]
#[derive(InitSpace)]
pub struct Game {
    pub bump: u8,
    pub game_id: u64,
    pub config: Pubkey,
    pub shooter: Pubkey,
    pub state: GameState,
    pub shooter_stake: u64,
    pub total_fader_stake: u64,
    pub total_pot: u64,
    pub tax_amount: u64,
    pub point: u8,
    pub winner_is_shooter: bool,
    pub pending_roll_request: Pubkey,
    pub last_roll_slot: u64,
    pub last_action_slot: u64,
    pub fader_count: u8,
    pub closed: bool,
    pub fader_keys: [Pubkey; MAX_FADERS],
    pub fader_stakes: [u64; MAX_FADERS],
    pub fader_payouts: [u64; MAX_FADERS],
    pub fader_claimed: [bool; MAX_FADERS],
    pub shooter_payout: u64,
    pub shooter_claimed: bool,
}

impl Game {
    pub fn find_fader_index(&self, fader: &Pubkey) -> Option<usize> {
        for i in 0..self.fader_count as usize {
            if self.fader_keys[i] == *fader {
                return Some(i);
            }
        }
        None
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace, PartialEq, Eq)]
pub enum GameState {
    Open,
    ReadyToRoll,
    Rolling,
    PointEstablished,
    Settled,
    Canceled,
}

#[error_code]
pub enum CrapsError {
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Configuration is frozen")]
    ConfigFrozen,
    #[msg("Invalid state for this action")]
    InvalidState,
    #[msg("Invalid stake amount")]
    InvalidStake,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Too many faders")]
    TooManyFaders,
    #[msg("Participant already claimed")]
    AlreadyClaimed,
    #[msg("Not a participant")]
    NotParticipant,
    #[msg("Outstanding claims remain")]
    OutstandingClaims,
    #[msg("Game already closed")]
    AlreadyClosed,
    #[msg("Join timeout elapsed")]
    JoinTimeout,
    #[msg("Roll request timeout elapsed")]
    RollRequestTimeout,
    #[msg("Roll window still active")]
    RollWindowActive,
    #[msg("Invalid tax bps")]
    InvalidTaxBps,
    #[msg("Invalid timeout")]
    InvalidTimeout,
    #[msg("Invalid max faders")]
    InvalidMaxFaders,
    #[msg("Shooter cannot be a fader")]
    ShooterCannotFade,
    #[msg("Invalid randomness program")]
    InvalidRandomnessProgram,
    #[msg("Missing signer")]
    MissingSigner,
    #[msg("Invalid roll request")]
    InvalidRollRequest,
    #[msg("Insufficient vault balance")]
    InsufficientVaultBalance,
}
