"use client";

import { ToastContainer } from "./Toast";
import { useContractEvents } from "../hooks/useContractEvents";

/**
 * Mounts the toast stack and starts the Soroban event poller. Render once near
 * the app root, inside both WalletProvider and NotificationProvider.
 */
export function NotificationLayer() {
  useContractEvents();
  return <ToastContainer />;
}

export default NotificationLayer;
