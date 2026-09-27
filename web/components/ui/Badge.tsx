import type { ReactNode } from "react";
import { AlertTriangle, Info, ShieldAlert, ShieldCheck } from "lucide-react";

const variants = {
  info: {
    wrap: "bg-brand-soft text-brand",
    icon: Info,
    label: "Info",
  },
  attention: {
    wrap: "bg-attention-soft text-attention",
    icon: AlertTriangle,
    label: "Attention",
  },
  critical: {
    wrap: "bg-critical-soft text-critical",
    icon: ShieldAlert,
    label: "Critical",
  },
  safe: {
    wrap: "bg-safe-soft text-safe",
    icon: ShieldCheck,
    label: "Safe",
  },
} as const;

type BadgeProps = {
  tone: keyof typeof variants;
  children?: ReactNode;
};

export function Badge({ tone, children }: BadgeProps) {
  const variant = variants[tone];
  const Icon = variant.icon;
  const word = children ?? variant.label;

  return (
    <span
      className={`inline-flex min-h-8 items-center gap-1.5 rounded-pill px-3 py-1 text-sm font-medium ${variant.wrap}`}
    >
      <Icon aria-hidden="true" className="size-4" />
      <span>{word}</span>
    </span>
  );
}
