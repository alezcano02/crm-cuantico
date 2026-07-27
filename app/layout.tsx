import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
