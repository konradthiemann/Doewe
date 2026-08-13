import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "../../packages/shared/src/**/*.{ts,tsx}"
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Semantik via CSS-Variablen (Light/Dark in globals.css).
        // RGB-Triplets, damit Tailwind <alpha-value> funktioniert.
        bg: "rgb(var(--bg) / <alpha-value>)",
        surface: {
          DEFAULT: "rgb(var(--surface) / <alpha-value>)",
          2: "rgb(var(--surface-2) / <alpha-value>)"
        },
        line: {
          DEFAULT: "rgb(var(--line) / <alpha-value>)",
          strong: "rgb(var(--line-strong) / <alpha-value>)"
        },
        ink: {
          DEFAULT: "rgb(var(--ink) / <alpha-value>)",
          muted: "rgb(var(--ink-muted) / <alpha-value>)",
          faint: "rgb(var(--ink-faint) / <alpha-value>)"
        },
        brand: {
          DEFAULT: "rgb(var(--brand) / <alpha-value>)",
          hover: "rgb(var(--brand-hover) / <alpha-value>)",
          soft: "rgb(var(--brand-soft) / <alpha-value>)",
          on: "rgb(var(--brand-on) / <alpha-value>)"
        },
        income: {
          DEFAULT: "rgb(var(--income) / <alpha-value>)",
          soft: "rgb(var(--income-soft) / <alpha-value>)"
        },
        expense: {
          DEFAULT: "rgb(var(--expense) / <alpha-value>)",
          soft: "rgb(var(--expense-soft) / <alpha-value>)"
        },
        savings: {
          DEFAULT: "rgb(var(--savings) / <alpha-value>)",
          soft: "rgb(var(--savings-soft) / <alpha-value>)"
        },
        success: {
          DEFAULT: "rgb(var(--success) / <alpha-value>)",
          soft: "rgb(var(--success-soft) / <alpha-value>)"
        },
        warning: {
          DEFAULT: "rgb(var(--warning) / <alpha-value>)",
          soft: "rgb(var(--warning-soft) / <alpha-value>)"
        },
        danger: {
          DEFAULT: "rgb(var(--danger) / <alpha-value>)",
          soft: "rgb(var(--danger-soft) / <alpha-value>)"
        },
        info: {
          DEFAULT: "rgb(var(--info) / <alpha-value>)",
          soft: "rgb(var(--info-soft) / <alpha-value>)"
        }
      },
      fontFamily: {
        sans: ['system-ui', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif']
      },
      // Eigene Zahlen-/Betrags-Skala — immer mit .tabular-nums.
      // KPI-Karten: amount (18px) statt text-2xl → kein Umbruch
      // bei halber Kartenbreite auf 375px.
      fontSize: {
        "amount-sm": ["0.9375rem", { lineHeight: "1.2" }],
        amount: ["1.125rem", { lineHeight: "1.2" }],
        "amount-lg": ["1.375rem", { lineHeight: "1.15" }],
        "amount-xl": ["1.75rem", { lineHeight: "1.1" }],
        "amount-hero": ["2.25rem", { lineHeight: "1.05", letterSpacing: "-0.02em" }]
      },
      borderRadius: {
        card: "0.75rem", // Karten
        field: "0.5rem" // Inputs, Buttons
      },
      boxShadow: {
        card: "0 1px 2px rgb(0 0 0 / 0.04)",
        raised: "0 4px 16px rgb(0 0 0 / 0.08)",
        fab: "0 8px 24px rgb(var(--brand) / 0.35)"
      },
      // Z-Leiter: Content < Header < Bottom-Nav/FAB < Drawer < Dialog < Toast
      zIndex: {
        header: "40",
        nav: "50",
        overlay: "60",
        modal: "70",
        toast: "100"
      },
      transitionDuration: { quick: "150ms", base: "250ms" },
      transitionTimingFunction: {
        calm: "cubic-bezier(0.2, 0, 0, 1)"
      },
      // Ergänzt Core-'animate-spin'/'animate-pulse'.
      // Alle Nutzungen mit motion-reduce:animate-none flanken.
      keyframes: {
        "fade-in-up": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" }
        }
      },
      animation: {
        "fade-in-up": "fade-in-up 250ms cubic-bezier(0.2,0,0,1) both"
      }
    }
  },
  plugins: [require("@tailwindcss/forms")]
};

export default config;