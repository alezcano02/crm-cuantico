import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { datosSeguimiento, resumenOperativo } from "@/lib/queries";
import {
  calcularSeguimiento,
  hoyUTC,
  nivelCumplimiento,
  primaPorRamo,
} from "@/lib/calculos";
import { MESES, MESES_CORTO } from "@/lib/constants";
import { fmtCOP, fmtCOPCompact, fmtFecha, fmtNum, fmtPct } from "@/lib/format";
import {
  Card,
  CardTitle,
  EstadoVacio,
  PageHeader,
  Progreso,
  StatCard,
  Td,
  Th,
} from "@/components/ui";
import { MetaRealChart, RamoBarChart } from "@/components/charts";
import { exigirSesionPagina } from "@/lib/auth";
import {
  IconCalendario,
  IconCancelar,
  IconCartera,
  IconDinero,
  IconFlecha,
  IconRegalo,
  IconRenovar,
} from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  // Antes de tocar la base: el layout no alcanza a cortar el render.
  await exigirSesionPagina();

  const hoy = hoyUTC();
  const anio = hoy.getUTCFullYear();

  const [datos, agregados, operativo, canceladasMes] = await Promise.all([
    datosSeguimiento(),
    prisma.policy.aggregate({
      _count: true,
      _sum: { primaNeta: true, primaTotal: true },
    }),
    resumenOperativo(),
    prisma.cancellation.findMany({
      where: {
        fechaCancelacion: {
          gte: new Date(Date.UTC(anio, hoy.getUTCMonth(), 1)),
          lt: new Date(Date.UTC(anio, hoy.getUTCMonth() + 1, 1)),
        },
      },
      orderBy: { fechaCancelacion: "desc" },
      take: 10,
    }),
  ]);

  const seguimiento = calcularSeguimiento(datos, anio);
  const total = seguimiento.consolidado[12]; // fila TOTAL
  const nivel = nivelCumplimiento(total.cumplimiento);
  const ramos = primaPorRamo(datos.polizas);

  const serieMensual = seguimiento.consolidado.slice(0, 12).map((f, i) => ({
    mes: MESES_CORTO[i],
    meta: f.meta,
    real: f.real,
    neta: f.neta,
  }));

  // Cumplimiento por ramo (los de mayor meta), para ver dónde está el rezago
  const porRamo = seguimiento.ramos
    .map((r) => {
      const t = seguimiento.porRamo.get(r)![12];
      return { ramo: r, meta: t.meta, neta: t.neta, cumplimiento: t.cumplimiento };
    })
    .filter((r) => r.meta > 0)
    .sort((a, b) => b.meta - a.meta)
    .slice(0, 8);

  const sinDatos = agregados._count === 0;
  const faltante = Math.max(0, total.meta - total.neta);

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Dashboard"
        descripcion={`Producción ${anio} · corte ${fmtFecha(hoy)}`}
      >
        <Link
          href="/seguimiento"
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-dark"
        >
          Ver seguimiento
          <IconFlecha className="h-4 w-4" />
        </Link>
      </PageHeader>

      {sinDatos ? (
        <Card>
          <EstadoVacio
            titulo="Aún no hay datos cargados"
            descripcion="Importe el informe de producción en Excel para ver la cartera, los vencimientos y el cumplimiento de metas."
            accion={
              <Link
                href="/importar"
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
              >
                Importar datos
              </Link>
            }
          />
        </Card>
      ) : (
        <>
          {/* ---------------- Requiere atención ---------------- */}
          <section>
            <h2 className="mb-2.5 text-[13px] font-semibold tracking-wide text-ink-secondary">
              Requiere atención
            </h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
              <StatCard
                etiqueta="Vencidas sin renovar"
                valor={fmtNum(operativo.vencidas)}
                detalle={`${operativo.sinGestionar} sin gestionar`}
                acento={operativo.vencidas > 0 ? "rojo" : "verde"}
                href="/vencimientos"
                Icono={IconRenovar}
              />
              <StatCard
                etiqueta="Vencen en 30 días"
                valor={fmtNum(operativo.proximas)}
                detalle="Anticipar la renovación"
                acento={operativo.proximas > 0 ? "amarillo" : undefined}
                href="/vencimientos"
                Icono={IconCalendario}
              />
              <StatCard
                etiqueta="Pagos en mora"
                valor={fmtNum(operativo.mora)}
                detalle={`${fmtCOPCompact(operativo.primaMora)} por cobrar`}
                acento={operativo.mora > 0 ? "rojo" : "verde"}
                href="/cartera"
                Icono={IconDinero}
              />
              <StatCard
                etiqueta={`Canceladas en ${MESES[hoy.getUTCMonth()].toLowerCase()}`}
                valor={fmtNum(operativo.canceladasMes)}
                detalle="Cancelaciones del mes en curso"
                acento={operativo.canceladasMes > 0 ? "amarillo" : undefined}
                href="/cancelaciones"
                Icono={IconCancelar}
              />
              <StatCard
                etiqueta="Cumpleaños esta semana"
                valor={fmtNum(operativo.cumpleSemana)}
                detalle="Clientes para felicitar"
                acento={operativo.cumpleSemana > 0 ? "verde" : undefined}
                href="/cumpleanos"
                Icono={IconRegalo}
              />
            </div>
          </section>

          {/* ---------------- Indicadores del año ---------------- */}
          <section>
            <h2 className="mb-2.5 text-[13px] font-semibold tracking-wide text-ink-secondary">
              Cartera y producción {anio}
            </h2>
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <StatCard
                etiqueta="Pólizas activas"
                valor={fmtNum(agregados._count)}
                detalle="Cartera vigente"
                Icono={IconCartera}
              />
              <StatCard
                etiqueta="Prima neta administrada"
                valor={fmtCOPCompact(agregados._sum.primaNeta ?? 0)}
                detalle={fmtCOP(agregados._sum.primaNeta ?? 0)}
              />
              <StatCard
                etiqueta={`Producción neta ${anio}`}
                valor={fmtCOPCompact(total.neta)}
                detalle={`Meta ${fmtCOPCompact(total.meta)}`}
              />
              <Card className="!p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                  Cumplimiento {anio}
                </div>
                <div
                  className={`mt-2 text-[26px] font-bold leading-none tabla-num ${
                    nivel === "VERDE"
                      ? "text-status-good"
                      : nivel === "AMARILLO"
                        ? "text-[#b07800]"
                        : "text-status-critical"
                  }`}
                >
                  {fmtPct(total.cumplimiento)}
                </div>
                <div className="mt-2.5">
                  <Progreso valor={total.cumplimiento} nivel={nivel} />
                </div>
                <div className="mt-1.5 text-xs text-ink-muted">
                  {faltante > 0
                    ? `Faltan ${fmtCOPCompact(faltante)} para la meta`
                    : "Meta alcanzada"}
                </div>
              </Card>
            </div>
          </section>

          {/* ---------------- Gráficos ---------------- */}
          <div className="grid gap-5 xl:grid-cols-2">
            <Card>
              <CardTitle>Meta vs Real vs Producción neta · {anio}</CardTitle>
              <MetaRealChart data={serieMensual} />
            </Card>
            <Card>
              <CardTitle>Prima neta por ramo (cartera activa)</CardTitle>
              {ramos.length > 0 ? (
                <div className="max-h-[420px] overflow-y-auto scroll-fino">
                  <RamoBarChart data={ramos} />
                </div>
              ) : (
                <p className="text-sm text-ink-muted">Sin datos.</p>
              )}
            </Card>
          </div>

          {/* ---------------- Cumplimiento por ramo ---------------- */}
          <Card>
            <CardTitle
              accion={
                <Link
                  href="/seguimiento"
                  className="text-xs font-medium text-brand hover:underline"
                >
                  Ver detalle
                </Link>
              }
            >
              Cumplimiento por ramo · {anio}
            </CardTitle>
            {porRamo.length === 0 ? (
              <p className="text-sm text-ink-muted">Sin metas calculadas.</p>
            ) : (
              <div className="grid gap-x-8 gap-y-3.5 sm:grid-cols-2">
                {porRamo.map((r) => {
                  const n = nivelCumplimiento(r.cumplimiento);
                  return (
                    <Link
                      key={r.ramo}
                      href={`/seguimiento?ramo=${encodeURIComponent(r.ramo)}`}
                      className="group block"
                    >
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="truncate font-medium group-hover:text-brand">
                          {r.ramo}
                        </span>
                        <span className="shrink-0 tabla-num text-xs text-ink-muted">
                          {fmtCOPCompact(r.neta)} / {fmtCOPCompact(r.meta)}
                          <span
                            className={`ml-2 font-bold ${
                              n === "VERDE"
                                ? "text-status-good"
                                : n === "AMARILLO"
                                  ? "text-[#b07800]"
                                  : "text-status-critical"
                            }`}
                          >
                            {fmtPct(r.cumplimiento, 0)}
                          </span>
                        </span>
                      </div>
                      <div className="mt-1.5">
                        <Progreso valor={r.cumplimiento} nivel={n} />
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </Card>

          {/* ---------------- Cancelaciones del mes ---------------- */}
          <Card>
            <CardTitle
              accion={
                <Link
                  href="/cancelaciones"
                  className="text-xs font-medium text-brand hover:underline"
                >
                  Ver histórico
                </Link>
              }
            >
              Pólizas canceladas de {MESES[hoy.getUTCMonth()].toLowerCase()} · {anio}
            </CardTitle>
            {canceladasMes.length === 0 ? (
              <p className="text-sm text-ink-muted">
                Sin cancelaciones registradas este mes.
              </p>
            ) : (
              <div className="overflow-x-auto scroll-fino">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <Th>Póliza</Th>
                      <Th>Ramo</Th>
                      <Th>Asegurado</Th>
                      <Th>Aseguradora</Th>
                      <Th>Asesor</Th>
                      <Th>Fecha cancelación</Th>
                      <Th derecha>Prima neta</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {canceladasMes.map((c) => (
                      <tr key={c.id} className="hover:bg-surface-page">
                        <Td className="font-medium">{c.numero}</Td>
                        <Td>{c.ramo}</Td>
                        <Td>{c.asegurado ?? "—"}</Td>
                        <Td>{c.aseguradora ?? "—"}</Td>
                        <Td>{c.asesor ?? "—"}</Td>
                        <Td>{fmtFecha(c.fechaCancelacion)}</Td>
                        <Td derecha>{fmtCOP(c.primaNeta)}</Td>
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
