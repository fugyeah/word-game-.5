'use server';

import { z } from 'zod';
import { getLobbies } from '@/app/features/lobby/services/lobby-service';
import type { LobbiesResponse } from '@/types/domain';

const actionInputSchema = z.object({
  limit: z.number().int().min(1).max(100)
});

export async function fetchLobbiesAction(input: unknown): Promise<LobbiesResponse> {
  const parsed = actionInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      lobbies: [],
      source: 'rpc_only',
      errors: [{ code: 'VALIDATION_ERROR', message: 'Invalid action input.', detail: parsed.error.message }]
    };
  }

  try {
    return await getLobbies(parsed.data.limit);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown server action failure';
    return {
      lobbies: [],
      source: 'rpc_only',
      errors: [{ code: 'INTERNAL_ERROR', message: 'Unable to fetch lobbies.', detail: message }]
    };
  }
}
