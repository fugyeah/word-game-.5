"use client";

import { ActionPanel } from "@/features/game/components/action-panel";
import { CountdownTimer } from "@/features/game/components/countdown-timer";
import { DegradedBanner } from "@/features/game/components/degraded-banner";
import { useLiveGame } from "@/features/game/hooks/use-live-game";
import { useWallet } from "@/lib/solana/wallet";

const statusFxClass = (status: string): string => {
  if (status === "rolling") {
    return "mc-warn-pulse";
  }
  if (status === "claimable") {
    return "mc-neon-pulse";
  }
  return "";
};

export const GameDashboard = (): JSX.Element => {
  const { publicKey, role } = useWallet();
  const { snapshot, degraded, message } = useLiveGame(publicKey ?? undefined);

  if (!snapshot || !snapshot.currentGame) {
    return <div className="mc-card">Loading game state...</div>;
  }

  const { currentGame } = snapshot;

  return (
    <section className="mc-grid">
      <DegradedBanner message={degraded ? message ?? "Degraded state" : null} />
      <div className={`mc-card mc-grid mc-spray ${statusFxClass(currentGame.status)}`}>
        <h2 className="mc-title">Game #{currentGame.id}</h2>
        <div className="mc-grid mc-grid-2">
          <span className="mc-pill">Host Roll: {currentGame.hostRoll ?? "-"}</span>
          <span className="mc-pill">Challenger Roll: {currentGame.challengerRoll ?? "-"}</span>
          <span className="mc-pill">Status: {currentGame.status}</span>
          <span className="mc-pill">Source: {snapshot.source}</span>
        </div>
      </div>
      <div className="mc-grid mc-grid-2">
        <CountdownTimer label="Claim Timeout" deadline={currentGame.countdown.claimExpiresAt} />
        <CountdownTimer label="Cancel Timeout" deadline={currentGame.countdown.cancelExpiresAt} />
        <CountdownTimer label="Forfeit Timeout" deadline={currentGame.countdown.forfeitExpiresAt} />
        <CountdownTimer label="Retry Roll Available" deadline={currentGame.countdown.rerollAvailableAt} />
      </div>
      {publicKey ? (
        <ActionPanel matchId={currentGame.id} wallet={publicKey} role={role} countdown={currentGame.countdown} />
      ) : (
        <div className="mc-card">Connect wallet to execute match actions.</div>
      )}
    </section>
  );
};
