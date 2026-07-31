import type { Config } from "tailwindcss";

/**
 * Paleta y tipografías tomadas de cuanticoseguros.com.co, para que el CRM se
 * vea de la misma familia que la web pública: navy profundo, azul de acento,
 * fondo crema cálido, titulares en Cormorant Garamond y etiquetas en Barlow
 * Condensed en mayúsculas.
 *
 * Los colores de los gráficos NO salen de aquí (ver components/charts.tsx):
 * esa paleta está validada para daltonismo y contraste y se mantiene aparte.
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // #f4f1ec es el crema de fondo de la web
        surface: { DEFAULT: "#ffffff", page: "#f4f1ec", sunken: "#eae5dc" },
        ink: { DEFAULT: "#1a1a2e", secondary: "#5a6275", muted: "#8d93a3" },
        line: { grid: "#e3ded4", axis: "#cbc5b8" },
        // Navy #132240 y acento #3d6fa8, los dos de la web
        brand: {
          DEFAULT: "#132240",
          dark: "#0b1628",
          light: "#e2eaf4",
          acento: "#3d6fa8",
          50: "#f2f5f9",
          100: "#e2eaf4",
          200: "#c2d3e7",
          300: "#9bb6d5",
          400: "#5b8fc9",
          500: "#3d6fa8",
          600: "#2c5384",
          700: "#1d3760",
          800: "#132240",
          900: "#0b1628",
          950: "#060d18",
        },
        status: {
          good: "#0ca30c",
          warning: "#fab219",
          serious: "#ec835a",
          critical: "#d03b3b",
        },
      },
      fontFamily: {
        // Las variables las inyecta next/font en app/layout.tsx
        sans: ["var(--fuente-barlow)", "system-ui", "sans-serif"],
        condensada: ["var(--fuente-barlow-condensed)", "system-ui", "sans-serif"],
        display: ["var(--fuente-cormorant)", "Georgia", "serif"],
        serif: ["var(--fuente-cormorant)", "Georgia", "serif"],
      },
      borderRadius: {
        // La web usa esquinas de 4px; se suavizan un poco para las tarjetas
        lg: "6px",
        xl: "8px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(19,34,64,0.04), 0 1px 3px rgba(19,34,64,0.06)",
        raised: "0 4px 12px rgba(19,34,64,0.08), 0 1px 3px rgba(19,34,64,0.06)",
        modal: "0 20px 50px rgba(19,34,64,0.25)",
      },
    },
  },
  plugins: [],
};

export default config;
