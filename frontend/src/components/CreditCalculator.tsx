"use client";

import React, { useState, useMemo } from "react";

// Types
type FrequencyOption = "Weekly" | "Bi-weekly" | "Monthly" | "Bi-monthly" | "Quarterly" | "Irregular";
type MortgageTermOption = 15 | 20 | 30;

export default function CreditCalculator() {
  // ─── Input States ──────────────────────────────────────────────────────────
  const [monthlyRemittance, setMonthlyRemittance] = useState<number>(500);
  const [consistency, setConsistency] = useState<number>(95);
  const [sendingHistory, setSendingHistory] = useState<number>(12);
  const [frequency, setFrequency] = useState<FrequencyOption>("Monthly");
  const [purchasePrice, setPurchasePrice] = useState<number>(250000);
  const [mortgageTerm, setMortgageTerm] = useState<MortgageTermOption>(30);

  // ─── Safe Input Parsing & Clamping ─────────────────────────────────────────
  const safeRemittance = useMemo(() => Math.max(0, monthlyRemittance || 0), [monthlyRemittance]);
  const safeConsistency = useMemo(() => Math.min(100, Math.max(0, consistency || 0)), [consistency]);
  const safeHistory = useMemo(() => Math.max(0, sendingHistory || 0), [sendingHistory]);
  const safePurchasePrice = useMemo(() => Math.max(0, purchasePrice || 0), [purchasePrice]);

  // ─── Credit Score & Tier Calculations ──────────────────────────────────────
  const { score, consistencyScore, frequencyScore, durationScore, volumeScore, tier } = useMemo(() => {
    // 1. Consistency Score (Max 40)
    const cScore = Math.round(40 * (safeConsistency / 100));

    // 2. Frequency Score (Max 25)
    let fScore = 0;
    if (frequency === "Weekly" || frequency === "Bi-weekly" || frequency === "Monthly") {
      fScore = 25;
    } else if (frequency === "Bi-monthly") {
      fScore = 15;
    } else if (frequency === "Quarterly") {
      fScore = 5;
    }

    // 3. Duration Score (Max 20)
    let dScore = 0;
    if (safeHistory >= 12) {
      dScore = 20;
    } else if (safeHistory >= 6) {
      dScore = 10;
    } else if (safeHistory >= 3) {
      dScore = 5;
    }

    // 4. Volume Score (Max 15)
    const totalVolume = safeRemittance * safeHistory;
    let vScore = 0;
    if (totalVolume >= 5000) {
      vScore = 15;
    } else if (totalVolume >= 2000) {
      vScore = 10;
    } else if (totalVolume >= 500) {
      vScore = 5;
    }

    const totalScore = Math.min(100, cScore + fScore + dScore + vScore);

    let classification = "Insufficient";
    if (totalScore >= 80) {
      classification = "Excellent";
    } else if (totalScore >= 60) {
      classification = "Good";
    } else if (totalScore >= 40) {
      classification = "Fair";
    }

    return {
      score: totalScore,
      consistencyScore: cScore,
      frequencyScore: fScore,
      durationScore: dScore,
      volumeScore: vScore,
      tier: classification,
    };
  }, [safeConsistency, frequency, safeHistory, safeRemittance]);

  // ─── Mortgage Parameters by Tier ──────────────────────────────────────────
  const tierConfig = useMemo(() => {
    switch (tier) {
      case "Excellent":
        return { rate: 3.5, downPaymentPct: 10, maxLoan: 600000, color: "var(--success)" };
      case "Good":
        return { rate: 4.8, downPaymentPct: 20, maxLoan: 400000, color: "var(--accent-secondary)" };
      case "Fair":
        return { rate: 6.2, downPaymentPct: 30, maxLoan: 250000, color: "var(--warning)" };
      case "Insufficient":
      default:
        return { rate: 8.5, downPaymentPct: 50, maxLoan: 750000, color: "var(--error)" }; // Wait, default for Insufficient: higher down payment, low loan principal (e.g. 75,000)
    }
  }, [tier]);

  // ─── Amortization Calculations ─────────────────────────────────────────────
  const { downPaymentRequired, maxLoanPrincipal, actualLoanAmount, monthlyPayment, isCapped } = useMemo(() => {
    const downPaymentPct = tierConfig.downPaymentPct;
    const initialDownPayment = (safePurchasePrice * downPaymentPct) / 100;
    const initialLoan = safePurchasePrice - initialDownPayment;

    // Check if the loan exceeds the maximum allowed principal for this tier
    const isLoanCapped = initialLoan > tierConfig.maxLoan;
    const actualLoan = isLoanCapped ? tierConfig.maxLoan : initialLoan;
    const actualDownPayment = safePurchasePrice - actualLoan;

    // Amortization calculation
    const r = tierConfig.rate / 12 / 100; // monthly rate
    const n = mortgageTerm * 12; // total payments
    let payment = 0;

    if (actualLoan > 0) {
      if (r > 0) {
        payment = (actualLoan * (r * Math.pow(1 + r, n))) / (Math.pow(1 + r, n) - 1);
      } else {
        payment = actualLoan / n;
      }
    }

    return {
      downPaymentRequired: actualDownPayment,
      maxLoanPrincipal: tierConfig.maxLoan,
      actualLoanAmount: actualLoan,
      monthlyPayment: Math.round(payment * 100) / 100,
      isCapped: isLoanCapped,
    };
  }, [safePurchasePrice, tierConfig, mortgageTerm]);

  // ─── SVG Chart Data (Rate vs. History for fixed consistency/volume) ────────
  // Evaluates interest rates at history values 1 to 36 months
  const chartPoints = useMemo(() => {
    const points = [];
    const steps = [3, 6, 12, 18, 24, 30, 36];
    for (const h of steps) {
      // Re-evaluate score/tier for each history step to see what interest rate they get
      const cScore = Math.round(40 * (safeConsistency / 100));
      let fScore = 0;
      if (frequency === "Weekly" || frequency === "Bi-weekly" || frequency === "Monthly") {
        fScore = 25;
      } else if (frequency === "Bi-monthly") {
        fScore = 15;
      } else if (frequency === "Quarterly") {
        fScore = 5;
      }

      let dScore = 0;
      if (h >= 12) {
        dScore = 20;
      } else if (h >= 6) {
        dScore = 10;
      } else if (h >= 3) {
        dScore = 5;
      }

      const totalVolume = safeRemittance * h;
      let vScore = 0;
      if (totalVolume >= 5000) {
        vScore = 15;
      } else if (totalVolume >= 2000) {
        vScore = 10;
      } else if (totalVolume >= 500) {
        vScore = 5;
      }

      const tempScore = cScore + fScore + dScore + vScore;
      let tempRate = 8.5;
      if (tempScore >= 80) tempRate = 3.5;
      else if (tempScore >= 60) tempRate = 4.8;
      else if (tempScore >= 40) tempRate = 6.2;

      points.push({ months: h, rate: tempRate });
    }
    return points;
  }, [safeConsistency, frequency, safeRemittance]);

  // SVG dimensions & mapping
  const width = 500;
  const height = 200;
  const padding = 35;

  const svgCoordinates = useMemo(() => {
    const minMonths = 3;
    const maxMonths = 36;
    const minRate = 3.0;
    const maxRate = 9.0;

    const getX = (months: number) =>
      padding + ((months - minMonths) / (maxMonths - minMonths)) * (width - 2 * padding);
    const getY = (rate: number) =>
      height - padding - ((rate - minRate) / (maxRate - minRate)) * (height - 2 * padding);

    const path = chartPoints
      .map((p, idx) => `${idx === 0 ? "M" : "L"} ${getX(p.months)} ${getY(p.rate)}`)
      .join(" ");

    // Get current user point coordinates
    const currentX = getX(Math.min(36, Math.max(3, safeHistory)));
    const currentY = getY(tierConfig.rate);

    return { path, currentX, currentY, getX, getY };
  }, [chartPoints, safeHistory, tierConfig]);

  return (
    <div className="glass-card p-6 md:p-8 animate-fade-in-up w-full">
      <div className="mb-6">
        <h2 className="text-2xl font-bold gradient-text">Mortgage Eligibility Calculator</h2>
        <p className="text-[var(--text-secondary)] text-sm">
          Simulate how your remittance history affects your credit score, mortgage interest rates, and loan limits.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* ─── LEFT: Inputs ─── */}
        <div className="space-y-5">
          <h3 className="text-lg font-semibold border-b border-[var(--border-color)] pb-2">
            Remittance & Loan Inputs
          </h3>

          {/* Monthly Remittance */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-sm font-medium text-[var(--text-secondary)]">Monthly Remittance</label>
              <span className="text-sm font-semibold text-[var(--accent-primary-light)]">
                ${safeRemittance.toLocaleString()} USDC
              </span>
            </div>
            <input
              type="range"
              min="50"
              max="5000"
              step="50"
              className="w-full h-1 bg-[var(--bg-secondary)] rounded-lg appearance-none cursor-pointer accent-[var(--accent-primary)]"
              value={monthlyRemittance}
              onChange={(e) => setMonthlyRemittance(Number(e.target.value))}
            />
          </div>

          {/* Consistency Percentage */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-sm font-medium text-[var(--text-secondary)]">Consistency Score</label>
              <span className="text-sm font-semibold text-[var(--accent-primary-light)]">
                {safeConsistency}% On-Time
              </span>
            </div>
            <input
              type="range"
              min="10"
              max="100"
              step="1"
              className="w-full h-1 bg-[var(--bg-secondary)] rounded-lg appearance-none cursor-pointer accent-[var(--accent-primary)]"
              value={consistency}
              onChange={(e) => setConsistency(Number(e.target.value))}
            />
          </div>

          {/* Sending History (Months) */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-sm font-medium text-[var(--text-secondary)]">Sending History</label>
              <span className="text-sm font-semibold text-[var(--accent-primary-light)]">
                {safeHistory} Months
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="36"
              step="1"
              className="w-full h-1 bg-[var(--bg-secondary)] rounded-lg appearance-none cursor-pointer accent-[var(--accent-primary)]"
              value={sendingHistory}
              onChange={(e) => setSendingHistory(Number(e.target.value))}
            />
          </div>

          {/* Remittance Frequency */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
              Remittance Frequency
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(["Weekly", "Bi-weekly", "Monthly", "Bi-monthly", "Quarterly", "Irregular"] as FrequencyOption[]).map(
                (opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setFrequency(opt)}
                    className={`py-2 px-1 text-xs font-semibold rounded-md border transition-all ${
                      frequency === opt
                        ? "bg-[var(--accent-primary)] border-[var(--accent-primary)] text-white shadow-md shadow-indigo-500/20"
                        : "bg-[var(--bg-secondary)] border-[var(--border-color)] text-[var(--text-secondary)] hover:text-white"
                    }`}
                  >
                    {opt}
                  </button>
                )
              )}
            </div>
          </div>

          {/* Target Home Price */}
          <div className="border-t border-[var(--border-color)] pt-4">
            <div className="flex justify-between items-center mb-1">
              <label className="text-sm font-medium text-[var(--text-secondary)]">Target Purchase Price</label>
              <span className="text-sm font-semibold text-[var(--accent-primary-light)]">
                ${safePurchasePrice.toLocaleString()} USDC
              </span>
            </div>
            <input
              type="range"
              min="50000"
              max="800000"
              step="10000"
              className="w-full h-1 bg-[var(--bg-secondary)] rounded-lg appearance-none cursor-pointer accent-[var(--accent-primary)]"
              value={purchasePrice}
              onChange={(e) => setPurchasePrice(Number(e.target.value))}
            />
          </div>

          {/* Mortgage Term */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
              Mortgage Term
            </label>
            <div className="flex gap-2">
              {([15, 20, 30] as MortgageTermOption[]).map((term) => (
                <button
                  key={term}
                  type="button"
                  onClick={() => setMortgageTerm(term)}
                  className={`flex-1 py-2 text-sm font-semibold rounded-md border transition-all ${
                    mortgageTerm === term
                      ? "bg-[var(--accent-primary)] border-[var(--accent-primary)] text-white shadow-md shadow-indigo-500/20"
                      : "bg-[var(--bg-secondary)] border-[var(--border-color)] text-[var(--text-secondary)] hover:text-white"
                  }`}
                >
                  {term} Years
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ─── RIGHT: Outputs & Visuals ─── */}
        <div className="space-y-6">
          {/* Projected Score & Tier badge */}
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-5 flex flex-col md:flex-row items-center gap-6">
            {/* Radial score gauge */}
            <div className="relative w-28 h-28 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90">
                <circle
                  cx="56"
                  cy="56"
                  r="48"
                  className="stroke-[var(--bg-primary)] fill-transparent"
                  strokeWidth="8"
                />
                <circle
                  cx="56"
                  cy="56"
                  r="48"
                  strokeDasharray={301.6}
                  strokeDashoffset={301.6 - (301.6 * score) / 100}
                  className="stroke-[var(--accent-primary)] fill-transparent transition-all duration-500 ease-out"
                  strokeWidth="8"
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute text-center">
                <div className="text-3xl font-extrabold text-white">{score}</div>
                <div className="text-[10px] text-[var(--text-muted)] tracking-wider uppercase font-bold">
                  Score
                </div>
              </div>
            </div>

            {/* Score Details */}
            <div className="flex-1 text-center md:text-left">
              <div className="mb-2">
                <span className="text-xs text-[var(--text-muted)] font-bold tracking-widest uppercase">
                  Projected Credit Tier
                </span>
                <div className="flex items-center justify-center md:justify-start gap-2 mt-1">
                  <h4 className="text-2xl font-extrabold text-white">{tier}</h4>
                  <span
                    className="inline-block w-3.5 h-3.5 rounded-full animate-pulse"
                    style={{ backgroundColor: tierConfig.color }}
                  />
                </div>
              </div>

              {/* Dynamic Tier helper text */}
              <p className="text-xs text-[var(--text-secondary)]">
                {tier === "Excellent" && "🎉 Unlocks maximum borrowing power & our lowest interest rates!"}
                {tier === "Good" && "👍 Strong credit rating. Eligible for standard prime mortgage terms."}
                {tier === "Fair" && "⚠️ Moderate credit tier. Requires a larger down payment configuration."}
                {tier === "Insufficient" && "❌ Below minimum threshold. Increase consistency and history to qualify."}
              </p>
            </div>
          </div>

          {/* Detailed Score Breakdown */}
          <div className="space-y-3 bg-[var(--bg-glass)] border border-[var(--border-color)] rounded-xl p-4">
            <h4 className="text-xs font-bold text-[var(--text-muted)] tracking-widest uppercase mb-1">
              Score Breakdown Formula
            </h4>

            {/* Consistency */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-[var(--text-secondary)]">Consistency (40% Weight)</span>
                <span className="font-semibold">{consistencyScore} / 40</span>
              </div>
              <div className="w-full bg-[var(--bg-primary)] h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-indigo-500 h-full rounded-full transition-all duration-300"
                  style={{ width: `${(consistencyScore / 40) * 100}%` }}
                />
              </div>
            </div>

            {/* Frequency */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-[var(--text-secondary)]">Frequency (25% Weight)</span>
                <span className="font-semibold">{frequencyScore} / 25</span>
              </div>
              <div className="w-full bg-[var(--bg-primary)] h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-cyan-500 h-full rounded-full transition-all duration-300"
                  style={{ width: `${(frequencyScore / 25) * 100}%` }}
                />
              </div>
            </div>

            {/* Duration */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-[var(--text-secondary)]">Duration (20% Weight)</span>
                <span className="font-semibold">{durationScore} / 20</span>
              </div>
              <div className="w-full bg-[var(--bg-primary)] h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-purple-500 h-full rounded-full transition-all duration-300"
                  style={{ width: `${(durationScore / 20) * 100}%` }}
                />
              </div>
            </div>

            {/* Volume */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-[var(--text-secondary)]">Volume (15% Weight)</span>
                <span className="font-semibold">{volumeScore} / 15</span>
              </div>
              <div className="w-full bg-[var(--bg-primary)] h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-teal-500 h-full rounded-full transition-all duration-300"
                  style={{ width: `${(volumeScore / 15) * 100}%` }}
                />
              </div>
            </div>
          </div>

          {/* ─── Financial Outputs Grid ─── */}
          <div className="grid grid-cols-2 gap-4">
            {/* Interest Rate */}
            <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-4 text-center">
              <span className="block text-xs text-[var(--text-muted)] font-bold tracking-wider uppercase mb-1">
                Interest Rate
              </span>
              <span className="text-3xl font-extrabold text-white">{tierConfig.rate.toFixed(2)}%</span>
            </div>

            {/* Monthly Amortization */}
            <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-4 text-center ring-1 ring-[var(--accent-primary)]/30">
              <span className="block text-xs text-[var(--text-muted)] font-bold tracking-wider uppercase mb-1">
                Projected Monthly Payment
              </span>
              <span className="text-2xl font-extrabold text-white">
                ${monthlyPayment.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="block text-[10px] text-[var(--text-muted)]">USDC / Month</span>
            </div>

            {/* Down Payment */}
            <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-4 text-center">
              <span className="block text-xs text-[var(--text-muted)] font-bold tracking-wider uppercase mb-1">
                Down Payment Required
              </span>
              <span className="text-xl font-extrabold text-white">${downPaymentRequired.toLocaleString()}</span>
              <span className="block text-xs text-[var(--text-muted)]">({tierConfig.downPaymentPct}% standard)</span>
            </div>

            {/* Max Loan Limit */}
            <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-4 text-center">
              <span className="block text-xs text-[var(--text-muted)] font-bold tracking-wider uppercase mb-1">
                Max Loan Principal
              </span>
              <span className="text-xl font-extrabold text-white">${maxLoanPrincipal.toLocaleString()}</span>
              <span className="block text-xs text-[var(--text-muted)]">for {tier} tier</span>
            </div>
          </div>

          {/* Capped Loan warning */}
          {isCapped && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-300 p-3 rounded-lg text-xs flex items-start gap-2">
              <span>⚠️</span>
              <div>
                <strong>Loan Capped:</strong> The target loan amount exceeds the max loan principal of $
                {maxLoanPrincipal.toLocaleString()} allowed for your credit tier. Your required down payment has been
                increased to ${downPaymentRequired.toLocaleString()} to cover the remaining purchase cost.
              </div>
            </div>
          )}

          {/* ─── Interest Rate Curve SVG Chart ─── */}
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-4">
            <h4 className="text-xs font-bold text-[var(--text-muted)] tracking-wider uppercase mb-3 text-center">
              Interest Rate Curve vs. History (Months)
            </h4>
            <div className="relative flex justify-center">
              <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
                {/* Horizontal Grid lines */}
                {[3.5, 4.8, 6.2, 8.5].map((rate) => {
                  const y = svgCoordinates.getY(rate);
                  return (
                    <g key={rate}>
                      <line
                        x1={padding}
                        y1={y}
                        x2={width - padding}
                        y2={y}
                        stroke="rgba(99,102,241,0.06)"
                        strokeDasharray="4 4"
                      />
                      <text
                        x={padding - 5}
                        y={y + 3}
                        fill="var(--text-muted)"
                        fontSize="9"
                        textAnchor="end"
                        className="font-mono"
                      >
                        {rate.toFixed(1)}%
                      </text>
                    </g>
                  );
                })}

                {/* X Axis Labels */}
                {[3, 6, 12, 18, 24, 30, 36].map((m) => {
                  const x = svgCoordinates.getX(m);
                  return (
                    <g key={m}>
                      <text
                        x={x}
                        y={height - padding + 15}
                        fill="var(--text-muted)"
                        fontSize="9"
                        textAnchor="middle"
                        className="font-mono"
                      >
                        {m}m
                      </text>
                    </g>
                  );
                })}

                {/* The Rate Line */}
                <path
                  d={svgCoordinates.path}
                  fill="none"
                  stroke="url(#chart-gradient)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="transition-all duration-500 ease-out"
                />

                {/* Glow under the line */}
                <path
                  d={svgCoordinates.path}
                  fill="none"
                  stroke="var(--accent-primary)"
                  strokeWidth="6"
                  strokeOpacity="0.15"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="transition-all duration-500 ease-out"
                />

                {/* Current User Highlight Dot */}
                <circle
                  cx={svgCoordinates.currentX}
                  cy={svgCoordinates.currentY}
                  r="7"
                  fill="var(--accent-primary-light)"
                  stroke="var(--bg-primary)"
                  strokeWidth="2"
                  className="transition-all duration-300 ease-out shadow-lg shadow-indigo-500/50"
                />
                <circle
                  cx={svgCoordinates.currentX}
                  cy={svgCoordinates.currentY}
                  r="12"
                  fill="none"
                  stroke="var(--accent-primary-light)"
                  strokeWidth="1.5"
                  strokeOpacity="0.4"
                  className="animate-ping"
                  style={{ transformOrigin: `${svgCoordinates.currentX}px ${svgCoordinates.currentY}px` }}
                />

                {/* Gradients */}
                <defs>
                  <linearGradient id="chart-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="var(--error)" />
                    <stop offset="40%" stopColor="var(--warning)" />
                    <stop offset="80%" stopColor="var(--accent-secondary)" />
                    <stop offset="100%" stopColor="var(--success)" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <p className="text-[10px] text-center text-[var(--text-muted)] mt-2">
              Hover dot / move history slider to see rate changes on the curve.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
