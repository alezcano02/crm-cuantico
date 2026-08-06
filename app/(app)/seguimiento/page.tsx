import { aniosDisponibles, datosSeguimiento, listaValores } from "@/lib/queries";
import {
  PRIMER_ANIO,
  calcularSeguimiento,
  hoyUTC,
  indiceMes,
  nivelCumplimiento,
} from "@/lib/calculos";
import { MESES_CORTO } from "@/lib/constants";
import { fmtCOPCompact, fmtPct } from "@/lib/format";
import { Card, CardTitle, PageHeader, StatCard } from "@/components/ui";
import { CumplimientoChart, ProduccionMensualChart } from "@/components/charts";
import { SeguimientoSelector } from "@/components/seguimiento-selector";
import { MES_TITULO, TablaSeguimiento } from "@/components/tabla-seguimiento";
import { exigirSesionPagina } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SeguimientoPage({
  searchParams,
}: {
  searchParams: { anio?: string; ramo?: string; aseguradora?: string; mes?: string };
}) {
  // Antes de tocar la base: el layout no alcanza a cortar el render.
  await exigirSesionPagina();

  const anios = await aniosDisponibles();
  const anioDefecto = hoyUTC().getUTCFullYear();
  const anio =
    Number(searchParams.anio) ||
    (anios.includes(anioDefecto) ? anioDefecto : anios[0] ?? anioDefecto);

  const datos = await datosSeguimiento();

  // Aseguradoras disponibles: LISTAS + las presentes en la cartera
  const aseguradoras = Array.from(
    new Set([
      ...(await listaValores("ASEGURADORA")),
      ...datos.polizas.map((p) => p.aseguradora).filter((a): a is string => !!a),
    ])
  ).sort((a, b) => a.localeCompare(b, "es"));

  // --- Filtro por aseguradora: se aplica sobre los datos fuente ---
  const aseguradora = (searchParams.aseguradora ?? "").trim();
  const datosFiltrados = aseguradora
    ? {
        polizas: datos.polizas.filter((p) => (p.aseguradora ?? "") === aseguradora),
        cancelaciones: datos.cancelaciones.filter(
          (c) => (c.aseguradora ?? "") === aseguradora
        ),
        historicas2025: datos.historicas2025,
      }
    : datos;

  // La hoja BASE 2025 no registra aseguradora: con ese filtro activo, la base
  // (y por tanto meta y % cumplimiento) solo es calculable para años cuya base
  // proviene de la propia cartera (anio > PRIMER_ANIO).
  const mostrarBase = !aseguradora || anio > PRIMER_ANIO;

  const seguimiento = calcularSeguimiento(datosFiltrados, anio);

  const ramoParam = (searchParams.ramo ?? "CONSOLIDADO").toUpperCase();
  const esConsolidado = ramoParam === "CONSOLIDADO" || !seguimiento.porRamo.has(ramoParam);
  const filas12 = esConsolidado
    ? seguimiento.consolidado
    : seguimiento.porRamo.get(ramoParam)!;

  // --- Filtro por mes: restringe tabla y tarjetas a ese mes ---
  const mesParam = (searchParams.mes ?? "").toUpperCase();
  const idxMes = indiceMes(mesParam);
  const hayMes = idxMes >= 0;
  const filasVista = hayMes ? [filas12[idxMes]] : filas12;
  const resumen = hayMes ? filas12[idxMes] : filas12[12];
  const nivel = nivelCumplimiento(resumen.cumplimiento);

  // --- Desglose por ramo del mes elegido ---
  // Con un mes seleccionado la tabla de detalle se queda en una sola fila, así
  // que se abre el mes por ramo: la meta de cada uno, no solo la consolidada.
  // Se omiten los ramos sin nada ese mes (ni base, ni meta, ni producción, ni
  // cancelaciones); listarlos en cero solo alarga la tabla.
  const ramosDelMes = hayMes
    ? seguimiento.ramos
        .map((r) => ({ ramo: r, fila: seguimiento.porRamo.get(r)![idxMes] }))
        .filter(
          ({ fila }) =>
            fila.base !== 0 ||
            fila.meta !== 0 ||
            fila.real !== 0 ||
            fila.cancelaciones !== 0
        )
        // De mayor a menor meta: primero dónde hay más por cumplir. Sin base
        // calculable (filtro de aseguradora) se ordena por producción real.
        .sort((a, b) =>
          mostrarBase ? b.fila.meta - a.fila.meta : b.fila.real - a.fila.real
        )
    : [];
  const ramosOcultos = hayMes ? seguimiento.ramos.length - ramosDelMes.length : 0;

  const serieCumplimiento = filas12.slice(0, 12).map((f, i) => ({
    mes: MESES_CORTO[i],
    cumplimiento: f.cumplimiento,
  }));
  const serieReal = filas12.slice(0, 12).map((f, i) => ({
    mes: MESES_CORTO[i],
    real: f.real,
  }));

  // El mes no se incluye: los títulos de gráfico y tabla ya lo indican.
  const etiquetaVista = [esConsolidado ? "Consolidado" : ramoParam, aseguradora || null]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Seguimiento de producción"
        descripcion={`Meta: crecer 15% por ramo y mes vs base del año anterior · Producción ${anio} = vencimientos ${anio + 1}`}
      />

      <SeguimientoSelector
        anios={anios}
        ramos={seguimiento.ramos}
        aseguradoras={aseguradoras}
        anio={anio}
        ramo={esConsolidado ? "CONSOLIDADO" : ramoParam}
        aseguradora={aseguradora}
        mes={hayMes ? mesParam : ""}
      />

      {!mostrarBase && (
        <div className="rounded-md border border-status-warning/40 bg-status-warning/5 px-4 py-2.5 text-sm text-ink-secondary">
          La base {anio - 1} (hoja BASE 2025) no registra aseguradora, por lo que
          la meta y el % de cumplimiento no pueden desglosarse con este filtro.
          Se muestran la producción real, nuevos, renovaciones y cancelaciones de{" "}
          <b>{aseguradora}</b>.
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard
          etiqueta={`Meta ${hayMes ? MES_TITULO[mesParam] : anio}`}
          valor={mostrarBase ? fmtCOPCompact(resumen.meta) : "—"}
          detalle={
            mostrarBase
              ? `Base ${fmtCOPCompact(resumen.base)} + prod. cancelada, ×1,15`
              : "No disponible con filtro de aseguradora"
          }
        />
        <StatCard
          etiqueta={`Real ${hayMes ? MES_TITULO[mesParam] : anio}`}
          valor={fmtCOPCompact(resumen.real)}
          detalle={`Nuevos ${fmtCOPCompact(resumen.nuevos)} · Renov. ${fmtCOPCompact(resumen.renovaciones)}`}
        />
        <StatCard
          etiqueta="Producción neta"
          valor={fmtCOPCompact(resumen.neta)}
          detalle={`Cancelaciones ${fmtCOPCompact(resumen.cancelaciones)}`}
        />
        <StatCard
          etiqueta="% Cumplimiento"
          valor={mostrarBase ? fmtPct(resumen.cumplimiento) : "—"}
          acento={
            !mostrarBase
              ? undefined
              : nivel === "VERDE"
                ? "verde"
                : nivel === "AMARILLO"
                  ? "amarillo"
                  : "rojo"
          }
        />
      </div>

      <Card>
        <CardTitle>
          {mostrarBase ? "Cumplimiento mensual" : "Producción real mensual"} · {etiquetaVista} · {anio}
        </CardTitle>
        {mostrarBase ? (
          <CumplimientoChart data={serieCumplimiento} />
        ) : (
          <ProduccionMensualChart data={serieReal} />
        )}
      </Card>

      <Card>
        <CardTitle>
          {hayMes ? `Detalle de ${MES_TITULO[mesParam]}` : "Detalle mensual"} · {etiquetaVista}
        </CardTitle>
        <TablaSeguimiento
          filas={filasVista}
          anioBase={anio - 1}
          anio={anio}
          mostrarBase={mostrarBase}
        />
      </Card>

      {hayMes && esConsolidado && (
        <Card>
          <CardTitle>
            {mostrarBase ? "Metas por ramo" : "Producción por ramo"} ·{" "}
            {MES_TITULO[mesParam]} {anio}
            {aseguradora ? ` · ${aseguradora}` : ""}
          </CardTitle>
          {ramosDelMes.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-muted">
              Ningún ramo tiene base, meta ni producción en{" "}
              {MES_TITULO[mesParam]} de {anio}.
            </p>
          ) : (
            <>
              <TablaSeguimiento
                filas={[
                  ...ramosDelMes.map((r) => r.fila),
                  seguimiento.consolidado[idxMes],
                ]}
                etiquetas={[...ramosDelMes.map((r) => r.ramo), "TOTAL"]}
                columna="Ramo"
                anioBase={anio - 1}
                anio={anio}
                mostrarBase={mostrarBase}
              />
              {ramosOcultos > 0 && (
                <p className="mt-2 text-xs text-ink-muted">
                  Se omiten {ramosOcultos}{" "}
                  {ramosOcultos === 1 ? "ramo" : "ramos"} sin base, meta ni
                  producción en {MES_TITULO[mesParam]}.
                </p>
              )}
            </>
          )}
        </Card>
      )}
    </div>
  );
}
