import { indexerLobbySchema, lobbyAccountSchema } from '@/lib/solana/schemas';
import type { ApiError, Lobby } from '@/types/domain';

interface JsonRpcRequest {
  readonly jsonrpc: '2.0';
  readonly id: number;
  readonly method: string;
  readonly params: readonly unknown[];
}

interface RpcAccountResult {
  readonly pubkey: string;
  readonly account: {
    readonly data: readonly [string, string];
  };
}

interface RpcEnvelope {
  readonly result?: {
    readonly value: readonly RpcAccountResult[];
  };
  readonly error?: {
    readonly code: number;
    readonly message: string;
  };
}

function readU64LE(data: Uint8Array, offset: number): bigint {
  let result = 0n;
  for (let index = 0; index < 8; index += 1) {
    result |= BigInt(data[offset + index] ?? 0) << BigInt(index * 8);
  }
  return result;
}

function decodeLobbyAccount(pubkey: string, creator: string, data: Uint8Array): Lobby {
  const createdAt = Number(readU64LE(data, 0));
  const buyInLamports = readU64LE(data, 8);
  const maxPlayers = Number(data[16] ?? 0);
  const currentPlayers = Number(data[17] ?? 0);
  const point = Number(data[18] ?? 0);
  const stateCode = Number(data[19] ?? 0);
  const state = stateCode === 0 ? 'OPEN' : stateCode === 1 ? 'IN_PROGRESS' : 'SETTLED';

  return lobbyAccountSchema.parse({
    publicKey: pubkey,
    creator,
    createdAt,
    buyInLamports,
    maxPlayers,
    currentPlayers,
    point,
    state
  });
}

async function mockRpcScan(programId: string, discriminatorHex: string): Promise<readonly Lobby[]> {
  const latencyMs = 60 + Math.floor(Math.random() * 120);
  await new Promise((resolve) => setTimeout(resolve, latencyMs));
  if (programId.length < 32 || discriminatorHex.length < 8) {
    throw new Error('Mock RPC validation error');
  }
  if (Math.random() < 0.07) {
    throw new Error('Mock RPC random network failure');
  }

  return [
    {
      publicKey: '4uQeVj5tqViQh7yWWGStvkEG1Zmhx6uasJtWCJziofM',
      creator: 'A6v9j9wzBqAnfMNg2cQ6y7wGfQ2M4A4XoNQj5Zw4b8p9',
      createdAt: Math.floor(Date.now() / 1000) - 300,
      maxPlayers: 8,
      currentPlayers: 3,
      buyInLamports: 1_200_000_000n,
      point: 6,
      state: 'OPEN'
    }
  ] satisfies readonly Lobby[];
}

export async function scanLobbiesViaRpc(
  rpcUrl: string,
  programId: string,
  discriminatorHex: string
): Promise<{ readonly lobbies: readonly Lobby[]; readonly errors: readonly ApiError[] }> {
  try {
    const filters = [{ memcmp: { offset: 0, bytes: discriminatorHex } }];
    const requestBody: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'getProgramAccounts',
      params: [programId, { encoding: 'base64', filters }]
    };

    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(requestBody),
      cache: 'no-store'
    });

    if (!response.ok) {
      return {
        lobbies: await mockRpcScan(programId, discriminatorHex),
        errors: [
          {
            code: 'NETWORK_ERROR',
            message: 'RPC endpoint returned a non-success status; using mock fallback.',
            detail: `status=${response.status}`
          }
        ]
      };
    }

    const envelope = (await response.json()) as RpcEnvelope;
    if (envelope.error) {
      return {
        lobbies: await mockRpcScan(programId, discriminatorHex),
        errors: [
          {
            code: 'RPC_ERROR',
            message: 'RPC returned an error; using mock fallback.',
            detail: envelope.error.message
          }
        ]
      };
    }

    const values = envelope.result?.value ?? [];
    const decoded: Lobby[] = [];
    const decodeErrors: ApiError[] = [];

    for (const account of values) {
      try {
        const [payload, encoding] = account.account.data;
        if (encoding !== 'base64') {
          throw new Error('Unsupported encoding');
        }
        const bytes = Uint8Array.from(Buffer.from(payload, 'base64'));
        const creator = account.pubkey;
        decoded.push(decodeLobbyAccount(account.pubkey, creator, bytes));
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown decode error';
        decodeErrors.push({
          code: 'VALIDATION_ERROR',
          message: 'Skipping malformed lobby account',
          detail: message
        });
      }
    }

    return {
      lobbies: decoded.sort((left, right) => right.createdAt - left.createdAt),
      errors: decodeErrors
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown network failure';
    try {
      const fallback = await mockRpcScan(programId, discriminatorHex);
      return {
        lobbies: fallback,
        errors: [
          {
            code: 'NETWORK_ERROR',
            message: 'RPC connection failed; using mock fallback.',
            detail: message
          }
        ]
      };
    } catch (fallbackError: unknown) {
      const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : 'Unknown fallback failure';
      return {
        lobbies: [],
        errors: [
          { code: 'NETWORK_ERROR', message: 'RPC connection failed.', detail: message },
          { code: 'INTERNAL_ERROR', message: 'Fallback mock failed.', detail: fallbackMessage }
        ]
      };
    }
  }
}

export async function fetchIndexerStats(indexerUrl: string): Promise<{
  readonly byPubkey: ReadonlyMap<string, { readonly activeUsers: number; readonly recentRollAverage: number }>;
  readonly errors: readonly ApiError[];
}> {
  if (indexerUrl.length === 0) {
    return { byPubkey: new Map(), errors: [] };
  }

  try {
    const response = await fetch(`${indexerUrl.replace(/\/$/, '')}/lobbies`, { cache: 'no-store' });
    if (!response.ok) {
      return {
        byPubkey: new Map(),
        errors: [{ code: 'NETWORK_ERROR', message: 'Indexer unavailable, continuing with RPC-only listing.' }]
      };
    }

    const payloadUnknown = await response.json();
    const payload = Array.isArray(payloadUnknown) ? payloadUnknown : [];
    const mapping = new Map<string, { readonly activeUsers: number; readonly recentRollAverage: number }>();
    for (const entry of payload) {
      const parsed = indexerLobbySchema.safeParse(entry);
      if (parsed.success) {
        mapping.set(parsed.data.publicKey, {
          activeUsers: parsed.data.activeUsers,
          recentRollAverage: parsed.data.recentRollAverage
        });
      }
    }

    return { byPubkey: mapping, errors: [] };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown indexer error';
    return {
      byPubkey: new Map(),
      errors: [{ code: 'NETWORK_ERROR', message: 'Indexer request failed, using RPC-only listing.', detail: message }]
    };
  }
}
