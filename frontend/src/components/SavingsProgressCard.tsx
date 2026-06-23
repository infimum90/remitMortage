"use client"

import React from "react";

type Props = {
  deposited: string;
  target: string;
  progress: number;
};

export default function SavingsProgressCard({ deposited, target, progress }: Props) {
  const d = Number(deposited) || 0;
  const t = Number(target) || 0;
  const pct = t > 0 ? Math.min(100, Math.round((d / t) * 100)) : 0;

  const monthlyEstimate = (() => {
    // placeholder: estimate months remaining assuming average monthly deposit derived from progress
    if (d <= 0) return "—";
    const monthsPerPercent = 1; // unknown; keep as placeholder
    const remainingPercent = 100 - pct;
    return `${Math.ceil(remainingPercent * monthsPerPercent)} months`;
  })();

  return (
    <div className="p-6 bg-[var(--bg-card)] rounded-md">
      <h3 className="text-lg font-semibold mb-4">Savings Progress</h3>

      <div className="flex items-center gap-6">
        <div className="w-32 h-32 rounded-full bg-[var(--bg-primary)] flex items-center justify-center">
          <div className="text-center">
            <div className="text-2xl font-bold">{pct}%</div>
            <div className="text-xs text-[var(--text-secondary)]">of target</div>
          </div>
        </div>

        <div className="flex-1">
          <div className="text-sm text-[var(--text-muted)]">{d.toLocaleString()} USDC of {t.toLocaleString()} USDC</div>
          <div className="mt-3 text-sm">Estimated time remaining: <strong>{monthlyEstimate}</strong></div>
          <div className="mt-2 text-sm text-[var(--text-muted)]">Accrued yield: <strong>—</strong> (coming soon)</div>
        </div>
      </div>
    </div>
  );
}
