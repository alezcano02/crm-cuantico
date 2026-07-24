import { aniosDisponibles, datosSeguimiento } from "@/lib/queries";
import { calcularSeguimiento, hoyUTC, nivelCumplimiento } from "@/lib/calculos";
import { MESES_CORTO } from "@/lib/constants";
import { fmtCOPCompact, fmtPct } from "@/lib/format";
import { Card, CardTitle, StatCard } from "@/components/ui";
import { CumplimientoChart } from "@/components/charts";
import { SeguimientoSelector } from "@/components/seguimiento-selector";
import { TablaSeguimiento } from "@/components/tabla-seguimiento";

export const dynamic = "force-dynamic";

export default async function SeguimientoPage({
  searchParams,
}: {
  searchParams: { anio?: string; ramo?: string };
}) {
  const anios = await aniosDisponibles();
  const anioDefecto = hoyUTC().getUTCFullYear();
  const anio = Number(searchParams.anio) || (anios.includes(anioDefecto) ? anioDefecto : anios[0] ?? anioDefecto);
  const datos = await datosSeguimiento();
  const seguimiento = calcularSeguimiento(datos, anio);

  const ramoParam = (searchParams.ramo ?? "CONSOLIDADO").toUpperCase();
  const esConsolidado = ramoParam === "CONSOLIDADO" || !seguimiento.porRamo.has(ramoParam);
  const filas = esConsolidado
    ? seguimiento.consolidado
    : seguimiento.porRamo.get(ramoParam)!;

  const total = filas[12];
  const nivel = nivelCumplimiento(total.cumplimiento);

  const serieCumplimiento = filas.slice(0, 12).map((f, i) => ({
    mes: MESES_CORTO[i],
    cumplimiento: f.cumplimiento,
  }));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">Seguimiento de producción</h1>
          <p className="text-sm text-ink-muted">
            Meta: crecer 15% por ramo y mes vs base del año anterior · Producción{" "}
            {anio} = vencimientos {anio + 1}
          </p>
        </div>
        <SeguimientoSelector
          anios={anios}
          ramos={seguimiento.ramos}
          anio={anio}
          ramo={esConsolidado ? "CONSOLIDADO" : ramoParam}
        />
      </header>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard
          etiqueta={`Meta ${anio}`}
          valor={fmtCOPCompact(total.meta)}
          detalle={`Base ${fmtCOPCompact(total.base)} + prod. cancelada, ×1,15`}
        />
        <StatCard etiqueta={`Real ${anio}`} valor={fmtCOPCompact(total.real)} />
        <StatCard
          etiqueta="Producción neta"
          valor={fmtCOPCompact(total.neta)}
          detalle={`Cancelaciones ${fmtCOPCompact(total.cancelaciones)}`}
        />
        <StatCard
          etiqueta="% Cumplimiento"
          valor={fmtPct(total.cumplimiento)}
          acento={nivel === "VERDE" ? "verde" : nivel === "AMARILLO" ? "amarillo" : "rojo"}
        />
      </div>

      <Card>
        <CardTitle>
          Cumplimiento mensual · {esConsolidado ? "Consolidado" : ramoParam} · {anio}
        </CardTitle>
        <CumplimientoChart data={serieCumplimiento} />
      </Card>

      <Card>
        <CardTitle>
          {esConsolidado ? "Seguimiento mensual consolidado" : `Detalle mensual · ${ramoParam}`}
        </CardTitle>
        <TablaSeguimiento filas={filas} anioBase={anio - 1} anio={anio} />
      </Card>
    </div>
  );
}
