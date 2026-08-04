"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { fmtCOP, fmtCOPCompact, fmtFecha, fmtNum } from "@/lib/format";
import { MESES } from "@/lib/constants";
import { useRouter } from "next/navigation";
import { StatCard, Td, Th } from "@/components/ui";
import { BotonExportar } from "@/components/boton-exportar";
import { primaNoCausada } from "@/lib/calculos";
import { IconEditar } from "@/components/icons";
import { exigirOk } from "@/lib/respuesta";
import { api } from "@/lib/rutas";
import { PanelFiltros } from "@/components/panel-filtros";

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
  motivo: string | null;
  manual: boolean;
}

type CampoFecha = "fechaCancelacion" | "fechaRenovacion";

/**
 * Lo que realmente se descuenta al cancelar: la prima no causada, es decir la
 * devolución al cliente por los días que le faltaban de vigencia. Se calcula
 * sola a partir de la fecha de cancelación y la de renovación (fin de vigencia).
 */
function noCausadaDe(c: CancelacionVista): number {
  return primaNoCausada(
    c.primaNeta,
    c.fechaCancelacion ? new Date(c.fechaCancelacion) : null,
    c.fechaRenovacion ? new Date(c.fechaRenovacion) : null
  );
}

function normalizar(v: string): string {
  return v.trim().replace(/\s+/g, " ");
}

function opciones(valores: (string | null)[]): string[] {
  return Array.from(
    new Set(valores.filter((v): v is string => !!v).map(normalizar).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, "es"));
}

export function CancelacionesTabla({ cancelaciones }: { cancelaciones: CancelacionVista[] }) {
  const router = useRouter();
  const [editando, setEditando] = useState<CancelacionVista | null>(null);
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
  const totalNoCausada = filtradas.reduce((s, c) => s + noCausadaDe(c), 0);

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
        {/* Lo que de verdad se descuenta del seguimiento: la devolución al
            cliente. Solo tiene sentido al mirar por fecha de cancelación; por
            fecha de renovación la métrica es la producción cancelada, que va
            con la prima completa. */}
        {campo === "fechaCancelacion" ? (
          <StatCard
            etiqueta="Prima no causada"
            valor={fmtCOPCompact(totalNoCausada)}
            detalle="Devolución al cliente · es lo que descuenta el seguimiento"
            acento={totalNoCausada > 0 ? "rojo" : undefined}
          />
        ) : (
          <StatCard
            etiqueta="Prima promedio"
            valor={fmtCOPCompact(filtradas.length ? totalPrima / filtradas.length : 0)}
            detalle="Por póliza cancelada"
          />
        )}
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

      <PanelFiltros>
      <div className="flex flex-col gap-2 rounded-lg border border-line-grid bg-white p-3">
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
        <BotonExportar
          nombre="cancelaciones"
          filas={filtradas}
          columnas={[
            { encabezado: "Póliza", valor: (c) => c.numero },
            { encabezado: "Ramo", valor: (c) => c.ramo },
            { encabezado: "Asegurado", valor: (c) => c.asegurado ?? "" },
            { encabezado: "CC/NIT", valor: (c) => c.ccNit ?? "" },
            { encabezado: "Aseguradora", valor: (c) => c.aseguradora ?? "" },
            { encabezado: "Asesor", valor: (c) => c.asesor ?? "" },
            { encabezado: "Tipo", valor: (c) => c.tipoNegocio ?? "" },
            {
              encabezado: "Fecha renovación",
              valor: (c) => (c.fechaRenovacion ? new Date(c.fechaRenovacion) : null),
            },
            {
              encabezado: "Fecha cancelación",
              valor: (c) => (c.fechaCancelacion ? new Date(c.fechaCancelacion) : null),
            },
            { encabezado: "Prima neta", valor: (c) => c.primaNeta },
            { encabezado: "Prima total", valor: (c) => c.primaTotal },
            { encabezado: "Prima no causada (devolución)", valor: (c) => noCausadaDe(c) },
            { encabezado: "Motivo", valor: (c) => c.motivo ?? "" },
            { encabezado: "Origen", valor: (c) => (c.manual ? "APP" : "EXCEL") },
          ]}
        />
      </div>
      </PanelFiltros>

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
              <Th derecha>No causada</Th>
              <Th />
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
                <Td
                  derecha
                  className="text-status-critical"
                  title="Devolución al cliente por los días que faltaban de vigencia"
                >
                  {c.fechaCancelacion ? fmtCOP(noCausadaDe(c)) : "—"}
                </Td>
                <Td>
                  <button
                    onClick={() => setEditando(c)}
                    title="Editar cancelación"
                    className="inline-flex items-center gap-1 rounded-lg border border-brand/40 px-2.5 py-1 text-xs font-semibold text-brand hover:bg-brand-light/40"
                  >
                    <IconEditar className="h-3.5 w-3.5" />
                    Editar
                  </button>
                </Td>
              </tr>
            ))}
            {filtradas.length === 0 && (
              <tr>
                <Td className="py-6 text-center text-ink-muted" colSpan={11}>
                  No hay cancelaciones que cumplan los filtros.
                </Td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editando && (
        <ModalCancelacion
          cancelacion={editando}
          onCerrar={() => setEditando(null)}
          onGuardado={() => {
            setEditando(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edición de una cancelación del histórico
//
// Las dos fechas mueven métricas distintas del seguimiento de producción:
// la de renovación suma a "producción cancelada" y la de cancelación a
// "cancelaciones" del mes. Por eso se editan por separado y con su aviso.
// ---------------------------------------------------------------------------

const claseInput =
  "w-full rounded-md border border-line-axis bg-white px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none";
const claseLabel = "block text-xs font-semibold uppercase tracking-wide text-ink-muted";

function ModalCancelacion({
  cancelacion: c,
  onCerrar,
  onGuardado,
}: {
  cancelacion: CancelacionVista;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const soloFecha = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
  const [f, setF] = useState({
    numero: c.numero,
    ramo: c.ramo,
    asegurado: c.asegurado ?? "",
    ccNit: c.ccNit ?? "",
    placa: "",
    aseguradora: c.aseguradora ?? "",
    asesor: c.asesor ?? "",
    tipoNegocio: c.tipoNegocio ?? "",
    motivo: c.motivo ?? "",
    fechaRenovacion: soloFecha(c.fechaRenovacion),
    fechaCancelacion: soloFecha(c.fechaCancelacion),
    primaNeta: c.primaNeta,
    primaTotal: c.primaTotal,
  });
  const [guardando, setGuardando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const campo = (k: keyof typeof f) => ({
    value: f[k] as string | number,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setF({ ...f, [k]: e.target.value }),
  });

  const enviar = async (metodo: "PATCH" | "DELETE") => {
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch(api(`/api/cancelaciones/${c.id}`), {
        method: metodo,
        headers: { "Content-Type": "application/json" },
        body: metodo === "PATCH" ? JSON.stringify(f) : undefined,
      });
      const json = await exigirOk(res, "No se pudo guardar.");
      onGuardado();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setGuardando(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/45 p-4 py-[6vh]"
      onClick={onCerrar}
    >
      <div
        className="w-full max-w-2xl rounded-xl bg-surface p-6 shadow-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-bold">Editar cancelación {c.numero}</h3>
        <p className="mt-0.5 text-xs text-ink-muted">
          Cambiar las fechas mueve las cifras del seguimiento de producción.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-3">
          <div>
            <label className={claseLabel}>Póliza *</label>
            <input className={claseInput} {...campo("numero")} />
          </div>
          <div>
            <label className={claseLabel}>Ramo *</label>
            <input className={claseInput} {...campo("ramo")} />
          </div>
          <div>
            <label className={claseLabel}>Tipo</label>
            <input className={claseInput} {...campo("tipoNegocio")} />
          </div>
          <div className="col-span-2">
            <label className={claseLabel}>Asegurado</label>
            <input className={claseInput} {...campo("asegurado")} />
          </div>
          <div>
            <label className={claseLabel}>CC / NIT</label>
            <input className={claseInput} {...campo("ccNit")} />
          </div>
          <div>
            <label className={claseLabel}>Aseguradora</label>
            <input className={claseInput} {...campo("aseguradora")} />
          </div>
          <div>
            <label className={claseLabel}>Asesor</label>
            <input className={claseInput} {...campo("asesor")} />
          </div>
          <div>
            <label className={claseLabel}>Placa</label>
            <input className={claseInput} {...campo("placa")} />
          </div>
          <div>
            <label className={claseLabel}>Fecha de renovación</label>
            <input type="date" className={claseInput} {...campo("fechaRenovacion")} />
            <span className="mt-1 block text-[10px] text-ink-muted">Producción cancelada</span>
          </div>
          <div>
            <label className={claseLabel}>Fecha de cancelación</label>
            <input type="date" className={claseInput} {...campo("fechaCancelacion")} />
            <span className="mt-1 block text-[10px] text-ink-muted">Cancelaciones del mes</span>
          </div>
          <div>
            <label className={claseLabel}>Prima neta</label>
            <input type="number" className={claseInput} {...campo("primaNeta")} />
          </div>
          <div>
            <label className={claseLabel}>Prima total</label>
            <input type="number" className={claseInput} {...campo("primaTotal")} />
          </div>
          <div className="col-span-2 md:col-span-3">
            <label className={claseLabel}>Motivo de la cancelación</label>
            <textarea className={claseInput} rows={3} {...campo("motivo")} />
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-status-critical">{error}</p>}

        <div className="mt-5 flex items-center gap-2 border-t border-line-grid pt-4">
          {confirmando ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-status-critical">¿Eliminar del histórico?</span>
              <button
                onClick={() => enviar("DELETE")}
                disabled={guardando}
                className="rounded-lg bg-status-critical px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90"
              >
                Sí, eliminar
              </button>
              <button
                onClick={() => setConfirmando(false)}
                className="rounded-lg px-2 py-1.5 text-sm text-ink-secondary hover:bg-surface-page"
              >
                No
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmando(true)}
              disabled={guardando}
              className="rounded-lg border border-status-critical/40 px-3 py-1.5 text-sm font-medium text-status-critical hover:bg-status-critical/5"
            >
              Eliminar
            </button>
          )}
          <div className="ml-auto flex gap-2">
            <button
              onClick={onCerrar}
              disabled={guardando}
              className="rounded-lg px-3 py-1.5 text-sm text-ink-secondary hover:bg-surface-page"
            >
              Cancelar
            </button>
            <button
              onClick={() => enviar("PATCH")}
              disabled={guardando}
              className="rounded-lg bg-brand px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
            >
              {guardando ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
