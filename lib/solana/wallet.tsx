"use client";

import React, { createContext, useContext, useMemo, useState } from "react";
import { WalletRole } from "@/types/word-game";

interface WalletState {
  publicKey: string | null;
  role: WalletRole;
  connect: (wallet: string, role: WalletRole) => void;
  disconnect: () => void;
}

const WalletContext = createContext<WalletState | undefined>(undefined);

export const WalletProvider = ({ children }: { children: React.ReactNode }): JSX.Element => {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [role, setRole] = useState<WalletRole>("observer");

  const value = useMemo<WalletState>(
    () => ({
      publicKey,
      role,
      connect: (wallet, nextRole) => {
        setPublicKey(wallet);
        setRole(nextRole);
      },
      disconnect: () => {
        setPublicKey(null);
        setRole("observer");
      },
    }),
    [publicKey, role],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
};

export const useWallet = (): WalletState => {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error("useWallet must be used within WalletProvider");
  }
  return context;
};
