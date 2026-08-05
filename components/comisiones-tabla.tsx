"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { fmtCOP, fmtFecha } from "@/lib/format";
import { Card, CardTitle, StatCard, Td, Th } from "@/components/ui";
import { BotonExportar } from "@/components/boton-exportar";
import { Paginacion, usePaginacion } from "@/components/paginacion";
import { PanelFiltros } from "@/components/panel-filtros";
import { BuscadorTabla } from "@/components/buscador-tabla";
import { FiltroMes } from "@/components/filtro-mes";
import type { FilaComision } from "@/lib/comisiones";

type Pestania = "causadas" | "porCausar" | "todas";

const PESTANIAS: { id: Pestania; etiqueta: string }[] = [
  { id: "causadas", etiqueta: "Causadas (prima recaudada)" },
  { id: "porCausar", etiqueta: "Por causar (sin pagar)" },
  { id: "todas", etiqueta: "Todas las pólizas" },
];

function normalizar(v: string): string {
  return v.trim().replace(/\s+/g, " ");
}

function opciones(valores: (string | null)[]): string[] {
  return Array.from(
    new Set(valores.filter((v): v is string => !!v).map(normalizar).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, "es"));
}

export function ComisionesTabla({
  filas,
  tarifas,
}: {
  filas: FilaComision[];
  tarifas: { ramo: string; pct: number }[];
}) {
  const [pestania, setPestania] = useState<Pestania>("causadas");
  const [q, setQ] = useState("");
  const [mes, setMes] = useState("");
  const [ramo, setRamo] = useState("");
  const [aseguradora, setAseguradora] = useState("");
  const [asesor, setAsesor] = useState("");

  const ramos = useMemo(() => opciones(filas.map((f) => f.ramo)), [filas]);
  const aseguradoras = useMemo(() => opciones(filas.map((f) => f.aseguradora)), [filas]);
  const asesores = useMemo(() => opciones(filas.map((f) => f.asesor1)), [filas]);
  const meses = useMemo(
    () => Array.from(new Set(filas.map((f) => f.mes).filter((m): m is string => !!m))).sort().reverse(),
    [filas]
  );

  const filtradas = useMemo(() => {
    let lista = filas;
    if (pestania === "causadas") lista = lista.filter((f) => f.pagada);
    else if (pestania === "porCausar") lista = lista.filter((f) => !f.pagada);
    if (mes) lista = lista.filter((f) => f.mes === mes);
    if (q.trim()) {
      const t = q.trim().toLowerCase();
      lista = lista.filter(
        (f) =>
          f.numero.toLowerCase().includes(t) ||
          f.asegurado.toLowerCase().includes(t) ||
          f.ramo.toLowerCase().includes(t)
      );
    }
    if (ramo) lista = lista.filter((f) => normalizar(f.ramo) === ramo);
    if (aseguradora)
      lista = lista.filter((f) => f.aseguradora && normalizar(f.aseguradora) === aseguradora);
    if (asesor) lista = lista.filter((f) => f.asesor1 && normalizar(f.asesor1) === asesor);
    return lista;
  }, [filas, pestania, q, mes, ramo, aseguradora, asesor]);

  const totales = useMemo(() => {
    let causada = 0;
    let porCausar = 0;
    let sinTarifa = 0;
    let primaCausada = 0;
    for (const f of filtradas) {
      if (f.comision == null) {
        sinTarifa++;
        continue;
      }
      if (f.pagada) {
        causada += f.comision;
        primaCausada += f.primaNeta;
      } else porCausar += f.comision;
    }
    return { causada, porCausar, sinTarifa, primaCausada };
  }, [filtradas]);

  // Resumen por ramo: es como se revisa una liquidación, no póliza por póliza.
  const porRamo = useMemo(() => {
    const m = new Map<string, { pct: number | null; prima: number; comision: number; n: number }>();
    for (const f of filtradas) {
      const v = m.get(f.ramo) ?? { pct: f.pct, prima: 0, comision: 0, n: 0 };
      v.prima += f.primaNeta;
      v.comision += f.comision ?? 0;
      v.n++;
      m.set(f.ramo, v);
    }
    return [...m.entries()]
      .map(([ramo, v]) => ({ ramo, ...v }))
      .sort((a, b) => b.comision - a.comision);
  }, [filtradas]);

  const limpiar = () => {
    setMes("");
    setRamo("");
    setAseguradora("");
    setAsesor("");
  };
  const hayFiltros = mes || ramo || aseguradora || asesor;

  const claseSelect =
    "rounded-lg border border-line-axis bg-surface px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none";

  const { visibles, pagina, setPagina, totalPaginas } = usePaginacion(filtradas);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          etiqueta="Comisión causada"
          valor={fmtCOP(totales.causada)}
          detalle={`Sobre ${fmtCOP(totales.primaCausada)} de prima recaudada`}
          acento="verde"
        />
        <StatCard
          etiqueta="Comisión por causar"
          valor={fmtCOP(totales.porCausar)}
          detalle="Pólizas todavía sin pagar"
          acento="amarillo"
        />
        <StatCard etiqueta="Pólizas en el filtro" valor={String(filtradas.length)} />
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
        <FiltroMes valor={mes} onCambiar={setMes} meses={meses} />
      </div>

      <PanelFiltros>
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line-grid bg-white p-3">
          <select className={claseSelect} value={ramo} onChange={(e) => setRamo(e.target.value)}>
            <option value="">Ramo: todos</option>
            {ramos.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
          <select
            className={claseSelect}
            value={aseguradora}
            onChange={(e) => setAseguradora(e.target.value)}
          >
            <option value="">Aseguradora: todas</option>
            {aseguradoras.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
          <select className={claseSelect} value={asesor} onChange={(e) => setAsesor(e.target.value)}>
            <option value="">Asesor: todos</option>
            {asesores.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
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
              { encabezado: "Comisión", valor: (f) => f.comision ?? "" },
              { encabezado: "Causada", valor: (f) => (f.pagada ? "SÍ" : "NO") },
              { encabezado: "Mes", valor: (f) => f.mes ?? "" },
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
                <Th derecha>Prima neta</Th>
                <Th derecha>%</Th>
                <Th derecha>Comisión</Th>
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
                      {f.pagada ? "Causada" : "Por causar"}
                    </span>
                  </Td>
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
                  <Td derecha className={f.pagada ? "font-semibold" : "text-ink-muted"}>
                    {f.comision == null ? "—" : fmtCOP(f.comision)}
                  </Td>
                </tr>
              ))}
              {filtradas.length === 0 && (
                <tr>
                  <Td className="py-6 text-center text-ink-muted" colSpan={9}>
                    No hay pólizas que cumplan los filtros.
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
