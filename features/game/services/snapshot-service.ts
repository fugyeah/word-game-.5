import { querySchema } from "@/features/game/schema/validators";
import { sanitizeText } from "@/features/game/utils/sanitize";
import { getSnapshot } from "@/lib/solana/connection";
import { AppSnapshot } from "@/types/word-game";

export interface SnapshotResponse {
  ok: boolean;
  data: AppSnapshot | null;
  error: { code: string; message: string } | null;
}

const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com";
const indexerUrl = process.env.NEXT_PUBLIC_INDEXER_URL;

export const fetchSnapshot = async (query: unknown): Promise<SnapshotResponse> => {
  const parsed = querySchema.safeParse(query ?? {});
  if (!parsed.success) {
    return {
      ok: false,
      data: null,
      error: {
        code: "validation_error",
        message: sanitizeText(parsed.error.issues.map((issue) => issue.message).join(", ")),
      },
    };
  }

  try {
    const snapshot = await getSnapshot(rpcUrl, indexerUrl);
    return { ok: true, data: snapshot, error: null };
  } catch {
    return {
      ok: false,
      data: null,
      error: {
        code: "network_error",
        message: "Unable to fetch live game state",
      },
    };
  }
};
