import { prisma } from "@/lib/prisma";
import { diasAlVence, tipoAnexo, semaforoVencimiento } from "@/lib/calculos";
import { listasParaFormularios } from "@/lib/queries";
import { Card, PageHeader } from "@/components/ui";
import { VencimientosTabla, PolizaVista } from "@/components/vencimientos-tabla";
import Link from "next/link";
import { exigirSesionPagina } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function VencimientosPage() {
  // Antes de tocar la base: el layout no alcanza a cortar el render.
  await exigirSesionPagina();

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
      valorCuota: p.valorCuota,
      notaCartera: p.notaCartera,
      observacion: p.observacion,
      mesVencimiento: p.mesVencimiento,
      vtoSoat: p.vtoSoat?.toISOString() ?? null,
      dias,
      semaforo: semaforoVencimiento(dias),
      gestionada: p.gestionada,
      notaGestion: p.notaGestion,
      anexo: tipoAnexo(p.observacion),
    };
  });

  // Prórrogas e incrementos no se renuevan; contarlos como vencidos era el
  // motivo de que el encabezado exagerara el trabajo pendiente (ver
  // lib/calculos.ts).
  const renovables = vista.filter((p) => !p.anexo);
  const vencidas = renovables.filter((p) => p.dias != null && p.dias < 0).length;
  const proximas = renovables.filter(
    (p) => p.dias != null && p.dias >= 0 && p.dias <= 30
  ).length;
  // Del total en cartera, cuántos están vencidos ahora mismo: es lo que
  // explica por qué "vencidas" no incluye lo que uno esperaría. Contar el
  // total de la cartera (sin filtrar por vencimiento) confundía cuando la
  // mayoría de los anexos de un tipo no estaban vencidos: "8 incrementos" al
  // lado de "18 vencidas" sugería que los 8 pesaban ahí, cuando solo 1 lo
  // estaba.
  const anexosVencidos = vista.filter((p) => p.anexo && p.dias != null && p.dias < 0);
  const prorrogas = anexosVencidos.filter((p) => p.anexo === "PRORROGA").length;
  const incrementos = anexosVencidos.filter((p) => p.anexo === "INCREMENTO").length;
  const detalleAnexos = [
    prorrogas > 0 ? `${prorrogas} ${prorrogas === 1 ? "prórroga" : "prórrogas"}` : null,
    incrementos > 0 ? `${incrementos} ${incrementos === 1 ? "incremento" : "incrementos"}` : null,
  ].filter(Boolean);

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Vencimientos"
        descripcion={
          `${vencidas} pólizas vencidas pendientes de gestión · ` +
          `${proximas} vencen en los próximos 30 días` +
          (detalleAnexos.length > 0
            ? ` · ${detalleAnexos.join(" y ")} (no se renuevan)`
            : "")
        }
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
