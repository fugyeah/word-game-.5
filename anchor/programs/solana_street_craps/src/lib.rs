use anchor_lang::prelude::*;

declare_id!("11111111111111111111111111111111");

#[program]
pub mod solana_street_craps {
    use super::*;

    pub fn initialize_lobby(ctx: Context<InitializeLobby>, buy_in_lamports: u64, max_players: u8) -> Result<()> {
        require!(buy_in_lamports > 0, CrapsError::InvalidBuyIn);
        require!(max_players >= 2 && max_players <= 16, CrapsError::InvalidMaxPlayers);

        let lobby = &mut ctx.accounts.lobby;
        lobby.creator = ctx.accounts.creator.key();
        lobby.created_at = Clock::get()?.unix_timestamp;
        lobby.buy_in_lamports = buy_in_lamports;
        lobby.max_players = max_players;
        lobby.current_players = 1;
        lobby.point = 0;
        lobby.state = LobbyState::Open;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeLobby<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(init, payer = creator, space = 8 + Lobby::SIZE)]
    pub lobby: Account<'info, Lobby>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct Lobby {
    pub creator: Pubkey,
    pub created_at: i64,
    pub buy_in_lamports: u64,
    pub max_players: u8,
    pub current_players: u8,
    pub point: u8,
    pub state: LobbyState,
}

impl Lobby {
    pub const SIZE: usize = 32 + 8 + 8 + 1 + 1 + 1 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum LobbyState {
    Open,
    InProgress,
    Settled,
}

#[error_code]
pub enum CrapsError {
    #[msg("Buy-in must be greater than zero")]
    InvalidBuyIn,
    #[msg("Max players must be between 2 and 16")]
    InvalidMaxPlayers,
}
