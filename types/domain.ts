export type ClusterName = 'devnet' | 'testnet' | 'mainnet-beta';

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'RPC_ERROR'
  | 'NETWORK_ERROR'
  | 'INTERNAL_ERROR'
  | 'NOT_FOUND';

export interface ApiError {
  readonly code: ApiErrorCode;
  readonly message: string;
  readonly detail?: string;
}

export interface Lobby {
  readonly publicKey: string;
  readonly creator: string;
  readonly createdAt: number;
  readonly maxPlayers: number;
  readonly currentPlayers: number;
  readonly buyInLamports: bigint;
  readonly point: number;
  readonly state: 'OPEN' | 'IN_PROGRESS' | 'SETTLED';
}

export interface LobbyViewModel {
  readonly publicKey: string;
  readonly creator: string;
  readonly createdAtIso: string;
  readonly playersLabel: string;
  readonly buyInSol: string;
  readonly payoutPotentialSol: string;
  readonly state: 'OPEN' | 'IN_PROGRESS' | 'SETTLED';
}

export interface LobbiesResponse {
  readonly lobbies: readonly LobbyViewModel[];
  readonly source: 'rpc_only' | 'rpc_plus_indexer';
  readonly errors: readonly ApiError[];
}

export interface IndexerLobbyPayload {
  readonly publicKey: string;
  readonly activeUsers: number;
  readonly recentRollAverage: number;
}
