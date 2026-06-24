"use client"

import dynamic from "next/dynamic";
import OnboardingWizard from "./OnboardingWizard";

const Navbar = dynamic(() => import("../components/Navbar"), { ssr: false });

export default function OnboardingPage() {
  return (
    <main>
      <Navbar />
      <section className="pt-24 pb-24 px-6">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold mb-4">Onboarding</h1>
            <p className="text-[var(--text-secondary)]">Follow the steps below to get started with RemitMortgage.</p>
          </div>
          <OnboardingWizard />
        </div>
      </section>
    </main>
  );
}