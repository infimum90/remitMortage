"use client"

import React, { createContext, useContext, useEffect, useState } from "react";
import { Horizon } from "@stellar/stellar-sdk";

type BalanceLine = {
  asset_code?: string;
  balance: string;
};

type FreighterClient = {
  requestAccess?: () => void | Promise<void>;
  getPublicKey?: () => string | Promise<string>;
  getAccount?: () => string | Promise<string>;
  getNetwork?: () => string | Promise<string>;
};

type FreighterWindow = Window & {
  freighterApi?: FreighterClient;
  freighter?: {
    publicKey?: string;
  };
};

type WalletContextType = {
  publicKey: string | null;
  isConnected: boolean;
  usdcBalance: string | null;
  network: string | null;
  wrongNetwork: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
};

const WalletContext = createContext<WalletContextType | undefined>(undefined);

const HORIZON_TESTNET = "https://horizon-testnet.stellar.org";

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [usdcBalance, setUsdcBalance] = useState<string | null>(null);
  const [network, setNetwork] = useState<string | null>(null);
  const [wrongNetwork, setWrongNetwork] = useState<boolean>(false);

  const server = new Horizon.Server(HORIZON_TESTNET);

  async function fetchBalances(pk: string) {
    try {
      const account = await server.accounts().accountId(pk).call();
      const balances = account.balances as BalanceLine[];
      const usdc = balances.find((balance) => balance.asset_code === "USDC");
      if (usdc) setUsdcBalance(usdc.balance);
      else setUsdcBalance("0");
    } catch {
      setUsdcBalance(null);
    }
  }

  async function connect() {
    try {
      const win = window as FreighterWindow;

      // Prefer the published freighter API package if available, else fall back to injected window.freighterApi
      const freighter = (win.freighterApi ?? (await import("@stellar/freighter-api").then((module) => module as FreighterClient).catch(() => null))) as FreighterClient | null;

      if (!freighter) throw new Error("Freighter not available");

      // Request access / permissions if the method exists
      if (typeof freighter.requestAccess === "function") {
        await freighter.requestAccess();
      }

      // Try to read public key
      let pk: string | null = null;
      if (typeof freighter.getPublicKey === "function") {
        pk = await freighter.getPublicKey();
      } else if (typeof freighter.getAccount === "function") {
        // some older APIs expose getAccount
        pk = await freighter.getAccount();
      } else if (win.freighter?.publicKey) {
        pk = win.freighter.publicKey;
      }

      if (!pk) throw new Error("Could not get public key from Freighter");

      setPublicKey(pk);

      // Attempt to detect network from freighter if available
      let net: string | null = null;
      if (typeof freighter.getNetwork === "function") {
        try {
          // Some implementations return 'TESTNET' or 'PUBLIC' or 'testnet'
          net = (await freighter.getNetwork()) as string;
        } catch {
          net = null;
        }
      }

      setNetwork(net);
      setWrongNetwork(net ? net.toLowerCase().includes("test") === false : false);

      // Fetch balances on testnet horizon
      await fetchBalances(pk);
    } catch (err) {
      console.error("Wallet connect failed", err);
      // leave state as disconnected
    }
  }

  function disconnect() {
    setPublicKey(null);
    setUsdcBalance(null);
    setNetwork(null);
    setWrongNetwork(false);
  }

  // If user had previously connected, try to populate (best-effort)
  useEffect(() => {
    // no-op for now; avoid automatic permission prompts
  }, []);

  const value: WalletContextType = {
    publicKey,
    isConnected: !!publicKey,
    usdcBalance,
    network,
    wrongNetwork,
    connect,
    disconnect,
  };

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}

export default WalletContext;
