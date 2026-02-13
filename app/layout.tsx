import "./midnight-concrete.css";
import { WalletProvider } from "@/lib/solana/wallet";
export default RootLayout;
import type React from 'react';
import '@/styles/globals.css';
import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Solana Street Craps',
  description: 'Devnet-first craps lobbies with RPC-native listing and optional indexer enrichment.'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>): JSX.Element {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-100">{children}</body>
    </html>
  );
}
