import type { ReactNode } from "react";

type CardProps = {
  children: ReactNode;
  className?: string;
};

export function Card({ children, className = "" }: CardProps) {
  return (
    <div
      className={`rounded-card bg-surface p-5 shadow-card md:p-6 ${className}`}
    >
      {children}
    </div>
  );
}
