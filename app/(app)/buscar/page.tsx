import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { diasAlVence, tipoAnexo, semaforoVencimiento } from "@/lib/calculos";
import { listasParaFormularios } from "@/lib/queries";
import { BusquedaResultados } from "@/components/busqueda-resultados";
import { fmtCOP, fmtFecha } from "@/lib/format";
import { exigirSesionPagina } from "@/lib/auth";
import {
  Card,
  CardTitle,
  EstadoPagoBadge,
  PageHeader,
  SemaforoBadge,
  Td,
  Th,
} from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function BuscarPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  // Antes de tocar la base: el layout no alcanza a cortar el render.
  await exigirSesionPagina();

  const q = (searchParams.q ?? "").trim();

  // Los datos del informe vienen en mayúsculas; se buscan las variantes del
  // término para que funcione igual en Postgres y en SQLite (sin `mode`).
  const variantes = Array.from(new Set([q, q.toUpperCase(), q.toLowerCase()]));
  const filtro = q
    ? {
        OR: variantes.flatMap((v) => [
          { numero: { contains: v } },
          { asegurado: { contains: v } },
          { ccNit: { contains: v } },
        ]),
      }
    : undefined;

  // Las listas hacen falta para el modal de gestionar, que ahora se abre desde
  // aquí; se piden siempre porque no dependen del término buscado.
  const listas = await listasParaFormularios();

  const [polizas, otras, canceladas] = q
    ? await Promise.all([
        prisma.policy.findMany({ where: filtro, take: 100, orderBy: { asegurado: "asc" } }),
        prisma.otherPolicy.findMany({ where: filtro, take: 100, orderBy: { asegurado: "asc" } }),
        prisma.cancellation.findMany({
          where: filtro,
          take: 100,
          orderBy: [{ fechaCancelacion: "desc" }, { fechaRenovacion: "desc" }],
        }),
      ])
    : [[], [], []];

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Búsqueda"
        descripcion="Por número de póliza, nombre de asegurado o CC/NIT, en la cartera activa, en otras pólizas y en las cancelaciones"
      />

      <form method="get" className="flex max-w-xl gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Ej: 23847918, BALLARD, 900123456…"
          className="flex-1 rounded-md border border-line-axis bg-white px-3 py-2 text-sm focus:border-brand focus:outline-none"
          autoFocus
        />
        <button
          type="submit"
          className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
        >
          Buscar
        </button>
      </form>

      {q && (
        <>
          <Card>
            <CardTitle>
              Cartera activa · {polizas.length} resultado{polizas.length !== 1 && "s"}
            </CardTitle>
            {polizas.length === 0 ? (
              <p className="text-sm text-ink-muted">Sin coincidencias en la cartera activa.</p>
            ) : (
              <BusquedaResultados
                listas={listas}
                polizas={polizas.map((p) => {
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
                    dias,
                    semaforo: semaforoVencimiento(dias),
                    gestionada: p.gestionada,
                    notaGestion: p.notaGestion,
                    anexo: tipoAnexo(p.observacion, p.ramo),
                  };
                })}
              />
            )}
          </Card>

          <Card>
            <CardTitle>
              Otras pólizas · {otras.length} resultado{otras.length !== 1 && "s"}
            </CardTitle>
            {otras.length === 0 ? (
              <p className="text-sm text-ink-muted">Sin coincidencias en otras pólizas.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse whitespace-nowrap">
                  <thead>
                    <tr>
                      <Th>Asegurado</Th>
                      <Th>CC/NIT</Th>
                      <Th>Ramo</Th>
                      <Th>Póliza</Th>
                      <Th derecha>Prima neta</Th>
                      <Th derecha>Prima total</Th>
                      <Th>Vencimiento</Th>
                      <Th>Estado</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {otras.map((p) => (
                      <tr key={p.id} className="hover:bg-surface-page">
                        <Td className="font-medium">{p.asegurado}</Td>
                        <Td>{p.ccNit ?? "—"}</Td>
                        <Td>{p.ramo}</Td>
                        <Td>{p.numero}</Td>
                        <Td derecha>{fmtCOP(p.primaNeta)}</Td>
                        <Td derecha>{fmtCOP(p.primaTotal)}</Td>
                        <Td>{fmtFecha(p.vencimiento)}</Td>
                        <Td>
                          <EstadoPagoBadge estado={p.estadoPago} />
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card>
            <CardTitle
              accion={
                canceladas.length > 0 ? (
                  <Link
                    href="/cancelaciones"
                    className="text-xs font-medium text-brand hover:underline"
                  >
                    Ver histórico
                  </Link>
                ) : undefined
              }
            >
              Cancelaciones · {canceladas.length} resultado{canceladas.length !== 1 && "s"}
            </CardTitle>
            {canceladas.length === 0 ? (
              <p className="text-sm text-ink-muted">Sin coincidencias en las cancelaciones.</p>
            ) : (
              <div className="overflow-x-auto scroll-fino">
                <table className="w-full border-collapse whitespace-nowrap">
                  <thead>
                    <tr>
                      <Th>Asegurado</Th>
                      <Th>CC/NIT</Th>
                      <Th>Ramo</Th>
                      <Th>Aseguradora</Th>
                      <Th>Póliza</Th>
                      <Th derecha>Prima neta</Th>
                      <Th>Fecha renovación</Th>
                      <Th>Fecha cancelación</Th>
                      <Th>Motivo</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {canceladas.map((c) => (
                      <tr key={c.id} className="hover:bg-surface-page">
                        <Td className="font-medium">
                          {c.asegurado ?? "—"}
                          {c.manual && (
                            <span
                              className="ml-1.5 rounded bg-brand-light/60 px-1 py-0.5 text-[10px] font-semibold text-brand-dark"
                              title="Registrada desde la aplicación"
                            >
                              app
                            </span>
                          )}
                        </Td>
                        <Td>{c.ccNit ?? "—"}</Td>
                        <Td>{c.ramo}</Td>
                        <Td>{c.aseguradora ?? "—"}</Td>
                        <Td>{c.numero}</Td>
                        <Td derecha>{fmtCOP(c.primaNeta)}</Td>
                        <Td>{fmtFecha(c.fechaRenovacion)}</Td>
                        <Td>{fmtFecha(c.fechaCancelacion)}</Td>
                        <Td>
                          <div
                            className="max-w-[220px] truncate text-xs text-ink-secondary"
                            title={c.motivo ?? undefined}
                          >
                            {c.motivo ?? "—"}
                          </div>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
