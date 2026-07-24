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
          <aside className="fixed inset-y-0 left-0 z-40 flex w-60 flex-col bg-slate-900">
            <div className="border-b border-white/10 px-5 py-5">
              <Link href="/" className="block">
                <div className="text-lg font-bold tracking-widest text-white">
                  CUÁNTICO
                </div>
                <div className="mt-0.5 text-[11px] uppercase tracking-wider text-slate-400">
                  Agencia de Seguros
                </div>
              </Link>
            </div>
            <NavLinks />
            <div className="mt-auto border-t border-white/10 px-5 py-4 text-[11px] leading-relaxed text-slate-500">
              CRM de producción y cartera
              <br />
              Datos en tiempo real desde la base
            </div>
          </aside>
          <main className="ml-60 min-w-0 flex-1 px-8 py-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
