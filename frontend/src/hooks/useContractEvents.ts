"use client";

import { useEffect, useRef } from "react";
import { rpc, scValToNative } from "@stellar/stellar-sdk";
import { getRpcServer } from "../lib/soroban-rpc";
import { useWallet } from "../context/WalletContext";
import {
  useNotifications,
  type ToastInput,
} from "../context/NotificationContext";

/** Polling cadence for Soroban getEvents, per the feature spec. */
export const EVENT_POLL_INTERVAL_MS = 10_000;

/** USDC has 7 decimals on Stellar (stroops). */
const STROOPS_PER_UNIT = BigInt(10_000_000);
const ONE_HUNDRED = BigInt(100);

function escrowContractId(): string {
  return process.env.NEXT_PUBLIC_ESCROW_CONTRACT_ID || "";
}

function lendingPoolContractId(): string {
  return process.env.NEXT_PUBLIC_LENDING_POOL_CONTRACT_ID || "";
}

/** Formats an i128 stroop amount (bigint) as a `$1,234.56` USDC string. */
function formatUsdc(stroops: unknown): string {
  let value: bigint;
  try {
    value = BigInt(stroops as bigint | number | string);
  } catch {
    return "$0.00";
  }
  const whole = value / STROOPS_PER_UNIT;
  const frac = value % STROOPS_PER_UNIT;
  const cents = (frac * ONE_HUNDRED) / STROOPS_PER_UNIT;
  const wholeStr = whole.toLocaleString("en-US");
  return `$${wholeStr}.${cents.toString().padStart(2, "0")}`;
}

/**
 * Maps a decoded contract event to a toast, or returns null when the event is
 * not relevant to the connected wallet. `data` is the decoded event value (the
 * published tuple), `name` is the first topic symbol.
 */
function buildToast(
  source: "escrow" | "pool",
  name: string,
  data: unknown[],
  wallet: string
): ToastInput | null {
  if (source === "escrow") {
    switch (name) {
      case "deposit": {
        // (borrower, amount, total_deposited)
        const [borrower, amount] = data;
        if (borrower !== wallet) return null;
        return {
          variant: "success",
          title: "Deposit confirmed",
          message: `Deposit of ${formatUsdc(amount)} confirmed`,
        };
      }
      case "release": {
        // (borrower, amount)
        const [borrower, amount] = data;
        if (borrower !== wallet) return null;
        return {
          variant: "success",
          title: "Savings released",
          message: `${formatUsdc(amount)} released from escrow`,
        };
      }
      case "withdraw": {
        // (borrower, refund, penalty)
        const [borrower, refund] = data;
        if (borrower !== wallet) return null;
        return {
          variant: "warning",
          title: "Early withdrawal processed",
          message: `${formatUsdc(refund)} returned to your wallet`,
        };
      }
      default:
        return null;
    }
  }

  // Lending pool events.
  switch (name) {
    case "loan_approved": {
      // (loan_id) — the event carries no borrower address, so this is shown to
      // the connected wallet on a best-effort basis.
      return {
        variant: "success",
        title: "Loan approved",
        message: "Your loan has been approved",
      };
    }
    case "disburse": {
      // (loan_id, recipient, amount)
      const [, recipient, amount] = data;
      if (recipient !== wallet) return null;
      return {
        variant: "success",
        title: "Disbursement received",
        message: `You received ${formatUsdc(amount)}`,
      };
    }
    case "repay": {
      // (borrower, loan_id, amount, remaining)
      const [borrower, , amount] = data;
      if (borrower !== wallet) return null;
      return {
        variant: "info",
        title: "Repayment recorded",
        message: `Repayment of ${formatUsdc(amount)} recorded`,
      };
    }
    case "deposit": {
      // Investor deposit into the pool: (investor, amount, total)
      const [investor, amount] = data;
      if (investor !== wallet) return null;
      return {
        variant: "success",
        title: "Investment confirmed",
        message: `Investment of ${formatUsdc(amount)} confirmed`,
      };
    }
    default:
      return null;
  }
}

/**
 * Polls Soroban RPC `getEvents` every 10 seconds while a wallet is connected,
 * filtering the escrow and lending-pool contracts and raising contextual toast
 * notifications for recognized events. Renders nothing — mount once at the root.
 */
export function useContractEvents() {
  const { publicKey, isConnected } = useWallet();
  const { notify } = useNotifications();

  // Cursor used for forward pagination so each event is only seen once.
  const cursorRef = useRef<string | null>(null);
  // Keep the latest notify in a ref so the polling effect need not re-subscribe.
  const notifyRef = useRef(notify);
  useEffect(() => {
    notifyRef.current = notify;
  }, [notify]);

  useEffect(() => {
    const escrowId = escrowContractId();
    const poolId = lendingPoolContractId();

    if (!isConnected || !publicKey) return;
    if (!escrowId && !poolId) return;

    const server = getRpcServer();
    const contractIds = [escrowId, poolId].filter(Boolean);
    let cancelled = false;
    cursorRef.current = null;

    async function poll() {
      try {
        let request: rpc.Api.GetEventsRequest;
        if (cursorRef.current) {
          request = {
            filters: [{ type: "contract", contractIds }],
            cursor: cursorRef.current,
            limit: 100,
          };
        } else {
          // First poll: start from the current ledger so we only surface new
          // events, not historical ones.
          const latest = await server.getLatestLedger();
          request = {
            filters: [{ type: "contract", contractIds }],
            startLedger: latest.sequence,
            limit: 100,
          };
        }

        const response = await server.getEvents(request);
        if (cancelled) return;
        cursorRef.current = response.cursor;

        for (const event of response.events) {
          const contractId = event.contractId?.toString();
          const source =
            contractId === escrowId
              ? "escrow"
              : contractId === poolId
              ? "pool"
              : null;
          if (!source) continue;

          let name: string;
          let data: unknown[];
          try {
            name = String(scValToNative(event.topic[0]));
            const decoded = scValToNative(event.value);
            data = Array.isArray(decoded) ? decoded : [decoded];
          } catch {
            continue;
          }

          const toast = buildToast(source, name, data, publicKey as string);
          if (toast) notifyRef.current(toast);
        }
      } catch (error) {
        // Network blips and out-of-range cursors should not break polling.
        console.warn("Contract event poll failed", error);
      }
    }

    poll();
    const interval = setInterval(poll, EVENT_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isConnected, publicKey]);
}

export default useContractEvents;
