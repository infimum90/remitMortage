"use client"

import React, { useEffect, useState, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { Horizon } from "@stellar/stellar-sdk";

const Navbar = dynamic(() => import("../../components/Navbar"), { ssr: false });

const HORIZON_TESTNET = "https://horizon-testnet.stellar.org";
const STELLARCHAIN_BASE = "https://testnet.stellarchain.io/transactions/";
const PAGE_SIZE = 20;

type TxCategory = "All" | "Deposits" | "Withdrawals" | "Repayments" | "Disbursements";

type TxRecord = {
  id: string;
  date: string;
  category: "Deposits" | "Withdrawals" | "Repayments" | "Disbursements";
  amount: string;
  status: "Success" | "Failed";
  hash: string;
  from: string;
  to: string;
};

const CATEGORY_OPTIONS: TxCategory[] = ["All", "Deposits", "Withdrawals", "Repayments", "Disbursements"];

const CATEGORY_STYLES: Record<string, string> = {
  Deposits: "text-emerald-400 bg-emerald-400/10",
  Withdrawals: "text-amber-400 bg-amber-400/10",
  Repayments: "text-blue-400 bg-blue-400/10",
  Disbursements: "text-purple-400 bg-purple-400/10",
};

function shorten(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toCSV(rows: TxRecord[], publicKey: string): string {
  const headers = ["Date", "Type", "Amount (USDC)", "Status", "Transaction Hash", "From", "To"];
  const lines = rows.map((r) =>
    [
      `"${formatDate(r.date)}"`,
      r.category.slice(0, -1),
      r.amount,
      r.status,
      r.hash,
      r.from,
      r.to,
    ].join(",")
  );
  return [headers.join(","), ...lines].join("\n");
}

function downloadCSV(content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `remitmortgage-transactions-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function parsePaymentOp(op: any, publicKey: string): TxRecord | null {
  if (op.type !== "payment") return null;
  if (op.asset_code !== "USDC") return null;

  const isOutgoing = op.from === publicKey;
  const category: TxRecord["category"] = isOutgoing ? "Deposits" : "Disbursements";

  return {
    id: op.id,
    date: op.created_at,
    category,
    amount: parseFloat(op.amount).toFixed(2),
    status: "Success",
    hash: op.transaction_hash,
    from: op.from,
    to: op.to,
  };
}

export default function HistoryPage() {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [walletChecked, setWalletChecked] = useState(false);

  const [records, setRecords] = useState<TxRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const cursorRef = useRef<string | null>(null);

  // Filters
  const [category, setCategory] = useState<TxCategory>("All");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [amountMin, setAmountMin] = useState(0);
  const [amountMax, setAmountMax] = useState(1000000);
  const sliderMaxRef = useRef(1000000);

  // Detect Freighter connection on mount
  useEffect(() => {
    async function checkFreighter() {
      try {
        const win = window as any;
        const freighter =
          win.freighterApi ??
          (await import("@stellar/freighter-api").then((m) => m).catch(() => null));
        if (!freighter) return;

        let pk: string | null = null;
        if (typeof freighter.getPublicKey === "function") {
          pk = await freighter.getPublicKey().catch(() => null);
        } else if (typeof freighter.getAccount === "function") {
          pk = await freighter.getAccount().catch(() => null);
        }
        setPublicKey(pk);
      } catch {
        // Freighter not available or not connected
      } finally {
        setWalletChecked(true);
      }
    }
    checkFreighter();
  }, []);

  const fetchPage = useCallback(
    async (cursor?: string) => {
      if (!publicKey) return null;
      const server = new Horizon.Server(HORIZON_TESTNET);
      let query = server
        .payments()
        .forAccount(publicKey)
        .limit(PAGE_SIZE)
        .order("desc");
      if (cursor) query = (query as any).cursor(cursor);
      return query.call();
    },
    [publicKey]
  );

  // Load first page when public key is known
  useEffect(() => {
    if (!publicKey) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      setRecords([]);
      cursorRef.current = null;

      try {
        const result = await fetchPage();
        if (!result || cancelled) return;

        const parsed = (result.records as any[])
          .map((op) => parsePaymentOp(op, publicKey!))
          .filter(Boolean) as TxRecord[];

        setRecords(parsed);

        if (parsed.length > 0) {
          const maxAmt = Math.max(...parsed.map((r) => parseFloat(r.amount)));
          const ceiling = Math.ceil(maxAmt * 1.5) || 1000000;
          sliderMaxRef.current = ceiling;
          setAmountMax(ceiling);
        }

        if ((result.records as any[]).length === PAGE_SIZE) {
          const last = (result.records as any[]).at(-1);
          cursorRef.current = last?.paging_token ?? null;
          setHasMore(true);
        } else {
          setHasMore(false);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Failed to load transactions");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [publicKey, fetchPage]);

  async function loadMore() {
    if (!cursorRef.current) return;
    setLoadingMore(true);
    try {
      const result = await fetchPage(cursorRef.current);
      if (!result) return;

      const parsed = (result.records as any[])
        .map((op) => parsePaymentOp(op, publicKey!))
        .filter(Boolean) as TxRecord[];

      setRecords((prev) => [...prev, ...parsed]);

      if ((result.records as any[]).length === PAGE_SIZE) {
        const last = (result.records as any[]).at(-1);
        cursorRef.current = last?.paging_token ?? null;
        setHasMore(true);
      } else {
        cursorRef.current = null;
        setHasMore(false);
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to load more transactions");
    } finally {
      setLoadingMore(false);
    }
  }

  const filtered = records.filter((r) => {
    if (category !== "All" && r.category !== category) return false;
    if (dateFrom && r.date < dateFrom) return false;
    if (dateTo && r.date > dateTo + "T23:59:59Z") return false;
    const amt = parseFloat(r.amount);
    if (amt < amountMin || amt > amountMax) return false;
    return true;
  });

  function handleExport() {
    if (!publicKey) return;
    downloadCSV(toCSV(filtered, publicKey));
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <Navbar />

      <main className="max-w-7xl mx-auto px-6 py-24">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-1">Transaction History</h1>
            <p className="text-[var(--text-secondary)] text-sm">
              USDC payment operations on Stellar Testnet
            </p>
          </div>
          <button
            onClick={handleExport}
            disabled={filtered.length === 0}
            className="btn-primary !py-2.5 !px-5 !text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Export CSV
          </button>
        </div>

        {/* Wallet not connected */}
        {walletChecked && !publicKey && (
          <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-10 text-center">
            <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-[var(--accent-primary)]/10 flex items-center justify-center">
              <svg className="w-6 h-6 text-[var(--accent-primary-light)]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 0 0-2.25-2.25H15a3 3 0 1 1-6 0H5.25A2.25 2.25 0 0 0 3 12m18 0v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 9m18 0V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v3" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold mb-2">Connect your wallet</h2>
            <p className="text-[var(--text-secondary)] text-sm">
              Connect Freighter via the navbar to view your transaction history.
            </p>
          </div>
        )}

        {/* Filters — only show when connected */}
        {publicKey && (
          <>
            <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-5 mb-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                {/* Category */}
                <div>
                  <label className="block text-xs text-[var(--text-muted)] mb-1.5 font-medium uppercase tracking-wider">
                    Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as TxCategory)}
                    className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)] transition-colors"
                  >
                    {CATEGORY_OPTIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Date from */}
                <div>
                  <label className="block text-xs text-[var(--text-muted)] mb-1.5 font-medium uppercase tracking-wider">
                    From Date
                  </label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)] transition-colors"
                  />
                </div>

                {/* Date to */}
                <div>
                  <label className="block text-xs text-[var(--text-muted)] mb-1.5 font-medium uppercase tracking-wider">
                    To Date
                  </label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)] transition-colors"
                  />
                </div>

                {/* Amount range */}
                <div>
                  <label className="block text-xs text-[var(--text-muted)] mb-1.5 font-medium uppercase tracking-wider">
                    Amount: {amountMin.toLocaleString()} – {amountMax.toLocaleString()} USDC
                  </label>
                  <div className="space-y-2 pt-1">
                    <input
                      type="range"
                      min={0}
                      max={sliderMaxRef.current}
                      value={amountMin}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setAmountMin(Math.min(v, amountMax));
                      }}
                      className="w-full accent-[var(--accent-primary)] h-1"
                    />
                    <input
                      type="range"
                      min={0}
                      max={sliderMaxRef.current}
                      value={amountMax}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setAmountMax(Math.max(v, amountMin));
                      }}
                      className="w-full accent-[var(--accent-primary)] h-1"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Loading / Error */}
            {loading && (
              <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-10 text-center text-[var(--text-secondary)]">
                <div className="inline-block w-5 h-5 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin mb-3" />
                <p className="text-sm">Loading transactions…</p>
              </div>
            )}

            {error && !loading && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-5 text-red-400 text-sm">
                {error}
              </div>
            )}

            {/* Table */}
            {!loading && !error && (
              <>
                {filtered.length === 0 ? (
                  <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-10 text-center text-[var(--text-secondary)] text-sm">
                    {records.length === 0
                      ? "No USDC transactions found for this wallet."
                      : "No transactions match the selected filters."}
                  </div>
                ) : (
                  <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-[var(--border-color)] text-[var(--text-muted)] text-xs uppercase tracking-wider">
                            <th className="px-5 py-3 text-left font-medium">Date</th>
                            <th className="px-5 py-3 text-left font-medium">Type</th>
                            <th className="px-5 py-3 text-right font-medium">Amount</th>
                            <th className="px-5 py-3 text-left font-medium">Status</th>
                            <th className="px-5 py-3 text-left font-medium">Transaction</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filtered.map((tx) => (
                            <tr
                              key={tx.id}
                              className="border-b border-[var(--border-color)]/40 last:border-0 hover:bg-[var(--bg-card-hover)] transition-colors"
                            >
                              <td className="px-5 py-4 text-[var(--text-secondary)] whitespace-nowrap">
                                {formatDate(tx.date)}
                              </td>

                              <td className="px-5 py-4">
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${CATEGORY_STYLES[tx.category]}`}
                                >
                                  {tx.category.slice(0, -1)}
                                </span>
                              </td>

                              <td className="px-5 py-4 text-right font-medium tabular-nums">
                                <span
                                  className={
                                    tx.from === publicKey
                                      ? "text-[var(--text-primary)]"
                                      : "text-emerald-400"
                                  }
                                >
                                  {tx.from === publicKey ? "−" : "+"}
                                  {tx.amount} USDC
                                </span>
                              </td>

                              <td className="px-5 py-4">
                                <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                  {tx.status}
                                </span>
                              </td>

                              <td className="px-5 py-4">
                                <a
                                  href={`${STELLARCHAIN_BASE}${tx.hash}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-mono text-[var(--accent-primary-light)] hover:underline text-xs"
                                  title={tx.hash}
                                >
                                  {shorten(tx.hash)}
                                </a>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {hasMore && (
                      <div className="px-5 py-4 border-t border-[var(--border-color)]">
                        <button
                          onClick={loadMore}
                          disabled={loadingMore}
                          className="w-full py-2.5 rounded-lg border border-[var(--border-color)] text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {loadingMore ? "Loading…" : "Load More"}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <p className="mt-3 text-xs text-[var(--text-muted)]">
                  Showing {filtered.length} of {records.length} loaded transactions
                </p>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
