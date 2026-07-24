import { prisma } from "@/lib/prisma";
import { diasAlVence, semaforoVencimiento } from "@/lib/calculos";
import { listasParaFormularios } from "@/lib/queries";
import { Card, PageHeader } from "@/components/ui";
import { VencimientosTabla, PolizaVista } from "@/components/vencimientos-tabla";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function VencimientosPage() {
  const [polizas, listas] = await Promise.all([
    prisma.policy.findMany({ orderBy: { vencimiento: "asc" } }),
    listasParaFormularios(),
  ]);

  const vista: PolizaVista[] = polizas.map((p) => {
    const dias = diasAlVence(p.vencimiento);
    return {
      id: p.id,
      numero: p.numero,
      ramo: p.ramo,
      asegurado: p.asegurado,
      ccNit: p.ccNit,
      placa: p.placa,
      aseguradora: p.aseguradora,
      tipoNegocio: p.tipoNegocio,
      asesor1: p.asesor1,
      asesor2: p.asesor2,
      primaNeta: p.primaNeta,
      primaTotal: p.primaTotal,
      formaPago: p.formaPago,
      estadoPago: p.estadoPago,
      fechaPago: p.fechaPago?.toISOString() ?? null,
      fechaMaxPago: p.fechaMaxPago?.toISOString() ?? null,
      vencimiento: p.vencimiento?.toISOString() ?? null,
      fechaNacimiento: p.fechaNacimiento?.toISOString() ?? null,
      correo: p.correo,
      celular: p.celular,
      dias,
      semaforo: semaforoVencimiento(dias),
      gestionada: p.gestionada,
      notaGestion: p.notaGestion,
    };
  });

  const vencidas = vista.filter((p) => p.dias != null && p.dias < 0).length;
  const proximas = vista.filter((p) => p.dias != null && p.dias >= 0 && p.dias <= 30).length;

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Vencimientos y cartera"
        descripcion={`${vencidas} pólizas vencidas pendientes de gestión · ${proximas} vencen en los próximos 30 días`}
      />

      {vista.length === 0 ? (
        <Card>
          <p className="text-sm text-ink-muted">
            No hay pólizas cargadas.{" "}
            <Link href="/importar" className="font-medium text-brand hover:underline">
              Importar datos
            </Link>
          </p>
        </Card>
      ) : (
        <VencimientosTabla polizas={vista} listas={listas} />
      )}
    </div>
  );
}
