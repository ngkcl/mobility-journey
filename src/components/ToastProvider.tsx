'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle, Info } from 'lucide-react';

export type ToastTone = 'error' | 'success' | 'info';

type Toast = {
  id: string;
  message: string;
  tone: ToastTone;
};

type ToastContextValue = {
  pushToast: (message: string, tone?: ToastTone) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const toneStyles: Record<ToastTone, { icon: typeof AlertTriangle; className: string }> = {
  error: {
    icon: AlertTriangle,
    className: 'border-red-500/40 bg-red-500/15 text-red-200',
  },
  success: {
    icon: CheckCircle,
    className: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200',
  },
  info: {
    icon: Info,
    className: 'border-blue-500/40 bg-blue-500/15 text-blue-100',
  },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const pushToast = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message, tone }]);

    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 4200);
  }, []);

  const value = useMemo(() => ({ pushToast }), [pushToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-6 top-6 z-50 flex w-[min(360px,90vw)] flex-col gap-3">
        {toasts.map((toast) => {
          const config = toneStyles[toast.tone];
          const Icon = config.icon;
          return (
            <div
              key={toast.id}
              className={`pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg backdrop-blur ${config.className}`}
            >
              <Icon className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <div className="leading-snug">{toast.message}</div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
