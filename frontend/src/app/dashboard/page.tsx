"use client"

export const dynamic = "force-dynamic";

import React, { useEffect, useState } from "react";
import loadDynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { WalletProvider, useWallet } from "../../context/WalletContext";
import SavingsProgressCard from "../../components/SavingsProgressCard";
import LoanStatusCard from "../../components/LoanStatusCard";
import DepositForm from "../../components/DepositForm";

const Navbar = loadDynamic(() => import("../../components/Navbar"), { ssr: false });

type BorrowerStatus = {
  address: string;
  escrow: { deposited: string; target: string; progress: number };
  loan: { status: string; principal: string; disbursed: string; repaid: string };
};

function DashboardInner() {
  const router = useRouter();
  const { publicKey, isConnected } = useWallet();
  const [status, setStatus] = useState<BorrowerStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isConnected) {
      router.push("/");
      return;
    }

    if (!publicKey) return;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/borrower/${publicKey}/status`);
        if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
        const data = await res.json();
        setStatus(data);
      } catch (e: any) {
        setError(e?.message || "Failed to load borrower status");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [isConnected, publicKey, router]);

  return (
    <div>
      <Navbar />
      <main className="max-w-4xl mx-auto px-6 py-24">
        <h1 className="text-3xl font-bold mb-6">Borrower Dashboard</h1>

        {loading && <div className="p-6 bg-[var(--bg-card)] rounded-md">Loading...</div>}
        {error && <div className="p-6 bg-red-50 text-red-700 rounded-md">{error}</div>}

        {!loading && !error && status && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <SavingsProgressCard
              deposited={status.escrow.deposited}
              target={status.escrow.target}
              progress={status.escrow.progress}
            />
            <div className="space-y-6">
              <LoanStatusCard loan={status.loan} />
              <DepositForm address={status.address} />
            </div>
          </div>
        )}

        {!loading && !error && !status && (
          <div className="p-6 bg-[var(--bg-card)] rounded-md">No borrower data available.</div>
        )}
      </main>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <WalletProvider>
      <DashboardInner />
    </WalletProvider>
  );
}
