"use client";

import { useState } from "react";
import { useMatchActions } from "@/features/game/hooks/use-match-actions";
import { sanitizeText } from "@/features/game/utils/sanitize";
import { Countdown, WalletRole } from "@/types/word-game";

interface ActionPanelProps {
  matchId: string;
  wallet: string;
  role: WalletRole;
  countdown: Countdown;
}

export const ActionPanel = ({ matchId, wallet, role, countdown }: ActionPanelProps): JSX.Element => {
  const { busy, executeCancel, executeClaim, executeForfeit, executeRetryRoll } = useMatchActions();
  const [feedback, setFeedback] = useState<string>("");

  const run = async (job: () => Promise<{ ok: boolean; message: string }>): Promise<void> => {
    const result = await job();
    setFeedback(sanitizeText(result.message));
  };

  return (
    <div className="mc-card mc-grid">
      <h3 className="mc-title">Match Actions</h3>
      <div className="mc-grid mc-grid-2">
        <button className="mc-button" disabled={busy} onClick={() => run(() => executeClaim(matchId, wallet, role, countdown))}>
          Claim
        </button>
        <button className="mc-button mc-button-danger" disabled={busy} onClick={() => run(() => executeCancel(matchId, wallet, role, countdown))}>
          Cancel
        </button>
        <button className="mc-button mc-button-danger" disabled={busy} onClick={() => run(() => executeForfeit(matchId, wallet, role, countdown))}>
          Forfeit
        </button>
        <button className="mc-button" disabled={busy} onClick={() => run(() => executeRetryRoll(matchId, wallet, role, countdown))}>
          Retry Roll
        </button>
      </div>
      <span className="mc-subtle">{feedback}</span>
    </div>
  );
};
