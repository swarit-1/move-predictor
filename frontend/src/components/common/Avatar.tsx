import React from "react";

interface AvatarProps {
  name: string;
  size?: number;
  className?: string;
}

const TONES = [
  "linear-gradient(135deg, #C9A84C 0%, #7A6347 100%)",
  "linear-gradient(135deg, #DCC06A 0%, #5A4631 100%)",
  "linear-gradient(135deg, #A88E6E 0%, #2A2219 100%)",
  "linear-gradient(135deg, #B08840 0%, #3A2E22 100%)",
  "linear-gradient(135deg, #5C7A98 0%, #2A2219 100%)",
  "linear-gradient(135deg, #6F8F5A 0%, #2A2219 100%)",
];

function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export function Avatar({ name, size = 40, className = "" }: AvatarProps) {
  const initials = (name || "?")
    .split(/[\s_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("") || "?";
  const tone = TONES[hash(name || "?") % TONES.length];
  const fontSize = Math.round(size * 0.42);
  return (
    <div
      className={`flex items-center justify-center text-walnut-900 font-serif font-medium select-none ${className}`}
      style={{
        width: size,
        height: size,
        background: tone,
        borderRadius: 999,
        fontSize,
        letterSpacing: "-0.02em",
        boxShadow: "inset 0 0 0 1px rgba(21, 17, 12, 0.18)",
      }}
      aria-hidden
    >
      {initials}
    </div>
  );
}
