"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { fmtCOP, fmtCOPCompact, fmtFecha, fmtNum } from "@/lib/format";
import { MESES } from "@/lib/constants";
import { StatCard, Td, Th } from "@/components/ui";

export interface CancelacionVista {
  id: number;
  numero: string;
  ramo: string;
  fechaRenovacion: string | null;
  fechaCancelacion: string | null;
  tipoNegocio: string | null;
  asegurado: string | null;
  ccNit: string | null;
  asesor: string | null;
  aseguradora: string | null;
  primaNeta: number;
  primaTotal: number;
  manual: boolean;
}

type CampoFecha = "fechaCancelacion" | "fechaRenovacion";

function normalizar(v: string): string {
  return v.trim().replace(/\s+/g, " ");
}

function opciones(valores: (string | null)[]): string[] {
  return Array.from(
    new Set(valores.filter((v): v is string => !!v).map(normalizar).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, "es"));
}

export function CancelacionesTabla({ cancelaciones }: { cancelaciones: CancelacionVista[] }) {
  const [campo, setCampo] = useState<CampoFecha>("fechaCancelacion");
  const [anio, setAnio] = useState("");
  const [mes, setMes] = useState("");
  const [ramo, setRamo] = useState("");
  const [aseguradora, setAseguradora] = useState("");
  const [asesor, setAsesor] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [q, setQ] = useState("");

  const ramos = useMemo(() => opciones(cancelaciones.map((c) => c.ramo)), [cancelaciones]);
  const aseguradoras = useMemo(
    () => opciones(cancelaciones.map((c) => c.aseguradora)),
    [cancelaciones]
  );
  const asesores = useMemo(() => opciones(cancelaciones.map((c) => c.asesor)), [cancelaciones]);
  const anios = useMemo(() => {
    const set = new Set<string>();
    for (const c of cancelaciones) {
      const f = c[campo];
      if (f) set.add(f.slice(0, 4));
    }
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [cancelaciones, campo]);

  const filtradas = useMemo(() => {
    let lista = cancelaciones;
    // Solo filas que tengan la fecha del campo elegido
    lista = lista.filter((c) => !!c[campo]);
    if (anio) lista = lista.filter((c) => c[campo]!.slice(0, 4) === anio);
    if (mes) lista = lista.filter((c) => Number(c[campo]!.slice(5, 7)) === Number(mes));
    if (desde) lista = lista.filter((c) => c[campo]!.slice(0, 10) >= desde);
    if (hasta) lista = lista.filter((c) => c[campo]!.slice(0, 10) <= hasta);
    if (ramo) lista = lista.filter((c) => normalizar(c.ramo) === ramo);
    if (aseguradora)
      lista = lista.filter((c) => c.aseguradora && normalizar(c.aseguradora) === aseguradora);
    if (asesor) lista = lista.filter((c) => c.asesor && normalizar(c.asesor) === asesor);
    if (q.trim()) {
      const t = q.trim().toLowerCase();
      lista = lista.filter(
        (c) =>
          c.numero.toLowerCase().includes(t) ||
          (c.asegurado ?? "").toLowerCase().includes(t) ||
          (c.ccNit ?? "").toLowerCase().includes(t)
      );
    }
    return [...lista].sort((a, b) => (b[campo] ?? "").localeCompare(a[campo] ?? ""));
  }, [cancelaciones, campo, anio, mes, desde, hasta, ramo, aseguradora, asesor, q]);

  const totalPrima = filtradas.reduce((s, c) => s + c.primaNeta, 0);

  // Desglose por año del campo de fecha elegido
  const porAnio = useMemo(() => {
    const mapa = new Map<string, { count: number; prima: number }>();
    for (const c of filtradas) {
      const y = c[campo]!.slice(0, 4);
      const acc = mapa.get(y) ?? { count: 0, prima: 0 };
      acc.count++;
      acc.prima += c.primaNeta;
      mapa.set(y, acc);
    }
    return Array.from(mapa.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtradas, campo]);

  const claseSelect =
    "rounded-md border border-line-axis bg-white px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none";
  const etiquetaCampo =
    campo === "fechaCancelacion" ? "fecha de cancelación" : "fecha de renovación";
  const hayFiltros = anio || mes || ramo || aseguradora || asesor || desde || hasta || q;

  const limpiar = () => {
    setAnio("");
    setMes("");
    setRamo("");
    setAseguradora("");
    setAsesor("");
    setDesde("");
    setHasta("");
    setQ("");
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard
          etiqueta="Cancelaciones (filtro)"
          valor={fmtNum(filtradas.length)}
          detalle={`Agrupadas por ${etiquetaCampo}`}
        />
        <StatCard
          etiqueta="Prima neta cancelada"
          valor={fmtCOPCompact(totalPrima)}
          detalle={fmtCOP(totalPrima)}
          acento={totalPrima > 0 ? "rojo" : undefined}
        />
        <StatCard
          etiqueta="Prima promedio"
          valor={fmtCOPCompact(filtradas.length ? totalPrima / filtradas.length : 0)}
          detalle="Por póliza cancelada"
        />
        <StatCard
          etiqueta="Años con registro"
          valor={fmtNum(porAnio.length)}
          detalle={porAnio.map(([y]) => y).join(" · ") || "—"}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line-grid bg-white p-2.5">
        <span className="text-sm font-medium text-ink-secondary">Analizar por</span>
        <div className="flex gap-1 rounded-md border border-line-grid p-0.5">
          <button
            onClick={() => setCampo("fechaCancelacion")}
            className={clsx(
              "rounded px-2.5 py-1 text-sm font-medium",
              campo === "fechaCancelacion"
                ? "bg-brand text-white"
                : "text-ink-secondary hover:bg-surface-page"
            )}
          >
            Fecha de cancelación
          </button>
          <button
            onClick={() => setCampo("fechaRenovacion")}
            className={clsx(
              "rounded px-2.5 py-1 text-sm font-medium",
              campo === "fechaRenovacion"
                ? "bg-brand text-white"
                : "text-ink-secondary hover:bg-surface-page"
            )}
          >
            Fecha de renovación
          </button>
        </div>
        <span className="text-xs text-ink-muted">
          {campo === "fechaCancelacion"
            ? "Cuándo se canceló realmente la póliza"
            : "Producción cancelada, por mes de renovación"}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar póliza / asegurado / NIT"
          className={clsx(claseSelect, "min-w-[220px]")}
        />
        <select className={claseSelect} value={anio} onChange={(e) => setAnio(e.target.value)}>
          <option value="">Año: todos</option>
          {anios.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
        <select className={claseSelect} value={mes} onChange={(e) => setMes(e.target.value)}>
          <option value="">Mes: todos</option>
          {MESES.map((m, i) => (
            <option key={m} value={i + 1}>
              {m.charAt(0) + m.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
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
        <label className="flex items-center gap-1 text-sm text-ink-secondary">
          Desde
          <input
            type="date"
            className={claseSelect}
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
          />
        </label>
        <label className="flex items-center gap-1 text-sm text-ink-secondary">
          Hasta
          <input
            type="date"
            className={claseSelect}
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
          />
        </label>
        {hayFiltros && (
          <button
            onClick={limpiar}
            className="rounded-md border border-line-axis px-2.5 py-1.5 text-sm text-ink-secondary hover:bg-surface-page"
          >
            Limpiar
          </button>
        )}
        <span className="ml-auto text-sm text-ink-muted">{filtradas.length} cancelaciones</span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-line-grid bg-surface">
        <table className="w-full border-collapse whitespace-nowrap">
          <thead>
            <tr>
              <Th>Póliza</Th>
              <Th>Ramo</Th>
              <Th>Asegurado</Th>
              <Th>Aseguradora</Th>
              <Th>Asesor</Th>
              <Th>Tipo</Th>
              <Th>Fecha renovación</Th>
              <Th>Fecha cancelación</Th>
              <Th derecha>Prima neta</Th>
            </tr>
          </thead>
          <tbody>
            {filtradas.map((c) => (
              <tr key={c.id} className="hover:bg-surface-page">
                <Td className="font-medium">
                  {c.numero}
                  {c.manual && (
                    <span
                      className="ml-1.5 rounded bg-brand-light/60 px-1 py-0.5 text-[10px] font-semibold text-brand-dark"
                      title="Cancelada desde la aplicación"
                    >
                      app
                    </span>
                  )}
                </Td>
                <Td>{c.ramo}</Td>
                <Td>
                  <div className="max-w-[220px] truncate" title={c.asegurado ?? ""}>
                    {c.asegurado ?? "—"}
                  </div>
                  {c.ccNit && <div className="text-[11px] text-ink-muted">{c.ccNit}</div>}
                </Td>
                <Td>{c.aseguradora ?? "—"}</Td>
                <Td>{c.asesor ?? "—"}</Td>
                <Td>
                  <span className="text-xs">{c.tipoNegocio ?? "—"}</span>
                </Td>
                <Td>{fmtFecha(c.fechaRenovacion)}</Td>
                <Td>{fmtFecha(c.fechaCancelacion)}</Td>
                <Td derecha className="font-semibold">
                  {fmtCOP(c.primaNeta)}
                </Td>
              </tr>
            ))}
            {filtradas.length === 0 && (
              <tr>
                <Td className="py-6 text-center text-ink-muted" colSpan={9}>
                  No hay cancelaciones que cumplan los filtros.
                </Td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
