import { prisma } from "@/lib/prisma";
import { exigirSesionPagina } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { ProspectosTabla } from "@/components/prospectos-tabla";
import { diasParaInicio, type ProspectoVista } from "@/lib/prospectos";
import { hoyUTC } from "@/lib/calculos";

export const dynamic = "force-dynamic";

/**
 * Cotizaciones que todavía no son póliza.
 *
 * Vive aparte de la cartera porque un prospecto no tiene número de póliza, ni
 * prima, ni vencimiento: lo que tiene es una fecha en la que arranca la
 * vigencia que se está cotizando, y pasada esa fecha la oportunidad se pierde
 * sola. Por eso la lista se ordena por lo que falta para esa fecha.
 */
export default async function ProspectosPage() {
  await exigirSesionPagina();

  const hoy = hoyUTC();
  const prospectos = await prisma.prospecto.findMany({ orderBy: { fechaInicio: "asc" } });

  const vista: ProspectoVista[] = prospectos.map((p) => ({
    id: p.id,
    nombre: p.nombre,
    fechaInicio: p.fechaInicio?.toISOString() ?? null,
    administrador: p.administrador,
    compania: p.compania,
    estado: p.estado,
    situacion: p.situacion,
    asesor: p.asesor,
    nota: p.nota,
    polizaNumero: p.polizaNumero,
    historia: p.historia,
    ultimoSeguimiento: p.ultimoSeguimiento?.toISOString() ?? null,
    dias: diasParaInicio(p.fechaInicio, hoy),
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Prospectos"
        descripcion="Cotizaciones en trámite y las que no se consiguieron. Ordenadas por lo que falta para que arranque la vigencia."
      />
      <ProspectosTabla prospectos={vista} />
    </div>
  );
}
