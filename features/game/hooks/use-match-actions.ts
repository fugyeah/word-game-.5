"use client";

import { useMemo, useState } from "react";
import { actionInputSchema } from "@/features/game/schema/validators";
import { cancel, claim, forfeit, retryRoll } from "@/lib/solana/transactions";
import { ActionResult, Countdown, WalletRole } from "@/types/word-game";

interface MatchActions {
  busy: boolean;
  executeClaim: (matchId: string, wallet: string, role: WalletRole, countdown: Countdown) => Promise<ActionResult>;
  executeCancel: (matchId: string, wallet: string, role: WalletRole, countdown: Countdown) => Promise<ActionResult>;
  executeForfeit: (matchId: string, wallet: string, role: WalletRole, countdown: Countdown) => Promise<ActionResult>;
  executeRetryRoll: (matchId: string, wallet: string, role: WalletRole, countdown: Countdown) => Promise<ActionResult>;
}

const timeoutBlocked = (deadline: number | null): boolean => Boolean(deadline && Date.now() > deadline);

const authorizationError = (message: string): ActionResult => ({
  ok: false,
  code: "authorization_error",
  message,
});

const validationError = (message: string): ActionResult => ({
  ok: false,
  code: "validation_error",
  message,
});

export const useMatchActions = (): MatchActions => {
  const [busy, setBusy] = useState(false);

  const guard = (matchId: string, wallet: string): ActionResult | null => {
    const parsed = actionInputSchema.safeParse({ matchId, wallet });
    if (!parsed.success) {
      return validationError(parsed.error.issues.map((issue) => issue.message).join(", "));
    }
    return null;
  };

  const executeClaim = async (
    matchId: string,
    wallet: string,
    role: WalletRole,
    countdown: Countdown,
  ): Promise<ActionResult> => {
    const guarded = guard(matchId, wallet);
    if (guarded) return guarded;
    if (role === "observer") return authorizationError("Observers cannot claim rewards");
    if (timeoutBlocked(countdown.claimExpiresAt)) {
      return { ok: false, code: "state_error", message: "Claim window already expired" };
    }
    setBusy(true);
    const result = await claim({ matchId, wallet });
    setBusy(false);
    return result;
  };

  const executeCancel = async (
    matchId: string,
    wallet: string,
    role: WalletRole,
    countdown: Countdown,
  ): Promise<ActionResult> => {
    const guarded = guard(matchId, wallet);
    if (guarded) return guarded;
    if (role !== "host") return authorizationError("Only host wallet can cancel the game");
    if (timeoutBlocked(countdown.cancelExpiresAt)) {
      return { ok: false, code: "state_error", message: "Cancel period has ended" };
    }
    setBusy(true);
    const result = await cancel({ matchId, wallet });
    setBusy(false);
    return result;
  };

  const executeForfeit = async (
    matchId: string,
    wallet: string,
    role: WalletRole,
    countdown: Countdown,
  ): Promise<ActionResult> => {
    const guarded = guard(matchId, wallet);
    if (guarded) return guarded;
    if (role === "observer") return authorizationError("Observers cannot forfeit");
    if (timeoutBlocked(countdown.forfeitExpiresAt)) {
      return { ok: false, code: "state_error", message: "Forfeit timeout reached" };
    }
    setBusy(true);
    const result = await forfeit({ matchId, wallet });
    setBusy(false);
    return result;
  };

  const executeRetryRoll = async (
    matchId: string,
    wallet: string,
    role: WalletRole,
    countdown: Countdown,
  ): Promise<ActionResult> => {
    const guarded = guard(matchId, wallet);
    if (guarded) return guarded;
    if (role !== "challenger") {
      return authorizationError("Only challenger wallet can retry a roll");
    }
    if (!countdown.rerollAvailableAt || Date.now() < countdown.rerollAvailableAt) {
      return { ok: false, code: "state_error", message: "Retry roll not yet available" };
    }
    setBusy(true);
    const result = await retryRoll({ matchId, wallet });
    setBusy(false);
    return result;
  };

  return useMemo(
    () => ({ busy, executeClaim, executeCancel, executeForfeit, executeRetryRoll }),
    [busy],
  );
};
