import { prisma } from "@/lib/prisma";
import { Card, PageHeader } from "@/components/ui";
import { CancelacionesTabla, CancelacionVista } from "@/components/cancelaciones-tabla";
import Link from "next/link";
import { exigirSesionPagina } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function CancelacionesPage() {
  // Antes de tocar la base: el layout no alcanza a cortar el render.
  await exigirSesionPagina();

  const cancelaciones = await prisma.cancellation.findMany({
    orderBy: [{ fechaCancelacion: "desc" }, { fechaRenovacion: "desc" }],
  });

  const vista: CancelacionVista[] = cancelaciones.map((c) => ({
    id: c.id,
    numero: c.numero,
    ramo: c.ramo,
    fechaRenovacion: c.fechaRenovacion?.toISOString() ?? null,
    fechaCancelacion: c.fechaCancelacion?.toISOString() ?? null,
    tipoNegocio: c.tipoNegocio,
    asegurado: c.asegurado,
    ccNit: c.ccNit,
    placa: c.placa,
    asesor: c.asesor,
    aseguradora: c.aseguradora,
    primaNeta: c.primaNeta,
    primaTotal: c.primaTotal,
    motivo: c.motivo,
    manual: c.manual,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Cancelaciones históricas"
        descripcion="Todas las pólizas canceladas de la empresa, filtrables por fecha de cancelación o de renovación"
      />

      {vista.length === 0 ? (
        <Card>
          <p className="text-sm text-ink-muted">
            No hay cancelaciones registradas.{" "}
            <Link href="/importar" className="font-medium text-brand hover:underline">
              Importar datos
            </Link>{" "}
            o cancele una póliza desde la vista de{" "}
            <Link href="/cartera" className="font-medium text-brand hover:underline">
              cartera
            </Link>
            .
          </p>
        </Card>
      ) : (
        <CancelacionesTabla cancelaciones={vista} />
      )}
    </div>
  );
}
