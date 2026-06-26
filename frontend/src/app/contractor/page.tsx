"use client";

import React from "react";
import dynamic from "next/dynamic";

const Navbar = dynamic(() => import("../../components/Navbar"), { ssr: false });
const MilestoneCard = dynamic(() => import("../../components/MilestoneCard"), { ssr: false });

// Mock data for initial assignment
const MILESTONES = [
  { id: "m1", name: "Foundation", initialStage: "Pending" as const },
  { id: "m2", name: "Structure", initialStage: "Pending" as const },
  { id: "m3", name: "Roofing", initialStage: "Pending" as const },
  { id: "m4", name: "Finishing", initialStage: "Pending" as const },
];

export default function ContractorDashboard() {
  return (
    <main className="min-h-screen bg-[var(--bg-primary)]">
      <Navbar />

      <div className="pt-24 pb-12 px-6 max-w-7xl mx-auto">
        <div className="mb-10">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">Contractor Portal</h1>
          <p className="text-[var(--text-secondary)]">Manage your assigned milestones, submit construction evidence, and request disbursements.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 gap-6">
          {MILESTONES.map((milestone) => (
            <MilestoneCard 
              key={milestone.id}
              id={milestone.id}
              name={milestone.name}
              initialStage={milestone.initialStage}
            />
          ))}
        </div>
      </div>
    </main>
  );
}
