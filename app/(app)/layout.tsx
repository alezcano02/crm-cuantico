import { redirect } from "next/navigation";
import { AppShell, ContadoresNav } from "@/components/app-shell";
import { contadoresNav } from "@/lib/queries";
import {
  puedeImportar,
  puedeVerColectivas,
  puedeVerComisiones,
  sesionActual,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Contadores de la barra lateral (pólizas vencidas y pagos en mora).
 * Si la base no está disponible se devuelven ceros: la navegación debe
 * renderizarse igual, sin tumbar la aplicación entera.
 */
async function contadores(): Promise<ContadoresNav> {
  try {
    // Cacheados unos segundos: se piden en cada navegación de cada usuario y
    // son dos COUNT sobre la cartera entera. Ver lib/cache.ts.
    return await contadoresNav();
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
      sesion={{
        ...sesion,
        puedeImportar: puedeImportar(sesion.usuario),
        puedeVerComisiones: puedeVerComisiones(sesion.usuario),
        puedeVerColectivas: puedeVerColectivas(sesion.usuario),
      }}
    >
      {children}
    </AppShell>
  );
}
