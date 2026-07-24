import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: { DEFAULT: "#ffffff", page: "#f5f7fa", sunken: "#eef1f6" },
        ink: { DEFAULT: "#0f1729", secondary: "#48546b", muted: "#7a8699" },
        line: { grid: "#e4e8ef", axis: "#c8cfda" },
        // Azul marino tomado del logo de Cuántico (#123b5e) con su escala.
        // Es el color del "cromo" de la interfaz: barra lateral, botones,
        // pestañas activas. Los colores de los gráficos son otros (ver
        // components/charts.tsx): esa paleta está validada para daltonismo
        // y contraste, y no debe mezclarse con la de marca.
        brand: {
          DEFAULT: "#123b5e",
          dark: "#0d2c46",
          light: "#dbe7f2",
          50: "#f1f5fa",
          100: "#dbe7f2",
          200: "#b3cbe1",
          300: "#85a9cb",
          400: "#5484ae",
          500: "#2f6390",
          600: "#1c4d76",
          700: "#123b5e",
          800: "#0d2c46",
          900: "#081d2f",
          950: "#04101b",
        },
        status: {
          good: "#0ca30c",
          warning: "#fab219",
          serious: "#ec835a",
          critical: "#d03b3b",
        },
      },
      fontFamily: {
        sans: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        serif: ["Georgia", "Times New Roman", "serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(15,23,41,0.04), 0 1px 3px rgba(15,23,41,0.06)",
        raised: "0 4px 12px rgba(15,23,41,0.08), 0 1px 3px rgba(15,23,41,0.06)",
        modal: "0 20px 50px rgba(15,23,41,0.25)",
      },
    },
  },
  plugins: [],
};

export default config;
