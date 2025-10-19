import type { Config } from "tailwindcss";

import typography from "@tailwindcss/typography";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        "atlas-bg": "#060b22",
        "atlas-panel": "rgba(16,21,42,0.85)",
        "atlas-panel-strong": "rgba(18,24,52,0.95)",
        "atlas-accent": "#7c6cff",
        "atlas-accent-soft": "rgba(124,108,255,0.2)",
        "atlas-accent-strong": "#a997ff",
        "atlas-text": "#f5f7ff",
        "atlas-text-secondary": "#a0abc8",
        "atlas-border": "rgba(124,108,255,0.25)",
        "atlas-success": "#2ae5b9",
        "atlas-danger": "#ff5c80",
      },
      fontFamily: {
        mono: [
          "JetBrains Mono",
          "Fira Code",
          "Menlo",
          "Monaco",
          "Consolas",
          "Liberation Mono",
          "Courier New",
          "monospace",
        ],
      },
      boxShadow: {
        "atlas-lg": "0 24px 60px rgba(20, 13, 64, 0.35)",
        "atlas-chat": "0 20px 45px rgba(12, 18, 36, 0.45)",
        "atlas-chat-strong": "0 24px 55px rgba(28, 18, 72, 0.65)",
      },
      backgroundImage: {
        "atlas-body":
          "radial-gradient(circle at 20% 20%, rgba(33, 48, 120, 0.35), transparent 65%), radial-gradient(circle at 80% 0%, rgba(124, 108, 255, 0.25), transparent 60%), #060b22",
      },
    },
  },
  plugins: [typography],
};

export default config;
