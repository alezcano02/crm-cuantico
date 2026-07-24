import { prisma } from "@/lib/prisma";
import { diasAlVence, semaforoVencimiento } from "@/lib/calculos";
import { Card } from "@/components/ui";
import { VencimientosTabla, PolizaVista } from "@/components/vencimientos-tabla";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function VencimientosPage() {
  const polizas = await prisma.policy.findMany({
    orderBy: { vencimiento: "asc" },
  });

  const vista: PolizaVista[] = polizas.map((p) => {
    const dias = diasAlVence(p.vencimiento);
    return {
      id: p.id,
      numero: p.numero,
      ramo: p.ramo,
      asegurado: p.asegurado,
      ccNit: p.ccNit,
      aseguradora: p.aseguradora,
      tipoNegocio: p.tipoNegocio,
      asesor1: p.asesor1,
      asesor2: p.asesor2,
      primaNeta: p.primaNeta,
      primaTotal: p.primaTotal,
      estadoPago: p.estadoPago,
      vencimiento: p.vencimiento?.toISOString() ?? null,
      dias,
      semaforo: semaforoVencimiento(dias),
      correo: p.correo,
      celular: p.celular,
      gestionada: p.gestionada,
      notaGestion: p.notaGestion,
    };
  });

  const vencidas = vista.filter((p) => p.dias != null && p.dias < 0).length;
  const proximas = vista.filter((p) => p.dias != null && p.dias >= 0 && p.dias <= 30).length;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-bold">Vencimientos y cartera</h1>
        <p className="text-sm text-ink-muted">
          {vencidas} pólizas vencidas pendientes de gestión · {proximas} vencen en
          los próximos 30 días
        </p>
      </header>

      {vista.length === 0 ? (
        <Card>
          <p className="text-sm text-ink-muted">
            No hay pólizas cargadas.{" "}
            <Link href="/importar" className="font-medium text-brand hover:underline">
              Importar datos →
            </Link>
          </p>
        </Card>
      ) : (
        <VencimientosTabla polizas={vista} />
      )}
    </div>
  );
}
