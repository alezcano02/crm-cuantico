import { prisma } from "@/lib/prisma";
import { diasAlVence, tipoAnexo, semaforoVencimiento } from "@/lib/calculos";
import { listasParaFormularios } from "@/lib/queries";
import { Card, PageHeader } from "@/components/ui";
import { VencimientosTabla, PolizaVista } from "@/components/vencimientos-tabla";
import Link from "next/link";
import { exigirSesionPagina } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function VencimientosPage({
  searchParams,
}: {
  searchParams: { anio?: string };
}) {
  // Antes de tocar la base: el layout no alcanza a cortar el render.
  await exigirSesionPagina();

  /*
   * Sin ?anio se ve la cartera viva, que es para lo que sirve esta pantalla:
   * qué hay que renovar. Con ?anio se ve la FOTO de ese año de producción, que
   * es la única forma de revisar un año ya cerrado: las pólizas de 2025 siguen
   * existiendo en `Policy`, pero con el vencimiento ya movido a 2027 por la
   * renovación, así que preguntarle a la cartera qué venció en 2026 devuelve
   * un año mutilado. Ver el modelo `FotoPoliza`.
   */
  const anioFoto = /^\d{4}$/.test(searchParams.anio ?? "") ? Number(searchParams.anio) : null;

  const [polizas, listas, aniosConFoto] = await Promise.all([
    anioFoto != null
      ? prisma.fotoPoliza.findMany({
          where: { anioProduccion: anioFoto },
          orderBy: { vencimiento: "asc" },
        })
      : // Los recibos de una colectiva no se renuevan uno a uno —se renueva la
        // colectiva—, así que no son trabajo pendiente y no salen aquí. Viven
        // en el módulo de colectivas. Ver lib/mapa-colectivas.ts.
        prisma.policy.findMany({
          where: { colectivaDe: null },
          orderBy: { vencimiento: "asc" },
        }),
    listasParaFormularios(),
    prisma.fotoPoliza
      .groupBy({ by: ["anioProduccion"], orderBy: { anioProduccion: "desc" } })
      .then((r) => r.map((x) => x.anioProduccion)),
  ]);

  /*
   * La foto no guarda los campos de gestión ni los de contacto: es un registro
   * de producción, no la ficha viva de la póliza. Se rellenan en null en vez de
   * inventarlos, y la pantalla avisa de que está mirando un año cerrado.
   */
  const esFoto = anioFoto != null;
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
      fechaPago: "fechaPago" in p ? (p.fechaPago?.toISOString() ?? null) : null,
      fechaMaxPago: "fechaMaxPago" in p ? (p.fechaMaxPago?.toISOString() ?? null) : null,
      vencimiento: p.vencimiento?.toISOString() ?? null,
      fechaNacimiento:
        "fechaNacimiento" in p ? (p.fechaNacimiento?.toISOString() ?? null) : null,
      correo: "correo" in p ? p.correo : null,
      celular: "celular" in p ? p.celular : null,
      valorCuota: "valorCuota" in p ? p.valorCuota : null,
      notaCartera: "notaCartera" in p ? p.notaCartera : null,
      observacion: p.observacion,
      mesVencimiento: "mesVencimiento" in p ? p.mesVencimiento : null,
      vtoSoat: "vtoSoat" in p ? (p.vtoSoat?.toISOString() ?? null) : null,
      dias,
      semaforo: semaforoVencimiento(dias),
      gestionada: "gestionada" in p ? p.gestionada : false,
      notaGestion: "notaGestion" in p ? p.notaGestion : null,
      anexo: tipoAnexo(p.observacion, p.ramo),
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
  // Singular y plural de cada clase, para que el encabezado se lea como lo
  // escribiría una persona y no como «1 prórrogas».
  const NOMBRE: Record<string, [string, string]> = {
    PRORROGA: ["prórroga", "prórrogas"],
    INCREMENTO: ["incremento", "incrementos"],
    MODIFICACION: ["modificación", "modificaciones"],
    CUMPLIMIENTO: ["de cumplimiento", "de cumplimiento"],
    RC: ["de RC", "de RC"],
    VIAJE: ["de viaje", "de viaje"],
  };
  const detalleAnexos = Object.entries(
    anexosVencidos.reduce<Record<string, number>>((acc, p) => {
      if (p.anexo) acc[p.anexo] = (acc[p.anexo] ?? 0) + 1;
      return acc;
    }, {})
  )
    .sort((a, b) => b[1] - a[1])
    .map(([tipo, n]) => `${n} ${NOMBRE[tipo]?.[n === 1 ? 0 : 1] ?? tipo.toLowerCase()}`);

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Vencimientos"
        descripcion={
          esFoto
            ? `Foto de la producción ${anioFoto}: ${vista.length} pólizas que vencieron en ${anioFoto! + 1}`
            : `${vencidas} pólizas vencidas pendientes de gestión · ` +
              `${proximas} vencen en los próximos 30 días` +
              (detalleAnexos.length > 0
                ? ` · ${detalleAnexos.join(" y ")} (no se renuevan)`
                : "")
        }
      />

      {/* Años cerrados. Solo aparecen los que tienen foto: sin ella la consulta
          daría un año mutilado por las renovaciones, y es mejor no ofrecerla
          que ofrecer una cifra falsa. */}
      {aniosConFoto.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-ink-secondary">Ver:</span>
          <Link
            href="/vencimientos"
            className={
              esFoto
                ? "rounded-lg border border-line-axis px-2.5 py-1.5 text-ink-secondary hover:bg-surface-page"
                : "rounded-lg bg-brand px-2.5 py-1.5 font-medium text-white"
            }
          >
            Cartera actual
          </Link>
          {aniosConFoto.map((a) => (
            <Link
              key={a}
              href={`/vencimientos?anio=${a}`}
              className={
                anioFoto === a
                  ? "rounded-lg bg-brand px-2.5 py-1.5 font-medium text-white"
                  : "rounded-lg border border-line-axis px-2.5 py-1.5 text-ink-secondary hover:bg-surface-page"
              }
            >
              Producción {a}
            </Link>
          ))}
        </div>
      )}

      {esFoto && (
        <div className="rounded-md border border-status-warning/40 bg-status-warning/5 px-4 py-2.5 text-sm text-ink-secondary">
          Está viendo un año ya cerrado. La foto guarda la producción —póliza,
          ramo, asegurado, prima, vencimiento— pero no los datos de gestión ni
          de contacto, así que esas columnas salen vacías y los botones de
          gestión no aplican.
        </div>
      )}

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
