import { prisma } from "@/lib/prisma";
import { datosSeguimiento } from "@/lib/queries";
import {
  calcularSeguimiento,
  hoyUTC,
  nivelCumplimiento,
  primaPorRamo,
} from "@/lib/calculos";
import { MESES, MESES_CORTO } from "@/lib/constants";
import { fmtCOP, fmtCOPCompact, fmtFecha, fmtNum, fmtPct } from "@/lib/format";
import { Card, CardTitle, StatCard, Td, Th } from "@/components/ui";
import { MetaRealChart, RamoBarChart } from "@/components/charts";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const hoy = hoyUTC();
  const anio = hoy.getUTCFullYear();

  const [datos, agregados, canceladasMes] = await Promise.all([
    datosSeguimiento(),
    prisma.policy.aggregate({
      _count: true,
      _sum: { primaNeta: true, primaTotal: true },
    }),
    prisma.cancellation.findMany({
      where: {
        fechaCancelacion: {
          gte: new Date(Date.UTC(anio, hoy.getUTCMonth(), 1)),
          lt: new Date(Date.UTC(anio, hoy.getUTCMonth() + 1, 1)),
        },
      },
      orderBy: { fechaCancelacion: "desc" },
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

  const sinDatos = agregados._count === 0;

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-bold">Dashboard</h1>
          <p className="text-sm text-ink-muted">
            Producción {anio} · corte {fmtFecha(hoy)}
          </p>
        </div>
        <Link
          href="/seguimiento"
          className="text-sm font-medium text-brand hover:underline"
        >
          Ver seguimiento completo →
        </Link>
      </header>

      {sinDatos && (
        <Card className="border-status-warning/40 bg-status-warning/5">
          <p className="text-sm">
            Aún no hay datos cargados.{" "}
            <Link href="/importar" className="font-semibold text-brand hover:underline">
              Importe el Excel de producción
            </Link>{" "}
            o ejecute <code className="rounded bg-surface-page px-1">npm run db:seed</code>{" "}
            para cargar datos de ejemplo.
          </p>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard
          etiqueta="Pólizas activas"
          valor={fmtNum(agregados._count)}
          detalle="Cartera vigente (hoja DATOS)"
        />
        <StatCard
          etiqueta="Prima neta total"
          valor={fmtCOPCompact(agregados._sum.primaNeta ?? 0)}
          detalle={fmtCOP(agregados._sum.primaNeta ?? 0)}
        />
        <StatCard
          etiqueta="Prima total"
          valor={fmtCOPCompact(agregados._sum.primaTotal ?? 0)}
          detalle={fmtCOP(agregados._sum.primaTotal ?? 0)}
        />
        <StatCard
          etiqueta={`Cumplimiento ${anio}`}
          valor={fmtPct(total.cumplimiento)}
          detalle={`Neta ${fmtCOPCompact(total.neta)} de meta ${fmtCOPCompact(total.meta)}`}
          acento={nivel === "VERDE" ? "verde" : nivel === "AMARILLO" ? "amarillo" : "rojo"}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardTitle>Meta vs Real vs Producción neta · {anio}</CardTitle>
          <MetaRealChart data={serieMensual} />
        </Card>
        <Card>
          <CardTitle>Prima neta por ramo (cartera activa)</CardTitle>
          {ramos.length > 0 ? (
            <div className="max-h-[420px] overflow-y-auto">
              <RamoBarChart data={ramos} />
            </div>
          ) : (
            <p className="text-sm text-ink-muted">Sin datos.</p>
          )}
        </Card>
      </div>

      <Card>
        <CardTitle>
          Pólizas canceladas de {MESES[hoy.getUTCMonth()].toLowerCase()} · {anio}
        </CardTitle>
        {canceladasMes.length === 0 ? (
          <p className="text-sm text-ink-muted">
            Sin cancelaciones registradas este mes.
          </p>
        ) : (
          <div className="overflow-x-auto">
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
    </div>
  );
}
