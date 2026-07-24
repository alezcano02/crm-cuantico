import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { NavLinks } from "@/components/nav-links";

export const metadata: Metadata = {
  title: "Cuántico CRM — Cartera y Producción",
  description:
    "Seguimiento de cartera, vencimientos y cumplimiento de metas de producción — Cuántico Agencia de Seguros",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <div className="flex min-h-screen">
          <aside className="fixed inset-y-0 left-0 w-56 border-r border-line-grid bg-white">
            <div className="border-b border-line-grid px-5 py-5">
              <Link href="/" className="block">
                <div className="text-lg font-bold tracking-tight text-brand-dark">
                  CUÁNTICO
                </div>
                <div className="text-xs text-ink-muted">Agencia de Seguros</div>
              </Link>
            </div>
            <NavLinks />
            <div className="absolute bottom-0 w-full border-t border-line-grid px-5 py-3 text-[11px] text-ink-muted">
              CRM · Producción y cartera
            </div>
          </aside>
          <main className="ml-56 flex-1 px-8 py-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
