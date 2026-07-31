import type { Metadata } from "next";
import { Barlow, Barlow_Condensed, Cormorant_Garamond } from "next/font/google";
import "./globals.css";

// Las mismas tres tipografías de cuanticoseguros.com.co: Barlow para el texto,
// Barlow Condensed en mayúsculas para etiquetas y botones, y Cormorant
// Garamond en peso ligero para los titulares.
const barlow = Barlow({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--fuente-barlow",
  display: "swap",
});

const barlowCondensed = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--fuente-barlow-condensed",
  display: "swap",
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "600"],
  variable: "--fuente-cormorant",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Cuántico Seguros — CRM de cartera y producción",
  description:
    "Seguimiento de cartera, vencimientos y cumplimiento de metas de producción — Cuántico Agencia de Seguros",
};

/**
 * Layout raíz: solo el documento. La barra lateral y la comprobación de
 * sesión viven en app/(app)/layout.tsx, de modo que la pantalla de inicio de
 * sesión (app/login) quede fuera del área protegida.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="es"
      className={`${barlow.variable} ${barlowCondensed.variable} ${cormorant.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
