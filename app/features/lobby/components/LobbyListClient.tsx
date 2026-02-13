'use client';

import { useMemo } from 'react';
import type { LobbiesResponse } from '@/types/domain';

interface LobbyListClientProps {
  readonly initial: LobbiesResponse;
}

function statusClass(status: 'OPEN' | 'IN_PROGRESS' | 'SETTLED'): string {
  if (status === 'OPEN') return 'text-emerald-300';
  if (status === 'IN_PROGRESS') return 'text-amber-300';
  return 'text-slate-400';
}

function statusPulseClass(status: 'OPEN' | 'IN_PROGRESS' | 'SETTLED'): string {
  return status === 'IN_PROGRESS' ? 'mc-warn-pulse' : 'mc-neon-pulse';
}

export function LobbyListClient({ initial }: LobbyListClientProps): JSX.Element {
  const hasWarnings = initial.errors.length > 0;
  const lobbies = useMemo(() => initial.lobbies, [initial.lobbies]);

  return (
    <section className="mc-grid">
      <div className="mc-card mc-spray">
        <div className="flex items-center justify-between">
          <h2 className="mc-title">Open Lobbies</h2>
          <span className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs uppercase text-slate-300">
            source: {initial.source}
          </span>
        </div>
      </div>
      {hasWarnings ? (
        <ul className="space-y-2 rounded border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-100">
          {initial.errors.map((error, index) => (
            <li key={`${error.code}-${index}`}>{error.message}</li>
          ))}
        </ul>
      ) : null}
      <ul className="space-y-3">
        {lobbies.map((lobby) => (
          <li key={lobby.publicKey} className={`mc-card mc-spray ${statusPulseClass(lobby.state)}`}>
            <div className="flex items-center justify-between">
              <p className="font-mono text-xs text-slate-400">{lobby.publicKey}</p>
              <span className={statusClass(lobby.state)}>{lobby.state}</span>
            </div>
            <p className="text-sm text-slate-300">creator: {lobby.creator}</p>
            <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-slate-200">
              <span>players {lobby.playersLabel}</span>
              <span>buy-in {lobby.buyInSol} SOL</span>
              <span>potential payout {lobby.payoutPotentialSol} SOL</span>
              <span>{new Date(lobby.createdAtIso).toLocaleString()}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
