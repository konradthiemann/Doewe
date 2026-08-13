"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { cn } from "../../lib/cn";
import { useI18n } from "../../lib/i18n";

/**
 * App-wide toast notifications. Rendered into a fixed-position portal at the top
 * of the viewport, so showing/hiding a toast never reflows page content (no layout
 * shift). Use for transient success/error feedback after an async action.
 *
 * Usage:
 *   const toast = useToast();
 *   toast.success(t("transactionForm.saved"));
 *   toast.error(message);
 */

export type ToastVariant = "success" | "error" | "info";

type ToastItem = {
  id: number;
  message: string;
  variant: ToastVariant;
};

type ToastContextValue = {
  show: (message: string, variant?: ToastVariant) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const DURATION_MS: Record<ToastVariant, number> = {
  success: 4000,
  info: 4000,
  error: 6000,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const show = useCallback(
    (message: string, variant: ToastVariant = "success") => {
      const id = (idRef.current += 1);
      setToasts((current) => [...current, { id, message, variant }]);
      const timer = setTimeout(() => dismiss(id), DURATION_MS[variant]);
      timers.current.set(id, timer);
    },
    [dismiss]
  );

  const success = useCallback((message: string) => show(message, "success"), [show]);
  const error = useCallback((message: string) => show(message, "error"), [show]);
  const info = useCallback((message: string) => show(message, "info"), [show]);

  // Clear any pending timers if the provider unmounts.
  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((timer) => clearTimeout(timer));
      map.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({ show, success, error, info, dismiss }),
    [show, success, error, info, dismiss]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
}

function ToastViewport({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: number) => void }) {
  const { t } = useI18n();

  // A `position: fixed` overlay is positioned relative to the viewport regardless
  // of where it sits in the tree — no portal needed, since the app's providers add
  // no transform/overflow/filter ancestor that would trap it.
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-4 z-toast flex flex-col items-center gap-2 px-4"
      aria-label={t("common.notifications")}
    >
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

const variantStyles: Record<ToastVariant, string> = {
  success: "border-success/25 bg-success-soft text-success",
  error: "border-danger/25 bg-danger-soft text-danger",
  info: "border-info/25 bg-info-soft text-info",
};

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: number) => void }) {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);
  const isError = toast.variant === "error";

  // Mount-based enter transition (fade + slide down). tailwindcss-animate is not
  // installed, so we animate with a plain state-toggled CSS transition.
  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      className={cn(
        "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border p-4 text-sm shadow-lg backdrop-blur",
        "transition duration-300 ease-out motion-reduce:transition-none",
        visible ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0",
        variantStyles[toast.variant]
      )}
    >
      <ToastIcon variant={toast.variant} />
      <p className="flex-1 pt-0.5">{toast.message}</p>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label={t("common.close")}
        className="-mr-1 -mt-1 shrink-0 rounded p-1 text-lg leading-none opacity-70 transition hover:opacity-100 focus:outline-none focus-visible:ring focus-visible:ring-current"
      >
        ×
      </button>
    </div>
  );
}

function ToastIcon({ variant }: { variant: ToastVariant }) {
  const common = "h-5 w-5 shrink-0";
  if (variant === "error") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={common}>
        <circle cx="12" cy="12" r="9" />
        <path strokeLinecap="round" d="M12 7.5v5m0 3.5h.01" />
      </svg>
    );
  }
  if (variant === "info") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={common}>
        <circle cx="12" cy="12" r="9" />
        <path strokeLinecap="round" d="M12 11v5m0-8.5h.01" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={common}>
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" strokeLinejoin="round" d="m8.5 12.5 2.5 2.5 4.5-5" />
    </svg>
  );
}
