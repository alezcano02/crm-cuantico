import type { Metadata } from "next";
import "./globals.css";
import { AppShell, ContadoresNav } from "@/components/app-shell";
import { prisma } from "@/lib/prisma";
import { hoyUTC } from "@/lib/calculos";

export const metadata: Metadata = {
  title: "Cuántico Seguros — CRM de cartera y producción",
  description:
    "Seguimiento de cartera, vencimientos y cumplimiento de metas de producción — Cuántico Agencia de Seguros",
};

export const dynamic = "force-dynamic";

/**
 * Contadores de la barra lateral (pólizas vencidas y pagos en mora).
 * Si la base no está disponible se devuelven ceros: la navegación debe
 * renderizarse igual, sin tumbar la aplicación entera.
 */
async function contadores(): Promise<ContadoresNav> {
  try {
    const hoy = hoyUTC();
    const [vencidas, mora] = await Promise.all([
      prisma.policy.count({ where: { vencimiento: { lt: hoy } } }),
      prisma.policy.count({
        where: { estadoPago: "PENDIENTE", fechaMaxPago: { lt: hoy } },
      }),
    ]);
    return { vencidas, mora };
  } catch {
    return { vencidas: 0, mora: 0 };
  }
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>
        <AppShell contadores={await contadores()}>{children}</AppShell>
      </body>
    </html>
  );
}
