import { GameDashboard } from "@/features/game/components/game-dashboard";
import { WalletControls } from "@/features/game/components/wallet-controls";

const GamePage = (): JSX.Element => (
  <section className="mc-grid">
    <h1>Game Room</h1>
    <WalletControls />
    <GameDashboard />
  </section>
);

export default GamePage;
