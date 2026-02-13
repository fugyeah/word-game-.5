import "./midnight-concrete.css";
import { WalletProvider } from "@/lib/solana/wallet";

export const metadata = {
  title: "Word Game 0.5",
  description: "Realtime Solana word game control panel",
};

const RootLayout = ({ children }: { children: React.ReactNode }): JSX.Element => (
  <html lang="en">
    <body className="midnight-body">
      <WalletProvider>
        <main className="shell">{children}</main>
      </WalletProvider>
    </body>
  </html>
);

export default RootLayout;
