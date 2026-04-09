/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"DM Sans"', "system-ui", "sans-serif"],
        serif: ['"DM Serif Display"', '"Cormorant Garamond"', "Georgia", "serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: {
        // Standard chess board (kept for legibility)
        board: {
          light: "#f0d9b5",
          dark: "#b58863",
        },
        // Editorial walnut/paper palette
        paper: "#F6F2EA",
        bone: "#EDE7D9",
        walnut: {
          900: "#15110C",
          800: "#1E1813",
          700: "#2A2219",
          600: "#3A2E22",
          500: "#5A4631",
          400: "#7A6347",
          300: "#A88E6E",
        },
        ink: "#0A0807",
        gold: {
          DEFAULT: "#C9A84C",
          light: "#DCC06A",
          dim: "rgba(201, 168, 76, 0.16)",
          glow: "rgba(201, 168, 76, 0.06)",
        },
        // Muted semantic chips
        success: "#6F8F5A",
        danger: "#A24A44",
        warn: "#B08840",
        info: "#5C7A98",
        // Functional analysis colors (kept saturated for legibility)
        engine: "#5B8DEF",
        human: "#4ADE80",
        blunder: "#F87171",
        inaccuracy: "#FBBF24",
        // Legacy surface aliases pointed at the new walnut scale
        surface: {
          0: "#15110C",
          1: "#1E1813",
          2: "#2A2219",
          3: "#3A2E22",
          border: "rgba(246, 242, 234, 0.08)",
        },
      },
      borderColor: {
        edge: "rgba(246, 242, 234, 0.10)",
        edgeStrong: "rgba(246, 242, 234, 0.18)",
      },
      borderRadius: {
        none: "0px",
        xs: "2px",
        sm: "4px",
        DEFAULT: "6px",
        md: "8px",
        lg: "12px",
        xl: "16px",
        "2xl": "20px",
        "3xl": "28px",
      },
      boxShadow: {
        edge: "0 0 0 1px rgba(246, 242, 234, 0.08)",
        lift: "0 1px 24px rgba(0, 0, 0, 0.32)",
        liftLg: "0 8px 48px rgba(0, 0, 0, 0.45)",
      },
      fontSize: {
        display: ["clamp(56px, 9vw, 112px)", { lineHeight: "0.95", letterSpacing: "-0.03em" }],
        hero: ["clamp(36px, 5vw, 64px)", { lineHeight: "1.05", letterSpacing: "-0.025em" }],
        h1: ["clamp(28px, 3.4vw, 44px)", { lineHeight: "1.1", letterSpacing: "-0.02em" }],
        h2: ["clamp(22px, 2.4vw, 30px)", { lineHeight: "1.2", letterSpacing: "-0.015em" }],
        body: ["16px", { lineHeight: "1.55" }],
        small: ["13px", { lineHeight: "1.5" }],
        micro: ["11px", { lineHeight: "1.4", letterSpacing: "0.08em" }],
      },
      spacing: {
        section: "96px",
        block: "48px",
      },
      letterSpacing: {
        tightest: "-0.04em",
        editorial: "-0.025em",
        eyebrow: "0.16em",
      },
      animation: {
        "fade-in": "fadeIn 0.4s ease-out",
        "slide-up": "slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
        "slide-in-right": "slideInRight 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideInRight: {
          "0%": { opacity: "0", transform: "translateX(16px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
      },
    },
  },
  plugins: [],
};
