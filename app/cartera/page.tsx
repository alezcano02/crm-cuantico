import { prisma } from "@/lib/prisma";
import { estadoCartera } from "@/lib/calculos";
import { Card, PageHeader } from "@/components/ui";
import { CarteraTabla, CarteraVista } from "@/components/cartera-tabla";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function CarteraPage() {
  const polizas = await prisma.policy.findMany({
    orderBy: { fechaMaxPago: "asc" },
  });

  const vista: CarteraVista[] = polizas.map((p) => {
    const ec = estadoCartera(p.estadoPago, p.fechaMaxPago);
    return {
      id: p.id,
      numero: p.numero,
      ramo: p.ramo,
      asegurado: p.asegurado,
      ccNit: p.ccNit,
      aseguradora: p.aseguradora,
      asesor1: p.asesor1,
      asesor2: p.asesor2,
      primaNeta: p.primaNeta,
      primaTotal: p.primaTotal,
      formaPago: p.formaPago,
      estadoPago: p.estadoPago,
      fechaPago: p.fechaPago?.toISOString() ?? null,
      fechaMaxPago: p.fechaMaxPago?.toISOString() ?? null,
      vencimiento: p.vencimiento?.toISOString() ?? null,
      correo: p.correo,
      celular: p.celular,
      estado: ec.estado,
      diasCartera: ec.dias,
    };
  });

  const enMora = vista.filter((p) => p.estado === "EN_MORA");

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Cartera y cobranza"
        descripcion={`Seguimiento de pagos por fecha máxima de pago · ${enMora.length} pólizas en mora`}
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
        <CarteraTabla polizas={vista} />
      )}
    </div>
  );
}
