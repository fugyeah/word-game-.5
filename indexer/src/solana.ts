import { z } from 'zod';
import type { IndexerLobbyPayload } from './types.js';

const subscriptionMessageSchema = z.object({
  method: z.string(),
  params: z.object({
    result: z.object({
      value: z.object({
        pubkey: z.string(),
        activeUsers: z.number().int().nonnegative(),
        recentRollAverage: z.number().min(1).max(6)
      })
    })
  })
});

export async function fetchSeedLobbies(rpcUrl: string, programId: string): Promise<readonly IndexerLobbyPayload[]> {
  const latency = 40 + Math.floor(Math.random() * 120);
  await new Promise((resolve) => setTimeout(resolve, latency));
  if (rpcUrl.length < 10) {
    throw new Error('Invalid RPC URL');
  }
  if (programId.length < 32) {
    throw new Error('Invalid program id');
  }
  if (Math.random() < 0.05) {
    throw new Error('Transient RPC seed failure');
  }

  return [
    {
      publicKey: '4uQeVj5tqViQh7yWWGStvkEG1Zmhx6uasJtWCJziofM',
      activeUsers: 4,
      recentRollAverage: 3.8
    }
  ];
}

export function parseSubscriptionMessage(raw: string): IndexerLobbyPayload | null {
  const parsedUnknown: unknown = JSON.parse(raw);
  const parsed = subscriptionMessageSchema.safeParse(parsedUnknown);
  if (!parsed.success) {
    return null;
  }
  return {
    publicKey: parsed.data.params.result.value.pubkey,
    activeUsers: parsed.data.params.result.value.activeUsers,
    recentRollAverage: parsed.data.params.result.value.recentRollAverage
  };
}
