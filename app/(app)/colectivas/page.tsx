import { prisma } from "@/lib/prisma";
import { exigirColectivasPagina } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { ColectivasPanel } from "@/components/colectivas-panel";
import { RAMOS_COLECTIVOS, empresaExcluida } from "@/lib/colectivas";

export const dynamic = "force-dynamic";

/**
 * Gestión de colectivas por empresa.
 *
 * Las pólizas del informe se traen para poder ligarlas a cada empresa, pero el
 * detalle de personas vive en las tablas propias del módulo: el informe de
 * producción trae la colectiva como un total y aquí hace falta saber quién
 * está cubierto.
 */
export default async function ColectivasPage() {
  await exigirColectivasPagina();

  const [empresas, amparados, novedades, polizas] = await Promise.all([
    prisma.empresaColectiva.findMany({ orderBy: { nombre: "asc" } }),
    prisma.amparadoColectiva.findMany({ orderBy: [{ nombreEmpleado: "asc" }, { parentesco: "asc" }] }),
    prisma.novedadColectiva.findMany({ orderBy: { fecha: "desc" }, take: 300 }),
    prisma.policy.findMany({
      where: { ramo: { in: RAMOS_COLECTIVOS } },
      select: {
        numero: true, ramo: true, asegurado: true, aseguradora: true,
        primaNeta: true, vencimiento: true,
      },
      orderBy: { asegurado: "asc" },
    }),
  ]);

  // Financrea se gestiona aparte: no entra ni como póliza sugerida.
  const polizasVista = polizas
    .filter((p) => !empresaExcluida(p.asegurado))
    .map((p) => ({
      numero: p.numero,
      ramo: p.ramo,
      asegurado: p.asegurado,
      aseguradora: p.aseguradora,
      primaNeta: p.primaNeta,
      vencimiento: p.vencimiento?.toISOString() ?? null,
    }));

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Colectivas"
        descripcion="Pólizas de empresa: quién está cubierto, quién entra y quién sale."
      />
      <ColectivasPanel
        empresas={empresas.map((e) => ({
          id: e.id,
          nombre: e.nombre,
          nit: e.nit,
          carpeta: e.carpeta,
          nota: e.nota,
        }))}
        amparados={amparados.map((a) => ({
          id: a.id,
          empresaId: a.empresaId,
          polizaNumero: a.polizaNumero,
          ramo: a.ramo,
          plan: a.plan,
          docEmpleado: a.docEmpleado,
          nombreEmpleado: a.nombreEmpleado,
          docAmparado: a.docAmparado,
          nombreAmparado: a.nombreAmparado,
          parentesco: a.parentesco,
          valorAsegurado: a.valorAsegurado,
          primaMensual: a.primaMensual,
          estado: a.estado,
          radicado: a.radicado,
          observacion: a.observacion,
          fechaIngreso: a.fechaIngreso?.toISOString() ?? null,
          fechaRetiro: a.fechaRetiro?.toISOString() ?? null,
        }))}
        novedades={novedades.map((n) => ({
          id: n.id,
          empresaId: n.empresaId,
          amparadoId: n.amparadoId,
          tipo: n.tipo,
          fecha: n.fecha.toISOString(),
          estado: n.estado,
          radicado: n.radicado,
          nombreAmparado: n.nombreAmparado,
          docAmparado: n.docAmparado,
          nota: n.nota,
        }))}
        polizas={polizasVista}
      />
    </div>
  );
}
