"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type ToastType = "success" | "error" | "warning";

const SNACKBAR_DURATION_MS = 10000;

interface ToastMessage {
  id: number;
  type: ToastType;
  message: string;
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const timeoutsRef = useRef<Map<number, number>>(new Map());

  const dismissToast = useCallback((id: number) => {
    const timeout = timeoutsRef.current.get(id);
    if (timeout) {
      window.clearTimeout(timeout);
      timeoutsRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (type: ToastType, message: string) => {
      const id = Date.now() + Math.floor(Math.random() * 1000);
      setToasts((prev) => [...prev, { id, type, message }]);

      const timeout = window.setTimeout(() => {
        dismissToast(id);
      }, SNACKBAR_DURATION_MS);
      timeoutsRef.current.set(id, timeout);
    },
    [dismissToast]
  );

  return { toasts, showToast, dismissToast };
}

function snackbarStyles(type: ToastType): {
  container: string;
  close: string;
  progressTrack: string;
  progressBar: string;
} {
  switch (type) {
    case "success":
      return {
        container:
          "border border-green-800/20 bg-green-700 text-white shadow-[0_3px_5px_-1px_rgba(0,0,0,0.2),0_6px_10px_0_rgba(0,0,0,0.14)]",
        close: "text-white/80 hover:bg-white/10 hover:text-white",
        progressTrack: "bg-green-900/30",
        progressBar: "bg-green-950/70",
      };
    case "warning":
      return {
        container:
          "border border-red-900/25 bg-red-600 text-white shadow-[0_3px_5px_-1px_rgba(0,0,0,0.2),0_6px_10px_0_rgba(0,0,0,0.14)]",
        close: "text-white/80 hover:bg-white/10 hover:text-white",
        progressTrack: "bg-red-900/30",
        progressBar: "bg-red-950/70",
      };
    case "error":
      return {
        container:
          "border border-red-950/30 bg-red-700 text-white shadow-[0_3px_5px_-1px_rgba(0,0,0,0.2),0_6px_10px_0_rgba(0,0,0,0.14)]",
        close: "text-white/80 hover:bg-white/10 hover:text-white",
        progressTrack: "bg-red-950/35",
        progressBar: "bg-red-950/80",
      };
  }
}

function SnackbarIcon({ type }: { type: ToastType }) {
  const shared = "h-[22px] w-[22px] shrink-0";

  if (type === "success") {
    return (
      <svg viewBox="0 0 24 24" className={shared} aria-hidden>
        <circle cx="12" cy="12" r="10" fill="white" />
        <path
          d="M9 12.5l2 2 4-4.5"
          fill="none"
          stroke="#15803d"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (type === "warning") {
    return (
      <svg viewBox="0 0 24 24" className={shared} aria-hidden>
        <path
          fill="white"
          d="M12 2L1 21h22L12 2zm0 6c.55 0 1 .45 1 1v5c0 .55-.45 1-1 1s-1-.45-1-1V9c0-.55.45-1 1-1zm0 10c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className={shared} aria-hidden>
      <circle cx="12" cy="12" r="10" fill="white" />
      <path
        d="M8 8l8 8M16 8l-8 8"
        fill="none"
        stroke="#b91c1c"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ToastSnackbar({
  toast,
  onDismiss,
}: {
  toast: ToastMessage;
  onDismiss: (id: number) => void;
}) {
  const styles = snackbarStyles(toast.type);

  return (
    <div
      role="alert"
      className={`${styles.container} pointer-events-auto overflow-hidden rounded text-sm font-normal shadow-md`}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <SnackbarIcon type={toast.type} />
        <p className="min-w-0 flex-1 whitespace-pre-line leading-snug">{toast.message}</p>
        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          className={`flex-shrink-0 rounded p-0.5 text-lg leading-none transition-colors ${styles.close}`}
          aria-label="Close notification"
        >
          ×
        </button>
      </div>
      <div
        className={`h-1 w-full ${styles.progressTrack}`}
        aria-hidden
        role="presentation"
      >
        <div
          className={`h-full origin-left ${styles.progressBar}`}
          style={{
            animation: `toast-dismiss-progress ${SNACKBAR_DURATION_MS}ms linear forwards`,
          }}
        />
      </div>
    </div>
  );
}

export function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: ToastMessage[];
  onDismiss: (id: number) => void;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || toasts.length === 0) return null;

  return createPortal(
    <div className="pointer-events-none fixed right-5 top-16 z-[200] flex w-80 max-w-[calc(100vw-2.5rem)] flex-col gap-2">
      {toasts.map((toast) => (
        <ToastSnackbar key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>,
    document.body
  );
}
