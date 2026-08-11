"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { fmtCOP, fmtFecha } from "@/lib/format";
import { Card, CardTitle, StatCard, Td, Th } from "@/components/ui";
import { BotonExportar } from "@/components/boton-exportar";
import { Paginacion, usePaginacion } from "@/components/paginacion";
import { PanelFiltros } from "@/components/panel-filtros";
import { FiltroSeleccion, FichasFiltros } from "@/components/filtro-seleccion";
import { BuscadorTabla } from "@/components/buscador-tabla";
import { FiltroMes } from "@/components/filtro-mes";
import type { FilaComision } from "@/lib/comisiones";

/*
 * Las pestañas parten por TIEMPO, no por estado de pago.
 *
 * Con el cronograma de cuotas, la pregunta útil dejó de ser «¿está pagada?» y
 * pasó a ser «¿ya se cobró o está por cobrarse?»: una póliza mensual está a la
 * vez causada por las cuotas que ya corrieron y esperada por las que faltan.
 * El estado de pago sigue viéndose en cada fila.
 */
type Pestania = "causadas" | "esperadas" | "todas";

const PESTANIAS: { id: Pestania; etiqueta: string }[] = [
  { id: "causadas", etiqueta: "Ya causadas" },
  { id: "esperadas", etiqueta: "Esperadas (por venir)" },
  { id: "todas", etiqueta: "Todas" },
];

function normalizar(v: string): string {
  return v.trim().replace(/\s+/g, " ");
}

function opciones(valores: (string | null)[]): string[] {
  return Array.from(
    new Set(valores.filter((v): v is string => !!v).map(normalizar).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, "es"));
}

/** Valor del selector de año que agrupa las pólizas sin fecha de vencimiento. */
const SIN_FECHA = "sin";

/**
 * Resume los meses de cobro de una fila para que quepan en una celda.
 *
 * Una mensual vista sin filtro de mes tiene doce; listarlos todos rompe la
 * tabla y no dice nada. Se muestra el rango y cuántos son.
 */
function resumenMeses(cuotas: { mes: string }[]): string {
  if (!cuotas.length) return "—";
  const meses = cuotas.map((c) => c.mes).sort();
  if (meses.length === 1) return meses[0];
  return `${meses[0]} → ${meses[meses.length - 1]} (${meses.length})`;
}

export function ComisionesTabla({
  filas,
  tarifas,
  anioDefecto,
  mesActual,
}: {
  filas: FilaComision[];
  tarifas: { ramo: string; pct: number }[];
  /** Año en curso, calculado en el servidor. */
  anioDefecto: number;
  /** Mes en curso (AAAA-MM): separa lo ya causado de lo esperado. */
  mesActual: string;
}) {
  const [pestania, setPestania] = useState<Pestania>("causadas");
  const [q, setQ] = useState("");
  /*
   * El año arranca en el actual y no en «todos» a propósito. Una liquidación
   * es de un ejercicio: mezclar los pagos de 2025 con los de 2026 daba un total
   * que no cuadra con nada que la aseguradora vaya a pagar.
   */
  const [anio, setAnio] = useState(String(anioDefecto));
  const [mes, setMes] = useState("");
  // Listas: se pueden cruzar varias de una misma categoría. Ver filtro-seleccion.
  const [selRamo, setSelRamo] = useState<string[]>([]);
  const [selAseguradora, setSelAseguradora] = useState<string[]>([]);
  const [selAsesor, setSelAsesor] = useState<string[]>([]);

  const ramos = useMemo(() => opciones(filas.map((f) => f.ramo)), [filas]);
  const aseguradoras = useMemo(() => opciones(filas.map((f) => f.aseguradora)), [filas]);
  const asesores = useMemo(() => opciones(filas.map((f) => f.asesor1)), [filas]);

  const anios = useMemo(
    () =>
      Array.from(new Set(filas.flatMap((f) => f.cronograma.map((c) => c.anio)))).sort(
        (a, b) => b - a
      ),
    [filas]
  );
  /** Sin vencimiento no hay vigencia y por tanto no hay cronograma posible. */
  const sinFecha = useMemo(() => filas.filter((f) => f.cronograma.length === 0).length, [filas]);

  /** Solo los meses del año elegido: si no, el desplegable mezcla ejercicios. */
  const meses = useMemo(() => {
    const todos = filas.flatMap((f) => f.cronograma);
    const delAnio = anio === "" || anio === SIN_FECHA ? todos : todos.filter((c) => String(c.anio) === anio);
    return Array.from(new Set(delAnio.map((c) => c.mes))).sort().reverse();
  }, [filas, anio]);

  // Cambiar de año deja huérfano el mes elegido, y la tabla saldría vacía sin
  // que se vea por qué.
  const cambiarAnio = (v: string) => {
    setAnio(v);
    setMes("");
  };

  /*
   * Filtrado SIN la pestaña, para las tarjetas de arriba.
   *
   * «Causada» y «por causar» son dos caras de lo mismo y se leen juntas. Si se
   * calcularan sobre la lista de la pestaña activa, estando en «Causadas» la
   * segunda saldría siempre en $0 y parecería que no hay nada por cobrar.
   * Las tarjetas responden a los filtros de verdad (mes, ramo, aseguradora,
   * asesor); la pestaña solo decide qué filas se listan abajo.
   */
  const enFiltros = useMemo(() => {
    let lista = filas;
    /*
     * Una póliza entra en un año o un mes si ALGUNA de sus cuotas cae ahí. Una
     * mensual que arranca en octubre reparte comisión sobre dos ejercicios, y
     * exigirle un único año la dejaría fuera de uno de los dos.
     */
    if (anio === SIN_FECHA) lista = lista.filter((f) => f.cronograma.length === 0);
    else if (anio) lista = lista.filter((f) => f.cronograma.some((c) => String(c.anio) === anio));
    if (mes) lista = lista.filter((f) => f.cronograma.some((c) => c.mes === mes));
    if (q.trim()) {
      const t = q.trim().toLowerCase();
      lista = lista.filter(
        (f) =>
          f.numero.toLowerCase().includes(t) ||
          f.asegurado.toLowerCase().includes(t) ||
          f.ramo.toLowerCase().includes(t)
      );
    }
    if (selRamo.length) lista = lista.filter((f) => selRamo.includes(normalizar(f.ramo)));
    if (selAseguradora.length)
      lista = lista.filter((f) => f.aseguradora && selAseguradora.includes(normalizar(f.aseguradora)));
    if (selAsesor.length) lista = lista.filter((f) => f.asesor1 && selAsesor.includes(normalizar(f.asesor1)));
    return lista;
  }, [filas, q, anio, mes, selRamo, selAseguradora, selAsesor]);

  /*
   * Cuotas de una póliza que caen dentro del período elegido.
   *
   * Es la pieza central del módulo. Sin filtro de mes, una mensual aporta sus
   * 12 cuotas; con «marzo 2026» aporta solo la que se cobra ese mes. Antes se
   * sumaba la comisión entera de la póliza en cualquier mes en que apareciera,
   * lo que multiplicaba por doce el total de una liquidación mensual.
   */
  const cuotasEnPeriodo = (f: FilaComision) =>
    f.cronograma.filter(
      (c) => (!anio || anio === SIN_FECHA || String(c.anio) === anio) && (!mes || c.mes === mes)
    );

  /** Lo de arriba, ya acotado por la pestaña: es lo que se lista en la tabla. */
  const filtradas = useMemo(() => {
    if (pestania === "todas") return enFiltros;
    return enFiltros.filter((f) =>
      cuotasEnPeriodo(f).some((c) =>
        pestania === "causadas" ? c.mes <= mesActual : c.mes > mesActual
      )
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enFiltros, pestania, anio, mes, mesActual]);

  const totales = useMemo(() => {
    let causada = 0;
    let esperada = 0;
    let sinTarifa = 0;
    let primaCausada = 0;
    for (const f of enFiltros) {
      if (f.comision == null) {
        sinTarifa++;
        continue;
      }
      for (const c of cuotasEnPeriodo(f)) {
        if (c.mes <= mesActual) {
          causada += c.valor;
          // La prima que respalda esa comisión, en la misma proporción que la
          // cuota: si no, una mensual con una cuota corrida mostraría la prima
          // anual completa como recaudada.
          primaCausada += f.primaNeta / f.cuotas;
        } else esperada += c.valor;
      }
    }
    return { causada, esperada, sinTarifa, primaCausada };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enFiltros, anio, mes, mesActual]);

  // Resumen por ramo: es como se revisa una liquidación, no póliza por póliza.
  const porRamo = useMemo(() => {
    const m = new Map<string, { pct: number | null; prima: number; comision: number; n: number }>();
    for (const f of filtradas) {
      const v = m.get(f.ramo) ?? { pct: f.pct, prima: 0, comision: 0, n: 0 };
      const cuotas = cuotasEnPeriodo(f);
      v.prima += (f.primaNeta / f.cuotas) * cuotas.length;
      v.comision += cuotas.reduce((s, c) => s + c.valor, 0);
      v.n++;
      m.set(f.ramo, v);
    }
    return [...m.entries()]
      .map(([ramo, v]) => ({ ramo, ...v }))
      .sort((a, b) => b.comision - a.comision);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtradas, anio, mes]);

  const limpiar = () => {
    setMes("");
    setSelRamo([]);
    setSelAseguradora([]);
    setSelAsesor([]);
  };
  /** Grupos para las fichas de «filtrando por…» sobre la tabla. */
  const grupos = [
    { etiqueta: "Ramo", valores: selRamo, onCambiar: setSelRamo },
    { etiqueta: "Aseguradora", valores: selAseguradora, onCambiar: setSelAseguradora },
    { etiqueta: "Asesor", valores: selAsesor, onCambiar: setSelAsesor },
  ];
  const nFiltros = grupos.reduce((n, g) => n + g.valores.length, 0);
  const hayFiltros = nFiltros > 0 || !!mes;

  const claseSelect =
    "rounded-lg border border-line-axis bg-surface px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none";

  const { visibles, pagina, setPagina, totalPaginas } = usePaginacion(filtradas);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          etiqueta="Comisión causada"
          valor={fmtCOP(totales.causada)}
          detalle={`Cuotas ya cobradas · sobre ${fmtCOP(totales.primaCausada)} de prima`}
          acento="verde"
        />
        <StatCard
          etiqueta="Comisión esperada"
          valor={fmtCOP(totales.esperada)}
          detalle="Cuotas que faltan por cobrarse"
          acento="amarillo"
        />
        <StatCard
          etiqueta="Pólizas listadas"
          valor={String(filtradas.length)}
          detalle={`de ${enFiltros.length} en el filtro`}
        />
        <StatCard
          etiqueta="Sin tarifa de comisión"
          valor={String(totales.sinTarifa)}
          detalle={totales.sinTarifa > 0 ? "Ramo fuera de la guía: revisar" : "Todos los ramos tienen tarifa"}
          acento={totales.sinTarifa > 0 ? "rojo" : undefined}
        />
      </div>

      {/* Buscador fuera del panel de filtros: es lo que más se usa y estaba
          escondido tras un clic. El mes va al lado porque una liquidación se
          revisa siempre de un mes concreto. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-lg border border-line-grid bg-surface p-1">
          {PESTANIAS.map((t) => (
            <button
              key={t.id}
              onClick={() => setPestania(t.id)}
              className={clsx(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                pestania === t.id
                  ? "bg-brand text-white"
                  : "text-ink-secondary hover:bg-surface-page"
              )}
            >
              {t.etiqueta}
            </button>
          ))}
        </div>
        <BuscadorTabla
          valor={q}
          onCambiar={setQ}
          marcador="Buscar póliza / asegurado / ramo"
        />
        <select
          className={claseSelect}
          value={anio}
          onChange={(e) => cambiarAnio(e.target.value)}
          title="Año de vencimiento de la póliza"
        >
          <option value="">Todos los años</option>
          {anios.map((a) => (
            <option key={a} value={String(a)}>
              {a}
            </option>
          ))}
          {sinFecha > 0 && (
            <option value={SIN_FECHA}>Sin vencimiento ({sinFecha})</option>
          )}
        </select>
        <FiltroMes valor={mes} onCambiar={setMes} meses={meses} />
      </div>

      {/* Las pólizas sin vencimiento no caben en ningún mes, así que quedan
          fuera de cualquier año y desaparecerían sin dejar rastro de un informe
          de dinero. Se dicen aquí, con el atajo para verlas. */}
      {anio !== "" && anio !== SIN_FECHA && sinFecha > 0 && (
        <p className="text-sm text-ink-secondary">
          {sinFecha === 1
            ? "Hay 1 póliza sin fecha de vencimiento: no se puede imputar a ningún mes y queda"
            : `Hay ${sinFecha} pólizas sin fecha de vencimiento: no se pueden imputar a ningún mes y quedan`}{" "}
          fuera de {anio}.{" "}
          <button
            onClick={() => cambiarAnio(SIN_FECHA)}
            className="font-medium text-brand underline underline-offset-2"
          >
            Verlas
          </button>
        </p>
      )}

      <FichasFiltros grupos={grupos} onLimpiarTodo={limpiar} />

      <PanelFiltros activos={nFiltros}>
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line-grid bg-white p-3">
          <FiltroSeleccion etiqueta="Ramo" opciones={ramos} valores={selRamo} onCambiar={setSelRamo} />
          <FiltroSeleccion
            etiqueta="Aseguradora"
            opciones={aseguradoras}
            valores={selAseguradora}
            onCambiar={setSelAseguradora}
            plural="todas"
          />
          <FiltroSeleccion
            etiqueta="Asesor"
            opciones={asesores}
            valores={selAsesor}
            onCambiar={setSelAsesor}
          />
          {hayFiltros && (
            <button
              onClick={limpiar}
              className="rounded-lg border border-line-axis px-2.5 py-1.5 text-sm text-ink-secondary hover:bg-surface-page"
            >
              Limpiar
            </button>
          )}
          <BotonExportar
            nombre="comisiones"
            filas={filtradas}
            columnas={[
              { encabezado: "Póliza", valor: (f) => f.numero },
              { encabezado: "Ramo", valor: (f) => f.ramo },
              { encabezado: "Asegurado", valor: (f) => f.asegurado },
              { encabezado: "Aseguradora", valor: (f) => f.aseguradora ?? "" },
              { encabezado: "Asesor", valor: (f) => f.asesor1 ?? "" },
              { encabezado: "Forma de pago", valor: (f) => f.formaPago ?? "" },
              { encabezado: "Estado de pago", valor: (f) => f.estadoPago ?? "" },
              { encabezado: "Prima neta", valor: (f) => f.primaNeta },
              { encabezado: "% comisión", valor: (f) => f.pct ?? "" },
              { encabezado: "Comisión año", valor: (f) => f.comision ?? "" },
              { encabezado: "Cuotas", valor: (f) => f.cuotas },
              {
                encabezado: "Comisión del período",
                valor: (f) => cuotasEnPeriodo(f).reduce((s, c) => s + c.valor, 0),
              },
              {
                encabezado: "Meses de cobro",
                valor: (f) => cuotasEnPeriodo(f).map((c) => c.mes).join(" · "),
              },
            ]}
          />
        </div>
      </PanelFiltros>

      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <div className="overflow-x-auto scroll-fino rounded-xl border border-line-grid bg-surface">
          <table className="w-full border-collapse whitespace-nowrap">
            <thead>
              <tr>
                <Th>Póliza</Th>
                <Th>Ramo</Th>
                <Th>Asegurado</Th>
                <Th>Aseguradora</Th>
                <Th>Forma de pago</Th>
                <Th>Pago</Th>
                <Th>Cobro</Th>
                <Th derecha>Prima neta</Th>
                <Th derecha>%</Th>
                <Th derecha>Comisión año</Th>
                <Th derecha>Del período</Th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((f) => (
                <tr key={f.id} className="hover:bg-surface-page">
                  <Td className="font-medium">{f.numero}</Td>
                  <Td>{f.ramo}</Td>
                  <Td>
                    <div className="max-w-[220px] truncate" title={f.asegurado}>
                      {f.asegurado}
                    </div>
                  </Td>
                  <Td>{f.aseguradora ?? "—"}</Td>
                  <Td>{f.formaPago ?? "—"}</Td>
                  <Td>
                    <span
                      className={clsx(
                        "rounded px-1.5 py-0.5 text-[11px] font-semibold",
                        f.pagada
                          ? "bg-status-good/10 text-status-good"
                          : "bg-status-warning/15 text-[#8a6100]"
                      )}
                    >
                      {f.pagada ? "OK PAGO" : "Pendiente"}
                    </span>
                  </Td>
                  {/* Meses en que se cobra la comisión dentro del período
                      elegido. Una mensual sin filtro de mes tiene doce, así que
                      se resumen como «primero … último (n)». */}
                  <Td className="text-ink-muted">{resumenMeses(cuotasEnPeriodo(f))}</Td>
                  <Td derecha>{fmtCOP(f.primaNeta)}</Td>
                  <Td derecha>
                    {f.pct == null ? (
                      <span
                        className="text-status-critical"
                        title="Este ramo no está en la guía de porcentajes"
                      >
                        sin tarifa
                      </span>
                    ) : (
                      `${f.pct}%`
                    )}
                  </Td>
                  <Td derecha className="text-ink-muted">
                    {f.comision == null ? "—" : fmtCOP(f.comision)}
                  </Td>
                  <Td derecha className="font-semibold">
                    {fmtCOP(cuotasEnPeriodo(f).reduce((s, c) => s + c.valor, 0))}
                  </Td>
                </tr>
              ))}
              {filtradas.length === 0 && (
                <tr>
                  <Td className="py-6 text-center text-ink-muted" colSpan={11}>
                    {/* Caso típico: se elige un mes futuro estando en «Ya
                        causadas». Las tarjetas sí muestran cifras y la tabla
                        vacía parece un error; se dice dónde están. */}
                    {enFiltros.length > 0 ? (
                      <>
                        Ninguna cuota de este período está{" "}
                        {pestania === "causadas" ? "ya causada" : "todavía por venir"}.{" "}
                        <button
                          onClick={() =>
                            setPestania(pestania === "causadas" ? "esperadas" : "causadas")
                          }
                          className="font-medium text-brand underline underline-offset-2"
                        >
                          Ver las {pestania === "causadas" ? "esperadas" : "ya causadas"}
                        </button>
                      </>
                    ) : (
                      "No hay pólizas que cumplan los filtros."
                    )}
                  </Td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="space-y-4">
          <Card>
            <CardTitle>Comisión por ramo</CardTitle>
            <table className="w-full border-collapse text-sm">
              <tbody>
                {porRamo.map((r) => (
                  <tr key={r.ramo} className="border-b border-line-grid last:border-0">
                    <td className="py-1.5">
                      {r.ramo}
                      <span className="ml-1.5 text-[11px] text-ink-muted">
                        {r.pct == null ? "—" : `${r.pct}%`} · {r.n}
                      </span>
                    </td>
                    <td className="py-1.5 text-right tabla-num font-medium">
                      {fmtCOP(r.comision)}
                    </td>
                  </tr>
                ))}
                {porRamo.length === 0 && (
                  <tr>
                    <td className="py-3 text-center text-ink-muted">Sin datos.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>

          <Card>
            <CardTitle>Guía de porcentajes</CardTitle>
            <table className="w-full border-collapse text-sm">
              <tbody>
                {tarifas.map((t) => (
                  <tr key={t.ramo} className="border-b border-line-grid last:border-0">
                    <td className="py-1 text-ink-secondary">{t.ramo}</td>
                    <td className="py-1 text-right tabla-num">{t.pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      </div>

      <Paginacion
        pagina={pagina}
        totalPaginas={totalPaginas}
        onCambiar={setPagina}
        total={filtradas.length}
        etiqueta="pólizas"
      />
    </div>
  );
}
