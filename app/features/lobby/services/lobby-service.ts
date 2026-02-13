import { calculatePassLinePotentialPayout, lamportsToSol } from '@/lib/solana/math';
import { fetchIndexerStats, scanLobbiesViaRpc } from '@/lib/solana/rpc';
import { envSchema } from '@/lib/solana/schemas';
import { sanitizeText } from '@/lib/solana/sanitize';
import type { ApiError, LobbiesResponse, LobbyViewModel } from '@/types/domain';

function envOrDefault(name: string, fallback: string): string {
  const value = process.env[name];
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function buildViewModel(
  lobby: {
    publicKey: string;
    creator: string;
    createdAt: number;
    maxPlayers: number;
    currentPlayers: number;
    buyInLamports: bigint;
    point: number;
    state: 'OPEN' | 'IN_PROGRESS' | 'SETTLED';
  },
  activeUsers: number
): LobbyViewModel {
  const payout = calculatePassLinePotentialPayout(lobby.buyInLamports, lobby.point);
  const safeKey = sanitizeText(lobby.publicKey);
  const safeCreator = sanitizeText(lobby.creator);
  return {
    publicKey: safeKey,
    creator: safeCreator,
    createdAtIso: new Date(lobby.createdAt * 1000).toISOString(),
    playersLabel: `${Math.max(lobby.currentPlayers, activeUsers)}/${lobby.maxPlayers}`,
    buyInSol: lamportsToSol(lobby.buyInLamports),
    payoutPotentialSol: lamportsToSol(payout),
    state: lobby.state
  };
}

export async function getLobbies(limit: number): Promise<LobbiesResponse> {
  const parsedEnv = envSchema.safeParse({
    NEXT_PUBLIC_SOLANA_CLUSTER: envOrDefault('NEXT_PUBLIC_SOLANA_CLUSTER', 'devnet'),
    NEXT_PUBLIC_SOLANA_RPC_URL: envOrDefault('NEXT_PUBLIC_SOLANA_RPC_URL', 'https://api.devnet.solana.com'),
    NEXT_PUBLIC_GAME_PROGRAM_ID: envOrDefault('NEXT_PUBLIC_GAME_PROGRAM_ID', '11111111111111111111111111111111'),
    NEXT_PUBLIC_LOBBY_ACCOUNT_DISCRIMINATOR: envOrDefault('NEXT_PUBLIC_LOBBY_ACCOUNT_DISCRIMINATOR', '6f4c6f6262797631'),
    NEXT_PUBLIC_INDEXER_URL: envOrDefault('NEXT_PUBLIC_INDEXER_URL', '')
  });

  if (!parsedEnv.success) {
    const detail = parsedEnv.error.issues.map((issue) => issue.message).join('; ');
    return {
      lobbies: [],
      source: 'rpc_only',
      errors: [{ code: 'VALIDATION_ERROR', message: 'Environment configuration is invalid.', detail }]
    };
  }

  const rpcResult = await scanLobbiesViaRpc(
    parsedEnv.data.NEXT_PUBLIC_SOLANA_RPC_URL,
    parsedEnv.data.NEXT_PUBLIC_GAME_PROGRAM_ID,
    parsedEnv.data.NEXT_PUBLIC_LOBBY_ACCOUNT_DISCRIMINATOR
  );

  const indexerResult = await fetchIndexerStats(parsedEnv.data.NEXT_PUBLIC_INDEXER_URL ?? '');
  const errors: ApiError[] = [...rpcResult.errors, ...indexerResult.errors];

  const merged = rpcResult.lobbies.slice(0, limit).map((lobby) => {
    const stat = indexerResult.byPubkey.get(lobby.publicKey);
    return buildViewModel(lobby, stat?.activeUsers ?? 0);
  });

  return {
    lobbies: merged,
    source: indexerResult.byPubkey.size > 0 ? 'rpc_plus_indexer' : 'rpc_only',
    errors
  };
}
