import { z } from "zod";
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

const lobbySchema = z.object({
  id: z.string().min(1),
  host: z.string().min(1),
  challenger: z.string().min(1),
  status: z.string().min(1),
  createdAt: z.number(),
  wagerLamports: z.string().min(1),
});

const countdownSchema = z.object({
  claimExpiresAt: z.number(),
  cancelExpiresAt: z.number(),
  forfeitExpiresAt: z.number(),
  rerollAvailableAt: z.number(),
});

const gameSchema = z.object({
  id: z.string().min(1),
  lobbyId: z.string().min(1),
  host: z.string().min(1),
  challenger: z.string().min(1),
  turnOwner: z.string().min(1),
  hostRoll: z.number().nullable(),
  challengerRoll: z.number().nullable(),
  winner: z.string().nullable(),
  status: z.string().min(1),
  countdown: countdownSchema,
  updatedAt: z.number(),
});

const stashSchema = z.object({
  mint: z.string().min(1),
  amount: z.string().min(1),
  symbol: z.string().min(1),
  updatedAt: z.number(),
});

const snapshotSchema = z.object({
  lobbies: z.array(lobbySchema),
  currentGame: gameSchema.nullable(),
  stash: z.array(stashSchema),
  slot: z.number(),
  source: z.enum(["rpc", "indexer"]),
  degraded: z.boolean(),
  warning: z.string().nullable(),
});

const parseSnapshot = (payload: unknown): AppSnapshot => {
  const parsed = snapshotSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(`Invalid snapshot payload: ${parsed.error.issues.map((issue) => issue.message).join(", ")}`);
  }
  return parsed.data as AppSnapshot;
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
