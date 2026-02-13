import type { IndexerLobbyPayload } from './types.js';

interface CachedLobby extends IndexerLobbyPayload {
  readonly updatedAt: number;
}

export class LobbyCache {
  private readonly ttlMs: number;

  private readonly records: Map<string, CachedLobby>;

  constructor(ttlMs: number) {
    this.ttlMs = ttlMs;
    this.records = new Map();
  }

  upsert(entry: IndexerLobbyPayload): void {
    this.records.set(entry.publicKey, { ...entry, updatedAt: Date.now() });
  }

  prune(): void {
    const now = Date.now();
    for (const [key, value] of this.records.entries()) {
      if (now - value.updatedAt > this.ttlMs) {
        this.records.delete(key);
      }
    }
  }

  list(): readonly IndexerLobbyPayload[] {
    this.prune();
    return [...this.records.values()]
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .map(({ publicKey, activeUsers, recentRollAverage }) => ({ publicKey, activeUsers, recentRollAverage }));
  }
}
