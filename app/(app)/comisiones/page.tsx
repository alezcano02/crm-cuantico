import { prisma } from "@/lib/prisma";
import { exigirComisionesPagina } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { ComisionesTabla } from "@/components/comisiones-tabla";
import {
  FilaComision,
  cronogramaComision,
  cuotasDeFormaPago,
  inicioVigencia,
  porcentajeComision,
  tarifario,
} from "@/lib/comisiones";
import { hoyUTC } from "@/lib/calculos";

export const dynamic = "force-dynamic";

/**
 * Comisiones causadas y por causar.
 *
 * El cálculo se hace aquí, en el servidor, y no en el componente: son cifras
 * de dinero y conviene que salgan de una sola función, la misma que el resto
 * de la aplicación puede reutilizar (lib/comisiones.ts).
 */
export default async function ComisionesPage() {
  // Antes de tocar la base: además de sesión, esta pantalla es de una sola
  // cuenta.
  await exigirComisionesPagina();

  const polizas = await prisma.policy.findMany({
    orderBy: [{ estadoPago: "asc" }, { primaNeta: "desc" }],
  });

  const filas: FilaComision[] = polizas.map((p) => {
    const pct = porcentajeComision(p.ramo);
    const comision = pct == null ? null : (p.primaNeta * pct) / 100;
    return {
      id: p.id,
      numero: p.numero,
      ramo: p.ramo,
      asegurado: p.asegurado,
      aseguradora: p.aseguradora,
      asesor1: p.asesor1,
      formaPago: p.formaPago,
      estadoPago: p.estadoPago,
      primaNeta: p.primaNeta,
      pct,
      comision,
      pagada: p.estadoPago === "OK PAGO",
      cuotas: cuotasDeFormaPago(p.formaPago),
      cronograma: cronogramaComision(p.vencimiento, p.formaPago, comision),
      fechaMaxPago: p.fechaMaxPago?.toISOString() ?? null,
      vencimiento: p.vencimiento?.toISOString() ?? null,
      inicioVigencia: inicioVigencia(p.vencimiento)?.toISOString() ?? null,
    };
  });

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Comisiones"
        descripcion="Repartida por cuotas desde la vigencia: mensuales a 12, acuerdos de pago a 3, el resto de contado. La comisión se cobra al mes siguiente de cada recaudo."
      />
      <ComisionesTabla
        filas={filas}
        tarifas={tarifario()}
        anioDefecto={hoyUTC().getUTCFullYear()}
        mesActual={hoyUTC().toISOString().slice(0, 7)}
      />
    </div>
  );
}
