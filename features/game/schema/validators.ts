import { z } from "zod";

const publicKeyRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export const walletSchema = z
  .string()
  .trim()
  .regex(publicKeyRegex, "Invalid wallet address");

export const matchIdSchema = z.string().trim().min(8).max(64);

export const actionInputSchema = z.object({
  matchId: matchIdSchema,
  wallet: walletSchema,
});

export const querySchema = z.object({
  wallet: walletSchema.optional(),
  matchId: matchIdSchema.optional(),
});

export const safeTextSchema = z.string().max(300);

export type QueryInput = z.infer<typeof querySchema>;
