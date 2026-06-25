"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import OnboardingWizard from "./OnboardingWizard";
import CreditCalculator from "@/components/CreditCalculator";

const Navbar = dynamic(() => import("../components/Navbar"), { ssr: false });

export default function OnboardingPage() {
  const [activeTab, setActiveTab] = useState<"calculator" | "onboarding">("calculator");

  return (
    <main className="hero-bg dot-grid min-h-screen">
      <Navbar />
      <section className="pt-28 pb-24 px-4 md:px-6">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-10 animate-fade-in-up">
            <h1 className="text-4xl md:text-5xl font-extrabold mb-4 tracking-tight">
              Remit<span className="gradient-text">Mortgage</span>
            </h1>
            <p className="text-[var(--text-secondary)] max-w-xl mx-auto text-sm md:text-base">
              Convert your remittance payment history into credit reputation on the Stellar network to unlock decentralized, low-interest mortgages.
            </p>
          </div>

          {/* Tab Selection buttons */}
          <div className="flex justify-center mb-10 animate-fade-in-up">
            <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] p-1.5 rounded-full flex gap-2">
              <button
                onClick={() => setActiveTab("calculator")}
                className={`px-6 py-2.5 rounded-full text-sm font-semibold transition-all duration-300 ${
                  activeTab === "calculator"
                    ? "bg-[var(--accent-primary)] text-white shadow-lg shadow-indigo-500/20"
                    : "text-[var(--text-secondary)] hover:text-white"
                }`}
              >
                📊 Calculate Eligibility
              </button>
              <button
                onClick={() => setActiveTab("onboarding")}
                className={`px-6 py-2.5 rounded-full text-sm font-semibold transition-all duration-300 ${
                  activeTab === "onboarding"
                    ? "bg-[var(--accent-primary)] text-white shadow-lg shadow-indigo-500/20"
                    : "text-[var(--text-secondary)] hover:text-white"
                }`}
              >
                🚀 Start Onboarding
              </button>
            </div>
          </div>

          {/* Active Tab rendering */}
          <div className="transition-all duration-500 ease-in-out">
            {activeTab === "calculator" ? (
              <div className="max-w-4xl mx-auto">
                <CreditCalculator />
              </div>
            ) : (
              <div className="max-w-3xl mx-auto">
                <div className="text-center mb-8">
                  <h2 className="text-2xl font-bold">Onboarding Wizard</h2>
                  <p className="text-sm text-[var(--text-secondary)] mt-1">
                    Connect Freighter wallet and verify your Stellar remittance address.
                  </p>
                </div>
                <OnboardingWizard />
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
