"use client";

import React, { useState } from "react";
import EvidenceUpload from "./EvidenceUpload";
import MilestoneTracker, { Stage } from "./MilestoneTracker";

interface MilestoneProps {
  id: string;
  name: string;
  initialStage: Stage;
}

export default function MilestoneCard({ id, name, initialStage }: MilestoneProps) {
  const [stage, setStage] = useState<Stage>(initialStage);
  const [cid, setCid] = useState<string | null>(null);

  const handleUploadSuccess = (uploadedCid: string) => {
    setCid(uploadedCid);
  };

  const handleRequestDisbursement = () => {
    if (!cid) return;
    
    // Placeholder action for future contract integration
    alert(`Requested disbursement for ${name} using evidence CID: ${cid}`);
    setStage("Proposed"); // Optimistically advance stage to Proposed
  };

  return (
    <div className="p-6 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl hover:border-[var(--border-glow)] hover:shadow-[var(--shadow-glow)] transition-all group">
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-lg font-bold text-[var(--text-primary)]">{name}</h3>
        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
          stage === "Pending" ? "bg-amber-500/20 text-amber-500 border border-amber-500/30" :
          stage === "Proposed" ? "bg-blue-500/20 text-blue-500 border border-blue-500/30" :
          stage === "Approved" ? "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30" :
          "bg-emerald-500/20 text-emerald-500 border border-emerald-500/30"
        }`}>
          {stage}
        </span>
      </div>

      <div className="mb-6">
        <MilestoneTracker currentStage={stage} />
      </div>

      {stage === "Pending" && (
        <>
          <EvidenceUpload milestoneId={id} onUploadSuccess={handleUploadSuccess} />
          <button
            onClick={handleRequestDisbursement}
            disabled={!cid}
            className={`mt-4 w-full py-3 rounded-full font-bold transition-all flex items-center justify-center gap-2 ${
              cid 
                ? 'bg-[var(--accent-primary)] text-white hover:bg-[var(--accent-primary-light)] shadow-lg hover:shadow-[var(--shadow-glow)]' 
                : 'bg-[var(--bg-primary)] text-[var(--text-muted)] border border-[var(--border-color)] cursor-not-allowed'
            }`}
          >
            Request Disbursement
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </>
      )}

      {stage !== "Pending" && (
        <div className="mt-4 p-4 bg-[var(--bg-primary)] rounded-md border border-[var(--border-color)]">
          <p className="text-sm text-[var(--text-secondary)] mb-2">Evidence Status: <span className="text-[var(--success)] font-semibold">Submitted</span></p>
          {cid && (
            <div className="text-xs text-[var(--text-muted)] break-all mb-1">
              CID: {cid}
            </div>
          )}
          <p className="text-xs text-[var(--text-muted)]">
            Awaiting governance approval for disbursement.
          </p>
        </div>
      )}
    </div>
  );
}
