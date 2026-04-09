import React from "react";

type Variant = "primary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
}

const base =
  "inline-flex items-center justify-center gap-2 font-medium transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed select-none";

const variants: Record<Variant, string> = {
  primary:
    "bg-gold text-walnut-900 hover:bg-gold-light border border-gold/0",
  ghost:
    "bg-transparent text-paper hover:bg-walnut-700 border border-transparent",
  outline:
    "bg-transparent text-paper border border-edge hover:border-edgeStrong hover:bg-walnut-800",
  danger:
    "bg-transparent text-danger border border-danger/40 hover:bg-danger/10",
};

const sizes: Record<Size, string> = {
  sm: "text-[12px] tracking-[0.12em] uppercase px-3 h-8 rounded-md",
  md: "text-[13px] tracking-[0.10em] uppercase px-5 h-11 rounded-md",
  lg: "text-[14px] tracking-[0.12em] uppercase px-7 h-14 rounded-md",
};

export function Button({
  variant = "primary",
  size = "md",
  fullWidth = false,
  className = "",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      className={`${base} ${variants[variant]} ${sizes[size]} ${fullWidth ? "w-full" : ""} ${className}`}
    >
      {children}
    </button>
  );
}
