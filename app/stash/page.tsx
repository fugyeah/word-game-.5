import { fetchSnapshot } from "@/features/game/services/snapshot-service";
import { sanitizeText } from "@/features/game/utils/sanitize";

const StashPage = async (): Promise<JSX.Element> => {
  const snapshot = await fetchSnapshot({});

  return (
    <section className="mc-grid">
      <h1>Stash</h1>
      {!snapshot.ok && <div className="mc-banner">{sanitizeText(snapshot.error?.message ?? "Unable to load stash")}</div>}
      <div className="mc-grid mc-grid-2">
        {(snapshot.data?.stash ?? []).map((entry) => (
          <article key={`${entry.mint}-${entry.updatedAt}`} className="mc-card mc-grid">
            <h2 className="mc-title">{sanitizeText(entry.symbol)}</h2>
            <span className="mc-subtle">Mint: {sanitizeText(entry.mint)}</span>
            <span className="mc-subtle">Amount: {sanitizeText(entry.amount)}</span>
          </article>
        ))}
      </div>
    </section>
  );
};

export default StashPage;
