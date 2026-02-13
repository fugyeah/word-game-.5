import { fetchLobbiesAction } from '@/app/features/lobby/actions/lobbies';
import { LobbyListClient } from '@/app/features/lobby/components/LobbyListClient';

export default async function HomePage(): Promise<JSX.Element> {
  const initial = await fetchLobbiesAction({ limit: 25 });

  return (
    <main className="mc-grid">
      <header className="mc-card mc-spray mc-neon-pulse">
        <h1 className="mc-heading">Solana Street Craps</h1>
        <p className="mc-tagline">
        Lobby discovery runs directly against Solana RPC using account scans and subscriptions, then optionally merges
        additive metrics from the indexer.
        </p>
      </header>
      <LobbyListClient initial={initial} />
    </main>
  );
}
