import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: { DEFAULT: "#fcfcfb", page: "#f9f9f7" },
        ink: { DEFAULT: "#0b0b0b", secondary: "#52514e", muted: "#898781" },
        line: { grid: "#e1e0d9", axis: "#c3c2b7" },
        brand: { DEFAULT: "#2a78d6", dark: "#1c5cab", light: "#cde2fb" },
        status: {
          good: "#0ca30c",
          warning: "#fab219",
          serious: "#ec835a",
          critical: "#d03b3b",
        },
      },
      fontFamily: {
        sans: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
