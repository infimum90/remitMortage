import Link from "next/link";
import dynamic from "next/dynamic";

const Navbar = dynamic(() => import("../components/Navbar"), { ssr: false });

const STATS = [
  { label: "Average Remittance Tracked", value: "$2,400", suffix: "/yr" },
  { label: "Settlement Finality", value: "3-5", suffix: "sec" },
  { label: "Transaction Fees", value: "<$0.01", suffix: "" },
  { label: "Down Payment Target", value: "30", suffix: "%" },
];

const STEPS = [
  {
    number: "01",
    title: "Verify Your History",
    description:
      "Connect your Stellar wallet and prove your remittance-sending history. Our verification engine analyzes your outgoing USDC payments for consistency, frequency, and duration.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
        <path d="M9 12l2 2 4-4" />
        <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
      </svg>
    ),
  },
  {
    number: "02",
    title: "Save 30% Down Payment",
    description:
      "Contribute USDC monthly into the Soroban escrow contract over 6–12 months. Your pooled savings earn passive yield while you build toward the target.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
        <path d="M19 5h-14a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z" />
        <path d="M16 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
        <path d="M3 10h18" />
      </svg>
    ),
  },
  {
    number: "03",
    title: "Get 70% Financed",
    description:
      "Once your savings target is met, the lending pool finances the remaining 70%. Funds are disbursed in milestone-based tranches to vetted contractors.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
        <path d="M3 21h18" />
        <path d="M5 21V7l7-4 7 4v14" />
        <path d="M9 21v-6h6v6" />
        <path d="M10 9h4" />
        <path d="M10 13h4" />
      </svg>
    ),
  },
  {
    number: "04",
    title: "Build & Repay",
    description:
      "Construction milestones are verified with IPFS evidence and multisig governance. Repay the 70% loan over time in USDC — settling instantly on Stellar.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <path d="M22 4L12 14.01l-3-3" />
      </svg>
    ),
  },
];

const FEATURES = [
  {
    title: "Escrow Savings",
    description: "USDC contributions tracked on-chain with early withdrawal penalties and automatic target detection.",
    gradient: "from-indigo-500 to-purple-500",
  },
  {
    title: "Lending Pool",
    description: "Investor capital deposits, loan approvals, milestone disbursement, and repayment with simple interest.",
    gradient: "from-cyan-500 to-blue-500",
  },
  {
    title: "Milestone Verification",
    description: "IPFS-hashed photo/video evidence of construction progress, reviewed by multisig governance.",
    gradient: "from-emerald-500 to-teal-500",
  },
  {
    title: "Stablecoin Settlement",
    description: "Every transaction — deposits, disbursements, repayments — settles in USDC with sub-cent fees.",
    gradient: "from-amber-500 to-orange-500",
  },
  {
    title: "Remittance Scoring",
    description: "Stellar Horizon analysis of outgoing payment patterns — frequency, consistency, and duration.",
    gradient: "from-rose-500 to-pink-500",
  },
  {
    title: "Yield on Savings",
    description: "Pooled escrow funds can be routed into Soroban lending protocols to earn passive yield.",
    gradient: "from-violet-500 to-fuchsia-500",
  },
];

export default function LandingPage() {
  return (
    <main>
      {/* ── Navbar ──────────────────────────────────────────── */}
      <Navbar />

      {/* ── Hero Section ───────────────────────────────────── */}
      <section className="hero-bg relative pt-32 pb-24 px-6 min-h-[90vh] flex items-center">
        <div className="max-w-7xl mx-auto w-full grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <div className="animate-fade-in-up inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-[var(--border-color)] bg-[var(--bg-card)] text-sm text-[var(--text-secondary)] mb-8">
              <span className="w-2 h-2 rounded-full bg-[var(--success)] animate-pulse" />
              Built on Stellar &middot; Soroban Smart Contracts
            </div>

            <h1 className="animate-fade-in-up-delay-1 text-5xl md:text-6xl lg:text-7xl font-extrabold leading-[1.05] tracking-tight mb-6">
              Your Remittances.{" "}
              <span className="gradient-text">Your Home.</span>
            </h1>

            <p className="animate-fade-in-up-delay-2 text-lg md:text-xl text-[var(--text-secondary)] max-w-xl mb-10 leading-relaxed">
              Turn years of consistent remittance-sending into a verified pathway to property ownership. Save, borrow, build — all settled in USDC on Stellar.
            </p>

            <div className="animate-fade-in-up-delay-3 flex flex-wrap gap-4">
              <button className="btn-primary">
                Get Started
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
              <a href="#how-it-works" className="btn-outline">
                Learn More
              </a>
            </div>
          </div>

          {/* Hero Visual */}
          <div className="hidden lg:flex justify-center relative">
            <div className="relative w-80 h-80">
              {/* Floating card 1 */}
              <div className="animate-float glass-card absolute top-0 left-0 p-5 w-56">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/20 to-cyan-500/20 flex items-center justify-center text-[var(--accent-primary-light)]">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
                      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--text-muted)]">Escrow Balance</p>
                    <p className="text-lg font-bold">$8,400</p>
                  </div>
                </div>
                <div className="w-full bg-[var(--bg-primary)] rounded-full h-2">
                  <div className="bg-gradient-to-r from-indigo-500 to-cyan-500 h-2 rounded-full" style={{ width: "84%" }} />
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-1.5">84% of $10,000 target</p>
              </div>

              {/* Floating card 2 */}
              <div className="animate-float-delay glass-card absolute bottom-4 right-0 p-5 w-60">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center text-[var(--success)]">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M22 4L12 14.01l-3-3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--text-muted)]">Verification</p>
                    <p className="text-sm font-semibold text-[var(--success)]">Eligible ✓</p>
                  </div>
                </div>
                <p className="text-xs text-[var(--text-secondary)]">42 payments &middot; 18 months &middot; $200 avg</p>
              </div>

              {/* Floating card 3 */}
              <div className="animate-float glass-card absolute top-1/2 -translate-y-1/2 right-8 p-4 w-48" style={{ animationDelay: "1s" }}>
                <p className="text-xs text-[var(--text-muted)] mb-1">Milestone 3/5</p>
                <p className="text-sm font-semibold mb-2">Roofing Complete</p>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= 3 ? "bg-[var(--accent-primary)]" : "bg-[var(--bg-primary)]"}`} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats Bar ──────────────────────────────────────── */}
      <section id="stats" className="border-y border-[var(--border-color)] bg-[var(--bg-secondary)]">
        <div className="max-w-7xl mx-auto px-6 py-12 grid grid-cols-2 md:grid-cols-4 gap-8">
          {STATS.map((stat) => (
            <div key={stat.label} className="text-center">
              <p className="stat-value gradient-text">
                {stat.value}
                <span className="text-lg text-[var(--text-secondary)]">{stat.suffix}</span>
              </p>
              <p className="text-sm text-[var(--text-muted)] mt-2">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How It Works ───────────────────────────────────── */}
      <section id="how-it-works" className="py-24 px-6 dot-grid">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <div className="section-divider" />
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              How It Works
            </h2>
            <p className="text-[var(--text-secondary)] max-w-2xl mx-auto text-lg">
              From remittance verification to homeownership — four on-chain steps.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {STEPS.map((step) => (
              <div key={step.number} className="glass-card p-6 relative group">
                <span className="absolute top-4 right-4 text-5xl font-black text-[var(--accent-primary)]/[0.06] select-none">
                  {step.number}
                </span>
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[var(--accent-primary)]/20 to-[var(--accent-secondary)]/10 flex items-center justify-center text-[var(--accent-primary-light)] mb-5">
                  {step.icon}
                </div>
                <h3 className="text-lg font-semibold mb-2">{step.title}</h3>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features Grid ──────────────────────────────────── */}
      <section id="features" className="py-24 px-6 bg-[var(--bg-secondary)]">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <div className="section-divider" />
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Protocol Features
            </h2>
            <p className="text-[var(--text-secondary)] max-w-2xl mx-auto text-lg">
              Everything you need to go from remittance sender to property owner.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="glass-card p-6 group">
                <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${feature.gradient} opacity-80 mb-4 flex items-center justify-center`}>
                  <div className="w-3 h-3 bg-white/30 rounded-sm" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Section ────────────────────────────────────── */}
      <section className="py-24 px-6 hero-bg">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl md:text-5xl font-bold mb-6">
            Ready to Build Your <span className="gradient-text">Future?</span>
          </h2>
          <p className="text-lg text-[var(--text-secondary)] mb-10 max-w-xl mx-auto">
            Connect your Stellar wallet and let your remittance history open the door to homeownership.
          </p>
          <div className="flex justify-center gap-4 flex-wrap">
            <button className="btn-primary">
              Launch App
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
            <Link href="https://github.com/AstronLabs/RemitMortgage" className="btn-outline" target="_blank">
              View on GitHub
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────── */}
      <footer className="border-t border-[var(--border-color)] bg-[var(--bg-secondary)]">
        <div className="max-w-7xl mx-auto px-6 py-12">
          <div className="grid md:grid-cols-3 gap-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center">
                  <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" className="w-3.5 h-3.5">
                    <path d="M3 21h18" />
                    <path d="M5 21V7l7-4 7 4v14" />
                  </svg>
                </div>
                <span className="font-bold">RemitMortgage</span>
              </div>
              <p className="text-sm text-[var(--text-muted)] max-w-xs">
                Remittance-backed property financing on the Stellar network.
              </p>
            </div>
            <div>
              <h4 className="text-sm font-semibold mb-4">Protocol</h4>
              <div className="flex flex-col gap-2 text-sm text-[var(--text-muted)]">
                <a href="#how-it-works" className="hover:text-[var(--text-primary)] transition-colors">How It Works</a>
                <a href="#features" className="hover:text-[var(--text-primary)] transition-colors">Features</a>
                <a href="#stats" className="hover:text-[var(--text-primary)] transition-colors">Stats</a>
              </div>
            </div>
            <div>
              <h4 className="text-sm font-semibold mb-4">Developers</h4>
              <div className="flex flex-col gap-2 text-sm text-[var(--text-muted)]">
                <Link href="https://github.com/AstronLabs/RemitMortgage" target="_blank" className="hover:text-[var(--text-primary)] transition-colors">GitHub</Link>
                <span className="hover:text-[var(--text-primary)] transition-colors cursor-pointer">Documentation</span>
                <span className="hover:text-[var(--text-primary)] transition-colors cursor-pointer">Contributing</span>
              </div>
            </div>
          </div>
          <div className="border-t border-[var(--border-color)] mt-10 pt-6 text-center text-xs text-[var(--text-muted)]">
            © {new Date().getFullYear()} RemitMortgage. Built on Stellar. MIT License.
          </div>
        </div>
      </footer>
    </main>
  );
}
