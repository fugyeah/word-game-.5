import { z } from 'zod';

export const envSchema = z.object({
  NEXT_PUBLIC_SOLANA_CLUSTER: z.enum(['devnet', 'testnet', 'mainnet-beta']).default('devnet'),
  NEXT_PUBLIC_SOLANA_RPC_URL: z.string().url().default('https://api.devnet.solana.com'),
  NEXT_PUBLIC_GAME_PROGRAM_ID: z.string().min(32).max(64),
  NEXT_PUBLIC_LOBBY_ACCOUNT_DISCRIMINATOR: z
    .string()
    .regex(/^[a-fA-F0-9]+$/)
    .min(2)
    .default('6f4c6f6262797631'),
  NEXT_PUBLIC_INDEXER_URL: z.string().url().optional().or(z.literal(''))
});

export const querySchema = z.object({
  limit: z
    .string()
    .regex(/^\d+$/)
    .transform((value) => Number(value))
    .refine((value) => value > 0 && value <= 100, {
      message: 'limit must be between 1 and 100'
    })
    .default('25')
});

export const lobbyAccountSchema = z.object({
  publicKey: z.string().min(32).max(64),
  creator: z.string().min(32).max(64),
  createdAt: z.number().int().nonnegative(),
  maxPlayers: z.number().int().min(2).max(16),
  currentPlayers: z.number().int().min(0).max(16),
  buyInLamports: z.bigint().nonnegative(),
  point: z.number().int().min(0).max(12),
  state: z.enum(['OPEN', 'IN_PROGRESS', 'SETTLED'])
});

export const indexerLobbySchema = z.object({
  publicKey: z.string().min(32).max(64),
  activeUsers: z.number().int().nonnegative(),
  recentRollAverage: z.number().min(1).max(6)
});

export type EnvConfig = z.infer<typeof envSchema>;
