import { fetchLobbiesAction } from '@/app/features/lobby/actions/lobbies';
import { LobbyListClient } from '@/app/features/lobby/components/LobbyListClient';

export default async function HomePage(): Promise<JSX.Element> {
  const initial = await fetchLobbiesAction({ limit: 25 });

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <h1 className="text-3xl font-bold">Solana Street Craps</h1>
      <p className="text-slate-300">
        Lobby discovery runs directly against Solana RPC using account scans and subscriptions, then optionally merges
        additive metrics from the indexer.
      </p>
      <LobbyListClient initial={initial} />
    </main>
  );
}
