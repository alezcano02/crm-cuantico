import { redirect } from "next/navigation";
import { AppShell, ContadoresNav } from "@/components/app-shell";
import { prisma } from "@/lib/prisma";
import { hoyUTC } from "@/lib/calculos";
import { puedeImportar, sesionActual } from "@/lib/auth";

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

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Comprobación de sesión contra la base: es la autoridad. El middleware
  // solo evita el viaje al servidor cuando no hay ni cookie.
  const sesion = await sesionActual();
  if (!sesion) redirect("/login");

  return (
    <AppShell
      contadores={await contadores()}
      sesion={{ ...sesion, puedeImportar: puedeImportar(sesion.usuario) }}
    >
      {children}
    </AppShell>
  );
}
