import React from "react";

type Variant = "solid" | "flat" | "paper";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: Variant;
  interactive?: boolean;
}

const variantClass: Record<Variant, string> = {
  solid: "bg-walnut-800 border border-edge",
  flat: "bg-transparent border border-edge",
  paper: "bg-gradient-to-b from-paper/[0.04] to-transparent border border-edge",
};

export function Card({
  variant = "solid",
  interactive = false,
  className = "",
  children,
  ...rest
}: CardProps) {
  const interactiveClass = interactive
    ? "transition-colors duration-200 hover:border-edgeStrong hover:bg-walnut-700/60 cursor-pointer"
    : "";
  return (
    <div
      {...rest}
      className={`${variantClass[variant]} ${interactiveClass} rounded-xl ${className}`}
    >
      {children}
    </div>
  );
}
