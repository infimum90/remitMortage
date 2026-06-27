"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

export type ToastVariant = "success" | "info" | "warning" | "error";

export interface ToastNotification {
  id: string;
  variant: ToastVariant;
  title: string;
  /** Optional secondary line rendered under the title. */
  message?: string;
  /** Auto-dismiss delay in milliseconds. Defaults to 5000. */
  duration: number;
}

/** Input accepted by {@link NotificationContextType.notify}. */
export type ToastInput = Omit<ToastNotification, "id" | "duration"> & {
  id?: string;
  duration?: number;
};

type NotificationContextType = {
  notifications: ToastNotification[];
  notify: (input: ToastInput) => string;
  dismiss: (id: string) => void;
};

const NotificationContext = createContext<NotificationContextType | undefined>(
  undefined
);

const DEFAULT_DURATION_MS = 5000;
/** Maximum number of toasts shown at once; older ones drop off the stack. */
const MAX_VISIBLE = 3;

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<ToastNotification[]>([]);
  const counter = useRef(0);

  const dismiss = useCallback((id: string) => {
    setNotifications((current) => current.filter((n) => n.id !== id));
  }, []);

  const notify = useCallback((input: ToastInput) => {
    counter.current += 1;
    const id = input.id ?? `toast-${counter.current}`;
    const toast: ToastNotification = {
      id,
      variant: input.variant,
      title: input.title,
      message: input.message,
      duration: input.duration ?? DEFAULT_DURATION_MS,
    };

    setNotifications((current) => {
      // Replace an existing toast with the same explicit id, otherwise append.
      const withoutDup = current.filter((n) => n.id !== id);
      // Keep only the most recent MAX_VISIBLE toasts on screen.
      return [...withoutDup, toast].slice(-MAX_VISIBLE);
    });

    return id;
  }, []);

  const value = useMemo(
    () => ({ notifications, notify, dismiss }),
    [notifications, notify, dismiss]
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error("useNotifications must be used within NotificationProvider");
  }
  return ctx;
}

export default NotificationContext;
