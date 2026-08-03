import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { hoyUTC } from "@/lib/calculos";
import { diasSinMovimiento, type EstadoSiniestro } from "@/lib/siniestros";
import { Card, EstadoVacio, PageHeader } from "@/components/ui";
import { SiniestrosTabla, SiniestroVista } from "@/components/siniestros-tabla";
import { exigirSesionPagina } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SiniestrosPage() {
  // Antes de tocar la base: el layout no alcanza a cortar el render.
  await exigirSesionPagina();

  const hoy = hoyUTC();
  const siniestros = await prisma.siniestro.findMany({
    orderBy: { fechaUltimoSeguimiento: "asc" },
  });

  const vista: SiniestroVista[] = siniestros.map((s) => ({
    id: s.id,
    asegurado: s.asegurado,
    nit: s.nit,
    administrador: s.administrador,
    firmaAdministracion: s.firmaAdministracion,
    celular: s.celular,
    email: s.email,
    aseguradora: s.aseguradora,
    poliza: s.poliza,
    cobertura: s.cobertura,
    resumen: s.resumen,
    radicado: s.radicado,
    estado: s.estado as EstadoSiniestro,
    estadoTexto: s.estadoTexto,
    observaciones: s.observaciones,
    valorSiniestro: s.valorSiniestro,
    valorLiquidar: s.valorLiquidar,
    valorPagado: s.valorPagado,
    deducible: s.deducible,
    responsable: s.responsable,
    fechaOcurrencia: s.fechaOcurrencia?.toISOString() ?? null,
    fechaAvisoCompania: s.fechaAvisoCompania?.toISOString() ?? null,
    fechaUltimoSeguimiento: s.fechaUltimoSeguimiento?.toISOString() ?? null,
    fechaPago: s.fechaPago?.toISOString() ?? null,
    dias: diasSinMovimiento(s, hoy),
    cerrado: s.cerrado,
    origen: s.origen,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Siniestros"
        descripcion={`${vista.length} siniestros en una sola lista · antes repartidos en 47 hojas de Excel`}
      />

      {vista.length === 0 ? (
        <Card>
          <EstadoVacio
            titulo="Todavía no hay siniestros cargados"
            descripcion="Importe el archivo de seguimiento de siniestros (el que tiene una hoja por cliente) y, si lo desea, el resumen SINIESTROS.xlsx para traer el responsable y las cifras."
            accion={
              <Link
                href="/importar"
                className="inline-flex items-center rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
              >
                Importar siniestros
              </Link>
            }
          />
        </Card>
      ) : (
        <SiniestrosTabla siniestros={vista} />
      )}
    </div>
  );
}
