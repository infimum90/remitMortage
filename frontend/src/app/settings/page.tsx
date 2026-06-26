"use client";

import dynamic from "next/dynamic";
import { FormEvent, useMemo, useState } from "react";

const Navbar = dynamic(() => import("../../components/Navbar"), { ssr: false });

type SettingsTab = "profile" | "wallets" | "notifications" | "contractor";

type NotificationKey = "paymentDue" | "milestoneUpdates" | "loanApproval";

type FreighterModule = {
  isConnected?: () => boolean | Promise<boolean>;
  requestAccess?: () => void | Promise<void>;
  getPublicKey?: () => string | Promise<string>;
};

const tabs: { id: SettingsTab; label: string }[] = [
  { id: "profile", label: "Profile" },
  { id: "wallets", label: "Wallets" },
  { id: "notifications", label: "Notifications" },
  { id: "contractor", label: "Developer/Contractor" },
];

const notificationLabels: Record<NotificationKey, string> = {
  paymentDue: "Payment due",
  milestoneUpdates: "Milestone updates",
  loanApproval: "Loan approval",
};

const verifiedWallets = [
  {
    chain: "Ethereum",
    address: "0x71C7656EC7ab88b098defB751B7401B5f6d8976F",
    verifiedAt: "Remittance sender verified",
  },
  {
    chain: "Solana",
    address: "9xQeWvG816bUx9EPjHmaT23yvVM2ZWjbQyPB3GzAykSF",
    verifiedAt: "Remittance sender verified",
  },
  {
    chain: "Base",
    address: "0x4f3A9b9251C2d8B490C3C314478E9465a33c8A21",
    verifiedAt: "Remittance sender verified",
  },
];

function shortenAddress(address: string) {
  if (address.length <= 16) return address;
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidWebhookUrl(webhookUrl: string) {
  if (!webhookUrl.trim()) return true;

  try {
    const url = new URL(webhookUrl);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

async function readFreighterPublicKey() {
  const freighter = (await import("@stellar/freighter-api")) as FreighterModule;

  if (typeof freighter.isConnected === "function" && !(await freighter.isConnected())) {
    throw new Error("Freighter is not available or not connected.");
  }

  if (typeof freighter.requestAccess === "function") {
    await freighter.requestAccess();
  }

  if (typeof freighter.getPublicKey === "function") {
    return freighter.getPublicKey();
  }

  throw new Error("Freighter public key API is unavailable.");
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");
  const [displayName, setDisplayName] = useState("Ada Remit");
  const [email, setEmail] = useState("ada@example.com");
  const [stellarAddress, setStellarAddress] = useState("");
  const [notifications, setNotifications] = useState<Record<NotificationKey, boolean>>({
    paymentDue: true,
    milestoneUpdates: true,
    loanApproval: false,
  });
  const [webhookUrl, setWebhookUrl] = useState("https://partner.example.com/remitmortgage/webhook");
  const [businessName, setBusinessName] = useState("Keystone Build Partners");
  const [registrationNumber, setRegistrationNumber] = useState("NG-RC-204918");
  const [serviceRegion, setServiceRegion] = useState("Lagos, Nigeria");
  const [walletMessage, setWalletMessage] = useState("");
  const [webhookStatus, setWebhookStatus] = useState("");
  const [saveStatus, setSaveStatus] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const emailError = email && !isValidEmail(email) ? "Enter a valid linked email address." : "";
  const webhookError =
    webhookUrl && !isValidWebhookUrl(webhookUrl) ? "Webhook URL must start with http:// or https://." : "";
  const canSave = isValidEmail(email) && isValidWebhookUrl(webhookUrl);

  const enabledNotificationCount = useMemo(
    () => Object.values(notifications).filter(Boolean).length,
    [notifications]
  );

  async function connectStellarWallet() {
    setWalletMessage("Connecting to Freighter...");

    try {
      const publicKey = await readFreighterPublicKey();
      setStellarAddress(publicKey);
      setWalletMessage("Stellar wallet connected.");
    } catch (error) {
      setWalletMessage(error instanceof Error ? error.message : "Unable to connect Freighter.");
    }
  }

  async function checkWebhookAccessibility() {
    if (!webhookUrl.trim()) {
      setWebhookStatus("Webhook URL is optional.");
      return;
    }

    if (!isValidWebhookUrl(webhookUrl)) {
      setWebhookStatus("Webhook URL format is invalid.");
      return;
    }

    setWebhookStatus("Checking webhook endpoint...");

    try {
      await fetch(webhookUrl, { method: "HEAD", mode: "no-cors" });
      setWebhookStatus("Webhook URL format is valid and the endpoint accepted a reachability check.");
    } catch {
      setWebhookStatus("Webhook URL format is valid, but the endpoint could not be reached from this browser.");
    }
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveStatus("");

    if (!canSave) {
      setSaveStatus("Fix the highlighted fields before saving.");
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch("/api/user/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: stellarAddress || email,
          profile: { displayName, email },
          notifications: { ...notifications, webhookUrl },
          contractor: { businessName, registrationNumber, serviceRegion },
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Settings could not be saved.");
      }

      setSaveStatus("Settings saved successfully.");
    } catch (error) {
      setSaveStatus(error instanceof Error ? error.message : "Settings could not be saved.");
    } finally {
      setIsSaving(false);
    }
  }

  function toggleNotification(key: NotificationKey) {
    setNotifications((current) => ({ ...current, [key]: !current[key] }));
  }

  return (
    <main className="min-h-screen bg-[var(--bg-primary)]">
      <Navbar />

      <section className="pt-24 pb-16 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="mb-8">
            <p className="text-sm font-semibold uppercase text-[var(--accent-secondary)]">Account control center</p>
            <h1 className="text-3xl md:text-4xl font-bold mt-2">User Settings</h1>
            <p className="text-[var(--text-secondary)] mt-3 max-w-2xl">
              Manage profile details, verified sending wallets, notification endpoints, and contractor registration data.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
            <aside className="glass-card p-3 h-fit">
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-1 gap-2" role="tablist" aria-label="Settings tabs">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`text-left px-4 py-3 rounded-lg text-sm font-semibold transition-colors ${
                      activeTab === tab.id
                        ? "bg-[var(--accent-primary)] text-white"
                        : "text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </aside>

            <form onSubmit={saveSettings} className="glass-card p-6 md:p-8">
              {activeTab === "profile" && (
                <section role="tabpanel" aria-label="Profile settings" className="space-y-6">
                  <div>
                    <h2 className="text-2xl font-semibold">Profile</h2>
                    <p className="text-[var(--text-secondary)] mt-2">Keep the borrower profile and linked email current.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <label className="space-y-2">
                      <span className="text-sm text-[var(--text-muted)]">Display name</span>
                      <input
                        value={displayName}
                        onChange={(event) => setDisplayName(event.target.value)}
                        className="w-full p-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)]"
                      />
                    </label>

                    <label className="space-y-2">
                      <span className="text-sm text-[var(--text-muted)]">Linked email address</span>
                      <input
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        className="w-full p-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)]"
                      />
                      {emailError && <span className="text-sm text-red-300">{emailError}</span>}
                    </label>
                  </div>
                </section>
              )}

              {activeTab === "wallets" && (
                <section role="tabpanel" aria-label="Wallet settings" className="space-y-6">
                  <div>
                    <h2 className="text-2xl font-semibold">Wallets</h2>
                    <p className="text-[var(--text-secondary)] mt-2">
                      View the active Stellar wallet and verified remittance sending wallets.
                    </p>
                  </div>

                  <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                      <div>
                        <p className="text-sm text-[var(--text-muted)]">Connected Stellar address</p>
                        <p className="font-mono break-all mt-1">{stellarAddress || "No Stellar wallet connected"}</p>
                      </div>
                      <button type="button" onClick={connectStellarWallet} className="btn-primary !py-3 !px-5">
                        Connect Freighter
                      </button>
                    </div>
                    {walletMessage && <p className="text-sm text-[var(--text-secondary)] mt-4">{walletMessage}</p>}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {verifiedWallets.map((wallet) => (
                      <article key={`${wallet.chain}-${wallet.address}`} className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
                        <span className="inline-flex rounded-full bg-cyan-500/10 px-3 py-1 text-xs font-bold text-cyan-200">
                          {wallet.chain}
                        </span>
                        <p className="font-mono text-sm break-all mt-4" title={wallet.address}>
                          {shortenAddress(wallet.address)}
                        </p>
                        <p className="text-sm text-[var(--success)] mt-3">{wallet.verifiedAt}</p>
                      </article>
                    ))}
                  </div>
                </section>
              )}

              {activeTab === "notifications" && (
                <section role="tabpanel" aria-label="Notification settings" className="space-y-6">
                  <div>
                    <h2 className="text-2xl font-semibold">Notifications</h2>
                    <p className="text-[var(--text-secondary)] mt-2">
                      Choose email notifications and configure a partner webhook endpoint.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {(Object.keys(notificationLabels) as NotificationKey[]).map((key) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => toggleNotification(key)}
                        aria-pressed={notifications[key]}
                        className={`rounded-lg border p-5 text-left transition-colors ${
                          notifications[key]
                            ? "border-[var(--accent-primary)] bg-indigo-500/10"
                            : "border-[var(--border-color)] bg-[var(--bg-card)]"
                        }`}
                      >
                        <span className="block text-sm text-[var(--text-muted)]">Email toggle</span>
                        <span className="block text-lg font-semibold mt-1">{notificationLabels[key]}</span>
                        <span className="block text-sm mt-3 text-[var(--text-secondary)]">
                          {notifications[key] ? "Enabled" : "Disabled"}
                        </span>
                      </button>
                    ))}
                  </div>

                  <label className="block space-y-2">
                    <span className="text-sm text-[var(--text-muted)]">Partner webhook URL</span>
                    <div className="flex flex-col md:flex-row gap-3">
                      <input
                        value={webhookUrl}
                        onChange={(event) => {
                          setWebhookUrl(event.target.value);
                          setWebhookStatus("");
                        }}
                        placeholder="https://partner.example.com/webhook"
                        className="w-full p-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)]"
                      />
                      <button type="button" onClick={checkWebhookAccessibility} className="btn-outline !py-3 !px-5">
                        Check URL
                      </button>
                    </div>
                    {webhookError && <span className="text-sm text-red-300">{webhookError}</span>}
                    {webhookStatus && <span className="block text-sm text-[var(--text-secondary)]">{webhookStatus}</span>}
                  </label>

                  <p className="text-sm text-[var(--text-muted)]">
                    {enabledNotificationCount} of 3 email notification types are enabled.
                  </p>
                </section>
              )}

              {activeTab === "contractor" && (
                <section role="tabpanel" aria-label="Developer and contractor settings" className="space-y-6">
                  <div>
                    <h2 className="text-2xl font-semibold">Developer/Contractor</h2>
                    <p className="text-[var(--text-secondary)] mt-2">
                      Review whitelist status and registration details for supplier disbursements.
                    </p>
                  </div>

                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-5">
                    <p className="text-sm text-emerald-200">Whitelist status</p>
                    <p className="text-xl font-semibold mt-1">Approved contractor</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    <label className="space-y-2">
                      <span className="text-sm text-[var(--text-muted)]">Registered business name</span>
                      <input
                        value={businessName}
                        onChange={(event) => setBusinessName(event.target.value)}
                        className="w-full p-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)]"
                      />
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm text-[var(--text-muted)]">Registration number</span>
                      <input
                        value={registrationNumber}
                        onChange={(event) => setRegistrationNumber(event.target.value)}
                        className="w-full p-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)]"
                      />
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm text-[var(--text-muted)]">Service region</span>
                      <input
                        value={serviceRegion}
                        onChange={(event) => setServiceRegion(event.target.value)}
                        className="w-full p-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)]"
                      />
                    </label>
                  </div>
                </section>
              )}

              <div className="mt-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-t border-[var(--border-color)] pt-6">
                <p className="text-sm text-[var(--text-secondary)]">{saveStatus || "Changes save to POST /api/user/settings."}</p>
                <button type="submit" disabled={!canSave || isSaving} className="btn-primary disabled:opacity-60 disabled:cursor-not-allowed">
                  {isSaving ? "Saving..." : "Save Settings"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}
