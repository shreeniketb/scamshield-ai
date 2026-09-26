import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  children?: ReactNode;
};

const variants = {
  primary: "bg-brand text-white hover:opacity-90",
  secondary: "bg-brand-soft text-brand hover:bg-line",
  danger: "bg-critical text-white hover:opacity-90",
  ghost: "bg-transparent text-ink hover:bg-brand-soft",
};

export function Button({
  variant = "primary",
  className = "",
  type = "button",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-pill px-5 text-base font-medium transition-opacity duration-200 ease-out disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
