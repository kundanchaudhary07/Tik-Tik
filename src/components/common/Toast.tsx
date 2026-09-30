// src/components/common/Toast.tsx
import React, { createContext, useContext, useState, useCallback } from "react";
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from "lucide-react";

export type ToastType = "success" | "error" | "info" | "warning";

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType, duration?: number) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = "success", duration: number = 4000) => {
      const id = Math.random().toString(36).substring(2, 9);
      setToasts((prev) => [...prev, { id, type, message, duration }]);

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }
    },
    [removeToast]
  );

  return (
    <ToastContext.Provider value={{ showToast, removeToast }}>
      {children}
      {/* Toast Notification Container */}
      <div
        className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full px-4 sm:px-0 pointer-events-none"
        aria-live="polite"
      >
        {toasts.map((toast) => {
          const isPrimary = toast.type === "success" || toast.type === "info";
          const isError = toast.type === "error";

          return (
            <div
              key={toast.id}
              className="pointer-events-auto flex items-start justify-between gap-3 p-3.5 rounded-xl border shadow-md text-sm transition-all"
              style={{
                backgroundColor: isPrimary
                  ? "var(--surface)"
                  : isError
                  ? "#fef2f2"
                  : "#fffbeb",
                borderColor: isPrimary
                  ? "var(--border)"
                  : isError
                  ? "#fecaca"
                  : "#fde68a",
                color: isPrimary
                  ? "var(--primary-dark)"
                  : isError
                  ? "#991b1b"
                  : "#92400e",
              }}
              role="alert"
            >
              <div className="flex items-start gap-2.5">
                {toast.type === "success" && (
                  <CheckCircle2 className="w-5 h-5 shrink-0" style={{ color: "var(--primary)" }} />
                )}
                {toast.type === "info" && (
                  <Info className="w-5 h-5 shrink-0" style={{ color: "var(--primary)" }} />
                )}
                {toast.type === "warning" && (
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                )}
                {toast.type === "error" && (
                  <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
                )}
                <span className="font-medium leading-tight pt-0.5">{toast.message}</span>
              </div>
              <button
                onClick={() => removeToast(toast.id)}
                className="p-0.5 rounded transition-colors"
                style={{ color: "var(--text-muted)" }}
                aria-label="Dismiss notification"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
};
