"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";

type SheetProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
};

export function Sheet({ open, title, onClose, children }: SheetProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        className="absolute inset-0 bg-ink/40"
        aria-label="Close sheet"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
        className="animate-sheet-up relative z-10 w-full max-w-lg rounded-t-sheet bg-surface p-6 shadow-card sm:rounded-sheet"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id="sheet-title" className="font-display text-2xl text-ink">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-12 items-center justify-center rounded-pill hover:bg-brand-soft"
            aria-label="Close"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
