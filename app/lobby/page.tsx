import { WalletControls } from "@/features/game/components/wallet-controls";
import { fetchSnapshot } from "@/features/game/services/snapshot-service";
import { querySchema } from "@/features/game/schema/validators";
import { sanitizeText } from "@/features/game/utils/sanitize";

interface LobbyPageProps {
  searchParams?: Record<string, string | string[] | undefined>;
}

const LobbyPage = async ({ searchParams }: LobbyPageProps): Promise<JSX.Element> => {
  const rawWallet = searchParams?.wallet;
  const wallet = typeof rawWallet === "string" ? rawWallet : undefined;
  const parsedQuery = querySchema.safeParse({ wallet });
  const snapshot = await fetchSnapshot(parsedQuery.success ? parsedQuery.data : {});

  return (
    <section className="mc-grid">
      <h1 className="mc-heading">The Sidewalk Lobby</h1>
      <WalletControls />
      {!snapshot.ok && <div className="mc-banner">{sanitizeText(snapshot.error?.message ?? "Failed to load lobby")}</div>}
      <div className="mc-grid mc-grid-2">
        {(snapshot.data?.lobbies ?? []).map((lobby) => (
          <article key={lobby.id} className="mc-card mc-grid mc-spray">
            <h3 className="mc-title">{sanitizeText(lobby.id)}</h3>
            <span className="mc-subtle">Host: {sanitizeText(lobby.host)}</span>
            <span className="mc-subtle">Challenger: {sanitizeText(lobby.challenger ?? "Waiting")}</span>
            <span className="mc-pill">Status: {sanitizeText(lobby.status)}</span>
          </article>
        ))}
      </div>
    </section>
  );
};

export default LobbyPage;
