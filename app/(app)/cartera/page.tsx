import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { estadoCartera } from "@/lib/calculos";
import { listasParaFormularios } from "@/lib/queries";
import { Card, EstadoVacio, PageHeader } from "@/components/ui";
import { CarteraTabla, CarteraVista } from "@/components/cartera-tabla";
import { exigirSesionPagina } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function CarteraPage() {
  // Antes de tocar la base: el layout no alcanza a cortar el render.
  await exigirSesionPagina();

  const [polizas, listas] = await Promise.all([
    prisma.policy.findMany({ orderBy: { fechaMaxPago: "asc" } }),
    listasParaFormularios(),
  ]);

  const vista: CarteraVista[] = polizas.map((p) => {
    const ec = estadoCartera(p.estadoPago, p.fechaMaxPago);
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
      observacion: p.observacion,
      celular: p.celular,
      valorCuota: p.valorCuota,
      notaCartera: p.notaCartera,
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
          <EstadoVacio
            titulo="No hay pólizas cargadas"
            descripcion="Importe el informe de producción para hacer seguimiento de la cartera."
            accion={
              <Link
                href="/importar"
                className="inline-flex items-center rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
              >
                Importar datos
              </Link>
            }
          />
        </Card>
      ) : (
        <CarteraTabla polizas={vista} listas={listas} />
      )}
    </div>
  );
}
