import "./midnight-concrete.css";
import "@/styles/globals.css";
import type { Metadata } from "next";
import type React from "react";
import { WalletProvider } from "@/lib/solana/wallet";

export const metadata: Metadata = {
  title: "Solana Street Craps",
  description: "Devnet-first craps lobbies with RPC-native listing and optional indexer enrichment.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>): JSX.Element {
  return (
    <html lang="en">
      <body className="midnight-body min-h-screen text-slate-100">
        <WalletProvider>
          <div className="shell">{children}</div>
        </WalletProvider>
      </body>
    </html>
  );
}
