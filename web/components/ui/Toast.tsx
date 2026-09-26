import { AlertTriangle, Info, ShieldAlert, ShieldCheck, X } from "lucide-react";

const variants = {
  info: {
    wrap: "bg-brand-soft text-brand",
    icon: Info,
  },
  attention: {
    wrap: "bg-attention-soft text-attention",
    icon: AlertTriangle,
  },
  critical: {
    wrap: "bg-critical-soft text-critical",
    icon: ShieldAlert,
  },
  safe: {
    wrap: "bg-safe-soft text-safe",
    icon: ShieldCheck,
  },
} as const;

type ToastProps = {
  tone?: keyof typeof variants;
  message: string;
  onDismiss?: () => void;
};

export function Toast({ tone = "info", message, onDismiss }: ToastProps) {
  const variant = variants[tone];
  const Icon = variant.icon;

  return (
    <div
      role="status"
      className={`animate-toast-in flex min-h-12 items-center gap-3 rounded-card px-4 py-3 shadow-card ${variant.wrap}`}
    >
      <Icon aria-hidden="true" className="size-5 shrink-0" />
      <p className="flex-1 text-sm font-medium">{message}</p>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          className="inline-flex size-12 items-center justify-center rounded-pill"
          aria-label="Dismiss notification"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      ) : null}
    </div>
  );
}
