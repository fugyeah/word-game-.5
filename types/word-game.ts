export type WalletRole = "host" | "challenger" | "observer";

export type MatchStatus =
  | "lobby"
  | "rolling"
  | "claimable"
  | "claimed"
  | "cancelled"
  | "forfeited";

export interface Countdown {
  claimExpiresAt: number | null;
  cancelExpiresAt: number | null;
  forfeitExpiresAt: number | null;
  rerollAvailableAt: number | null;
}

export interface StashEntry {
  mint: string;
  amount: string;
  symbol: string;
  updatedAt: number;
}

export interface LobbyState {
  id: string;
  host: string;
  challenger: string | null;
  status: MatchStatus;
  createdAt: number;
  wagerLamports: string;
}

export interface GameState {
  id: string;
  lobbyId: string;
  host: string;
  challenger: string;
  turnOwner: string;
  hostRoll: number | null;
  challengerRoll: number | null;
  winner: string | null;
  status: MatchStatus;
  countdown: Countdown;
  updatedAt: number;
}

export interface AppSnapshot {
  lobbies: LobbyState[];
  currentGame: GameState | null;
  stash: StashEntry[];
  slot: number;
  source: "indexer" | "rpc";
  degraded: boolean;
  warning: string | null;
}

export interface ActionResult {
  ok: boolean;
  code: "ok" | "validation_error" | "network_error" | "authorization_error" | "state_error";
  message: string;
  txSignature?: string;
}

export interface ProgramActionInput {
  matchId: string;
  wallet: string;
}
