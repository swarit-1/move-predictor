/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"DM Sans"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: {
        board: {
          light: "#f0d9b5",
          dark: "#b58863",
        },
        // Primary: warm gold — chess tradition
        gold: {
          DEFAULT: "#C9A84C",
          light: "#DCC06A",
          dim: "rgba(201, 168, 76, 0.15)",
          glow: "rgba(201, 168, 76, 0.08)",
        },
        // Semantic colors for analysis
        engine: "#5B8DEF",
        human: "#4ADE80",
        blunder: "#F87171",
        inaccuracy: "#FBBF24",
        // Surfaces
        surface: {
          0: "#0B0B11",
          1: "#12121A",
          2: "#1A1A24",
          3: "#22222E",
          border: "rgba(255, 255, 255, 0.06)",
        },
      },
      borderRadius: {
        "2xl": "16px",
        "3xl": "20px",
      },
      animation: {
        "fade-in": "fadeIn 0.3s ease-out",
        "slide-up": "slideUp 0.35s ease-out",
        "slide-in-right": "slideInRight 0.3s ease-out",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideInRight: {
          "0%": { opacity: "0", transform: "translateX(12px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
      },
    },
  },
  plugins: [],
};
