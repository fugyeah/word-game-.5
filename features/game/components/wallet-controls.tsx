"use client";

import { useState } from "react";
import { walletSchema } from "@/features/game/schema/validators";
import { useWallet } from "@/lib/solana/wallet";
import { WalletRole } from "@/types/word-game";

export const WalletControls = (): JSX.Element => {
  const { publicKey, role, connect, disconnect } = useWallet();
  const [candidate, setCandidate] = useState("8Y8VZsr9UzdfhnYfL9TzM6VsyxwRF3KjQpkLr9JxqQJ1");
  const [nextRole, setNextRole] = useState<WalletRole>("observer");
  const [error, setError] = useState<string>("");

  const submit = (): void => {
    const parsed = walletSchema.safeParse(candidate);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Wallet validation failed");
      return;
    }
    setError("");
    connect(candidate, nextRole);
  };

  return (
    <div className="mc-card mc-grid">
      <h3 className="mc-title">Wallet</h3>
      {publicKey ? <span className="mc-subtle">Connected: {publicKey} ({role})</span> : <span className="mc-subtle">Disconnected</span>}
      <input value={candidate} onChange={(event) => setCandidate(event.target.value)} className="mc-button" />
      <select value={nextRole} onChange={(event) => setNextRole(event.target.value as WalletRole)} className="mc-button">
        <option value="observer">Observer</option>
        <option value="host">Host</option>
        <option value="challenger">Challenger</option>
      </select>
      <div className="mc-grid mc-grid-2">
        <button className="mc-button" onClick={submit}>Connect</button>
        <button className="mc-button mc-button-danger" onClick={disconnect}>Disconnect</button>
      </div>
      <span className="mc-subtle">{error}</span>
    </div>
  );
};
