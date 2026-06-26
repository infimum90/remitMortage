import type { Metadata } from "next";
import { WalletProvider } from "../context/WalletContext";
import "./globals.css";
import { ThemeProvider } from "@/context/ThemeContext";

export const metadata: Metadata = {
  title: "RemitMortgage — Remittance-Backed Property Financing on Stellar",
  description:
    "Turn your verified remittance history into a pathway to homeownership. Save, borrow, and build — all settled in USDC on the Stellar network.",
  keywords: [
    "remittance",
    "mortgage",
    "Stellar",
    "Soroban",
    "USDC",
    "DeFi",
    "property financing",
    "diaspora",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable}`}>
      <body className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] font-[var(--font-inter)] antialiased">
        <ThemeProvider>{children}</ThemeProvider>
        <WalletProvider>
          {children}
        </WalletProvider>
      </body>
    </html>
  );
}
