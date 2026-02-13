import { AppSnapshot } from "@/types/word-game";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string;
  method: string;
  params: unknown[];
}

interface FetchResult {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}

const parseSnapshot = (payload: unknown): AppSnapshot => {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid snapshot payload");
  }
  const candidate = payload as Record<string, unknown>;
  if (!Array.isArray(candidate.lobbies) || !Array.isArray(candidate.stash)) {
    throw new Error("Snapshot missing collections");
  }
  return candidate as AppSnapshot;
};

const randomLatency = async (): Promise<void> => {
  const delay = 150 + Math.floor(Math.random() * 400);
  await new Promise((resolve) => setTimeout(resolve, delay));
};

const shouldFail = (): boolean => Math.random() < 0.13;

const fallbackMockSnapshot = (): AppSnapshot => ({
  lobbies: [
    {
      id: "mock-lobby-1",
      host: "8Y8VZsr9UzdfhnYfL9TzM6VsyxwRF3KjQpkLr9JxqQJ1",
      challenger: "5dCkBoWSeZeQxQdwvQNWfAtjYPhGx5cTMv7SBEPP5q8W",
      status: "rolling",
      createdAt: Date.now() - 60_000,
      wagerLamports: "10000000",
    },
  ],
  currentGame: {
    id: "game-1",
    lobbyId: "mock-lobby-1",
    host: "8Y8VZsr9UzdfhnYfL9TzM6VsyxwRF3KjQpkLr9JxqQJ1",
    challenger: "5dCkBoWSeZeQxQdwvQNWfAtjYPhGx5cTMv7SBEPP5q8W",
    turnOwner: "8Y8VZsr9UzdfhnYfL9TzM6VsyxwRF3KjQpkLr9JxqQJ1",
    hostRoll: 4,
    challengerRoll: 2,
    winner: null,
    status: "claimable",
    countdown: {
      claimExpiresAt: Date.now() + 40_000,
      cancelExpiresAt: Date.now() + 15_000,
      forfeitExpiresAt: Date.now() + 50_000,
      rerollAvailableAt: Date.now() + 8_000,
    },
    updatedAt: Date.now(),
  },
  stash: [
    {
      mint: "So11111111111111111111111111111111111111112",
      amount: "1200000000",
      symbol: "SOL",
      updatedAt: Date.now(),
    },
  ],
  slot: 1,
  source: "rpc",
  degraded: true,
  warning: "Using mock RPC fallback",
});

const safeFetch = async (url: string, init?: RequestInit): Promise<FetchResult> => {
  await randomLatency();
  if (shouldFail()) {
    throw new Error("Simulated transport failure");
  }
  return (await fetch(url, init)) as FetchResult;
};

export const fetchFromIndexer = async (indexerUrl: string): Promise<AppSnapshot> => {
  try {
    const response = await safeFetch(`${indexerUrl.replace(/\/$/, "")}/snapshot`);
    if (!response.ok) {
      throw new Error(`Indexer status ${response.status}`);
    }
    const payload = await response.json();
    const parsed = parseSnapshot(payload);
    return { ...parsed, source: "indexer", degraded: false, warning: null };
  } catch {
    throw new Error("indexer_unavailable");
  }
};

export const fetchFromRpc = async (rpcUrl: string): Promise<AppSnapshot> => {
  const body: JsonRpcRequest = {
    jsonrpc: "2.0",
    id: crypto.randomUUID(),
    method: "wordgame_snapshot",
    params: [],
  };

  try {
    const response = await safeFetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      return fallbackMockSnapshot();
    }

    const payload = (await response.json()) as Record<string, unknown>;
    if (!payload.result) {
      return fallbackMockSnapshot();
    }
    const parsed = parseSnapshot(payload.result);
    return { ...parsed, source: "rpc", degraded: false, warning: null };
  } catch {
    return fallbackMockSnapshot();
  }
};

export const getSnapshot = async (rpcUrl: string, indexerUrl?: string): Promise<AppSnapshot> => {
  if (indexerUrl) {
    try {
      return await fetchFromIndexer(indexerUrl);
    } catch {
      const rpcSnapshot = await fetchFromRpc(rpcUrl);
      return {
        ...rpcSnapshot,
        degraded: true,
        warning: "Indexer unavailable. Running RPC fallback.",
      };
    }
  }
  return fetchFromRpc(rpcUrl);
};
