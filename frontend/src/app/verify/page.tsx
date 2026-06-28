"use client";

import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import toast, { Toaster } from "react-hot-toast";
import { useWallet, WalletProvider } from "../../context/WalletContext";
import {
  isValidStellarAddress,
  VerificationResult,
  VerificationStats,
} from "../../lib/verification";

const Navbar = dynamic(() => import("../../components/Navbar"), { ssr: false });

export default function VerifyPage() {
  return (
    <WalletProvider>
      <VerifyPageInner />
    </WalletProvider>
  );
}

function VerifyPageInner() {
  const { publicKey } = useWallet();

  const [senderAddress, setSenderAddress] = useState("");
  const [recipientAddress, setRecipientAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VerificationResult | null>(null);

  // Auto-fill the sender field from the connected wallet, unless the user has
  // already typed their own value.
  useEffect(() => {
    if (publicKey && senderAddress === "") {
      setSenderAddress(publicKey);
    }
  }, [publicKey, senderAddress]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (!isValidStellarAddress(senderAddress)) {
      toast.error("Enter a valid sender Stellar address (starts with G).");
      return;
    }
    if (!isValidStellarAddress(recipientAddress)) {
      toast.error("Enter a valid recipient Stellar address (starts with G).");
      return;
    }
    if (senderAddress === recipientAddress) {
      toast.error("Sender and recipient addresses must be different.");
      return;
    }

    setLoading(true);
    setResult(null);
    try {
      const response = await fetch("/api/verification/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senderAddress, recipientAddress }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error ?? "Verification failed.");
      }
      setResult(data as VerificationResult);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Verification failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <Navbar />
      <Toaster position="top-right" />

      <main className="max-w-3xl mx-auto px-6 py-24">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Check Eligibility</h1>
          <p className="text-[var(--text-secondary)]">
            Turn your remittance history into credit reputation. Enter your
            Stellar address and the family member you send to, and we will
            score your on-chain payment record.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="p-6 bg-[var(--bg-card)] rounded-lg border border-[var(--border-color)] space-y-4 mb-8"
        >
          <div>
            <label
              htmlFor="sender-address"
              className="block text-sm font-medium text-[var(--text-secondary)] mb-1"
            >
              Your Stellar Address
            </label>
            <input
              id="sender-address"
              type="text"
              spellCheck={false}
              placeholder="G..."
              value={senderAddress}
              onChange={(event) => setSenderAddress(event.target.value.trim())}
              className="w-full p-2.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] text-sm font-mono"
            />
            {publicKey && senderAddress === publicKey && (
              <p className="text-xs text-[var(--text-muted)] mt-1">
                Auto-filled from your connected wallet.
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="recipient-address"
              className="block text-sm font-medium text-[var(--text-secondary)] mb-1"
            >
              Recipient Address (family member)
            </label>
            <input
              id="recipient-address"
              type="text"
              spellCheck={false}
              placeholder="G..."
              value={recipientAddress}
              onChange={(event) => setRecipientAddress(event.target.value.trim())}
              className="w-full p-2.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] text-sm font-mono"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full"
            aria-busy={loading}
          >
            {loading ? "Checking…" : "Check Eligibility"}
          </button>
        </form>

        {loading && <ResultsSkeleton />}

        {!loading && result && <Results result={result} />}

        {!loading && !result && (
          <div className="text-center py-10 text-sm text-[var(--text-muted)]">
            Your eligibility breakdown will appear here after you run a check.
          </div>
        )}
      </main>
    </div>
  );
}

function ResultsSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-hidden="true">
      <div className="h-16 rounded-lg bg-[var(--bg-card)] border border-[var(--border-color)]" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((index) => (
          <div
            key={index}
            className="h-24 rounded-lg bg-[var(--bg-card)] border border-[var(--border-color)]"
          />
        ))}
      </div>
      <div className="h-24 rounded-lg bg-[var(--bg-card)] border border-[var(--border-color)]" />
    </div>
  );
}

function Results({ result }: { result: VerificationResult }) {
  const { eligible, message, stats } = result;
  return (
    <div className="space-y-6 animate-fade-in-up">
      <EligibilityBadge eligible={eligible} message={message} />
      <StatsGrid stats={stats} />
      <Timeline stats={stats} />
    </div>
  );
}

function EligibilityBadge({ eligible, message }: { eligible: boolean; message: string }) {
  return (
    <div
      role="status"
      className={`flex items-start gap-4 p-5 rounded-lg border ${
        eligible
          ? "border-emerald-500/40 bg-emerald-500/10"
          : "border-red-500/40 bg-red-500/10"
      }`}
    >
      <span
        className={`shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-full text-white ${
          eligible ? "bg-emerald-500" : "bg-red-500"
        }`}
        aria-hidden="true"
      >
        {eligible ? "✓" : "✕"}
      </span>
      <div>
        <p
          className={`text-lg font-bold ${
            eligible ? "text-emerald-400" : "text-red-400"
          }`}
        >
          {eligible ? "Eligible" : "Not Eligible"}
        </p>
        <p className="text-sm text-[var(--text-secondary)] mt-0.5">{message}</p>
      </div>
    </div>
  );
}

function StatsGrid({ stats }: { stats: VerificationStats }) {
  const cards = [
    { label: "Payments Found", value: stats.totalPayments.toLocaleString() },
    { label: "Total Volume", value: `$${stats.totalVolume.toLocaleString()}` },
    { label: "Average Payment", value: `$${stats.averagePayment.toLocaleString()}` },
    { label: "Timespan", value: `${stats.timespanMonths} mo` },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="p-5 bg-[var(--bg-card)] rounded-lg border border-[var(--border-color)]"
        >
          <p className="text-xs text-[var(--text-muted)] mb-1">{card.label}</p>
          <p className="text-2xl font-bold">{card.value}</p>
        </div>
      ))}
    </div>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function Timeline({ stats }: { stats: VerificationStats }) {
  if (!stats.firstPaymentDate || !stats.lastPaymentDate) {
    return null;
  }
  return (
    <div className="p-5 bg-[var(--bg-card)] rounded-lg border border-[var(--border-color)]">
      <h2 className="text-sm font-semibold text-[var(--text-secondary)] mb-4">
        Payment Timeline
      </h2>
      <div className="flex items-center gap-3">
        <div className="text-center">
          <p className="text-xs text-[var(--text-muted)]">First</p>
          <p className="text-sm font-semibold">{formatDate(stats.firstPaymentDate)}</p>
        </div>
        <div className="flex-1 relative h-1 rounded-full bg-[var(--bg-primary)]">
          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-[var(--accent-primary)]" />
          <span className="absolute inset-0 rounded-full bg-gradient-to-r from-[var(--accent-primary)] to-[var(--accent-secondary)]" />
          <span className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-[var(--accent-secondary)]" />
        </div>
        <div className="text-center">
          <p className="text-xs text-[var(--text-muted)]">Latest</p>
          <p className="text-sm font-semibold">{formatDate(stats.lastPaymentDate)}</p>
        </div>
      </div>
      <p className="text-xs text-[var(--text-muted)] mt-3 text-center">
        {stats.timespanMonths} months of remittance history
      </p>
    </div>
  );
}
