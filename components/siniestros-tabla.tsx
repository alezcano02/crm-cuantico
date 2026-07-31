"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import {
  ESTADOS_ABIERTOS,
  ETIQUETA_ESTADO,
  type EstadoSiniestro,
} from "@/lib/siniestros";
import { fmtCOP, fmtCOPCompact, fmtFecha } from "@/lib/format";
import { StatCard, Td, Th } from "@/components/ui";
import { BotonExportar } from "@/components/boton-exportar";
import { IconCarpeta, IconCheck } from "@/components/icons";
import { urlBusqueda } from "@/lib/carpetas";

export interface SiniestroVista {
  id: number;
  asegurado: string;
  nit: string | null;
  administrador: string | null;
  firmaAdministracion: string | null;
  celular: string | null;
  email: string | null;
  aseguradora: string | null;
  poliza: string | null;
  cobertura: string | null;
  resumen: string | null;
  radicado: string | null;
  estado: EstadoSiniestro;
  estadoTexto: string | null;
  observaciones: string | null;
  valorSiniestro: number | null;
  valorLiquidar: number | null;
  valorPagado: number | null;
  deducible: number | null;
  responsable: string | null;
  fechaOcurrencia: string | null;
  fechaAvisoCompania: string | null;
  fechaUltimoSeguimiento: string | null;
  fechaPago: string | null;
  dias: number | null; // días sin movimiento
  cerrado: boolean;
  origen: string | null;
}

type Pestania = "abiertos" | "sinMovimiento" | "pagados" | "todos";

const PESTANIAS: { id: Pestania; etiqueta: string }[] = [
  { id: "abiertos", etiqueta: "Abiertos" },
  { id: "sinMovimiento", etiqueta: "Sin movimiento (+30 días)" },
  { id: "pagados", etiqueta: "Pagados y cerrados" },
  { id: "todos", etiqueta: "Todos" },
];

const COLOR_ESTADO: Record<EstadoSiniestro, string> = {
  PENDIENTE_CLIENTE: "bg-status-warning/15 text-[#8a6100]",
  PENDIENTE_COMPANIA: "bg-brand-light text-brand",
  PENDIENTE_CUANTICO: "bg-status-critical/10 text-status-critical",
  EN_PAGO: "bg-status-serious/15 text-[#c05a2e]",
  PAGADO: "bg-status-good/10 text-status-good",
  OBJETADO: "bg-status-critical/10 text-status-critical",
  CERRADO: "bg-surface-sunken text-ink-secondary",
  SIN_ESTADO: "bg-surface-sunken text-ink-muted",
};

function normalizar(v: string): string {
  return v.trim().replace(/\s+/g, " ");
}

function opciones(valores: (string | null)[]): string[] {
  return Array.from(
    new Set(valores.filter((v): v is string => !!v).map(normalizar).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, "es"));
}

export function SiniestrosTabla({ siniestros }: { siniestros: SiniestroVista[] }) {
  const router = useRouter();
  const [pestania, setPestania] = useState<Pestania>("abiertos");
  const [q, setQ] = useState("");
  const [aseguradora, setAseguradora] = useState("");
  const [responsable, setResponsable] = useState("");
  const [estado, setEstado] = useState("");
  const [orden, setOrden] = useState<"dias" | "valor" | "cliente">("dias");
  const [gestionando, setGestionando] = useState<SiniestroVista | null>(null);

  const aseguradoras = useMemo(
    () => opciones(siniestros.map((s) => s.aseguradora)),
    [siniestros]
  );
  const responsables = useMemo(
    () => opciones(siniestros.map((s) => s.responsable)),
    [siniestros]
  );

  const filtrados = useMemo(() => {
    let lista = siniestros;
    if (pestania === "abiertos") {
      lista = lista.filter((s) => !s.cerrado && ESTADOS_ABIERTOS.includes(s.estado));
    } else if (pestania === "sinMovimiento") {
      lista = lista.filter(
        (s) => !s.cerrado && ESTADOS_ABIERTOS.includes(s.estado) && (s.dias ?? 0) > 30
      );
    } else if (pestania === "pagados") {
      lista = lista.filter(
        (s) => s.cerrado || s.estado === "PAGADO" || s.estado === "CERRADO"
      );
    }
    if (aseguradora)
      lista = lista.filter((s) => s.aseguradora && normalizar(s.aseguradora) === aseguradora);
    if (responsable)
      lista = lista.filter((s) => s.responsable && normalizar(s.responsable) === responsable);
    if (estado) lista = lista.filter((s) => s.estado === estado);
    if (q.trim()) {
      const t = q.trim().toLowerCase();
      lista = lista.filter(
        (s) =>
          s.asegurado.toLowerCase().includes(t) ||
          (s.radicado ?? "").toLowerCase().includes(t) ||
          (s.cobertura ?? "").toLowerCase().includes(t) ||
          (s.nit ?? "").toLowerCase().includes(t) ||
          (s.poliza ?? "").toLowerCase().includes(t)
      );
    }
    return [...lista].sort((a, b) => {
      if (orden === "valor") return (b.valorSiniestro ?? 0) - (a.valorSiniestro ?? 0);
      if (orden === "cliente") return a.asegurado.localeCompare(b.asegurado, "es");
      return (b.dias ?? -1) - (a.dias ?? -1); // más estancados primero
    });
  }, [siniestros, pestania, aseguradora, responsable, estado, q, orden]);

  const resumen = useMemo(() => {
    const abiertos = siniestros.filter(
      (s) => !s.cerrado && ESTADOS_ABIERTOS.includes(s.estado)
    );
    return {
      abiertos: abiertos.length,
      estancados: abiertos.filter((s) => (s.dias ?? 0) > 30).length,
      reclamado: abiertos.reduce((a, s) => a + (s.valorSiniestro ?? 0), 0),
      pagado: siniestros.reduce((a, s) => a + (s.valorPagado ?? 0), 0),
    };
  }, [siniestros]);

  const limpiar = () => {
    setQ("");
    setAseguradora("");
    setResponsable("");
    setEstado("");
  };
  const hayFiltros = q || aseguradora || responsable || estado;

  const claseSelect =
    "rounded-lg border border-line-axis bg-surface px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          etiqueta="Siniestros abiertos"
          valor={String(resumen.abiertos)}
          detalle="Requieren gestión"
          acento={resumen.abiertos > 0 ? "amarillo" : "verde"}
        />
        <StatCard
          etiqueta="Sin movimiento +30 días"
          valor={String(resumen.estancados)}
          detalle="Llevan más de un mes quietos"
          acento={resumen.estancados > 0 ? "rojo" : "verde"}
        />
        <StatCard
          etiqueta="Valor en reclamación"
          valor={fmtCOPCompact(resumen.reclamado)}
          detalle="Pretensiones de los casos abiertos"
        />
        <StatCard
          etiqueta="Pagado por aseguradoras"
          valor={fmtCOPCompact(resumen.pagado)}
          detalle="Indemnizaciones recibidas"
          acento={resumen.pagado > 0 ? "verde" : undefined}
        />
      </div>

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

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar cliente / radicado / cobertura"
          className={clsx(claseSelect, "min-w-[240px]")}
        />
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
        <select
          className={claseSelect}
          value={responsable}
          onChange={(e) => setResponsable(e.target.value)}
        >
          <option value="">Responsable: todos</option>
          {responsables.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
        <select className={claseSelect} value={estado} onChange={(e) => setEstado(e.target.value)}>
          <option value="">Estado: todos</option>
          {(Object.keys(ETIQUETA_ESTADO) as EstadoSiniestro[]).map((e) => (
            <option key={e} value={e}>
              {ETIQUETA_ESTADO[e]}
            </option>
          ))}
        </select>
        <select
          className={claseSelect}
          value={orden}
          onChange={(e) => setOrden(e.target.value as typeof orden)}
        >
          <option value="dias">Orden: más estancados primero</option>
          <option value="valor">Orden: mayor valor reclamado</option>
          <option value="cliente">Orden: cliente</option>
        </select>
        {hayFiltros && (
          <button
            onClick={limpiar}
            className="rounded-lg border border-line-axis px-2.5 py-1.5 text-sm text-ink-secondary hover:bg-surface-page"
          >
            Limpiar
          </button>
        )}
        <span className="ml-auto text-sm text-ink-muted">{filtrados.length} siniestros</span>
        <BotonExportar
          nombre="siniestros"
          filas={filtrados}
          columnas={[
            { encabezado: "Cliente", valor: (s) => s.asegurado },
            { encabezado: "NIT", valor: (s) => s.nit ?? "" },
            { encabezado: "Aseguradora", valor: (s) => s.aseguradora ?? "" },
            { encabezado: "Póliza", valor: (s) => s.poliza ?? "" },
            { encabezado: "Cobertura / evento", valor: (s) => s.cobertura ?? "" },
            { encabezado: "Radicado", valor: (s) => s.radicado ?? "" },
            { encabezado: "Estado", valor: (s) => ETIQUETA_ESTADO[s.estado] },
            { encabezado: "Estado (texto original)", valor: (s) => s.estadoTexto ?? "" },
            { encabezado: "Responsable", valor: (s) => s.responsable ?? "" },
            { encabezado: "Días sin movimiento", valor: (s) => s.dias ?? "" },
            {
              encabezado: "Ocurrencia",
              valor: (s) => (s.fechaOcurrencia ? new Date(s.fechaOcurrencia) : null),
            },
            {
              encabezado: "Aviso a la compañía",
              valor: (s) => (s.fechaAvisoCompania ? new Date(s.fechaAvisoCompania) : null),
            },
            {
              encabezado: "Último seguimiento",
              valor: (s) =>
                s.fechaUltimoSeguimiento ? new Date(s.fechaUltimoSeguimiento) : null,
            },
            { encabezado: "Valor reclamado", valor: (s) => s.valorSiniestro ?? "" },
            { encabezado: "Valor a liquidar", valor: (s) => s.valorLiquidar ?? "" },
            { encabezado: "Deducible", valor: (s) => s.deducible ?? "" },
            { encabezado: "Valor pagado", valor: (s) => s.valorPagado ?? "" },
            { encabezado: "Administrador", valor: (s) => s.administrador ?? "" },
            { encabezado: "Celular", valor: (s) => s.celular ?? "" },
            { encabezado: "Resumen", valor: (s) => s.resumen ?? "" },
            { encabezado: "Observaciones", valor: (s) => s.observaciones ?? "" },
          ]}
        />
      </div>

      <div className="overflow-x-auto scroll-fino rounded-xl border border-line-grid bg-surface">
        <table className="w-full border-collapse whitespace-nowrap">
          <thead>
            <tr>
              <Th>Estado</Th>
              <Th derecha>Sin mover</Th>
              <Th>Cliente</Th>
              <Th>Cobertura / evento</Th>
              <Th>Aseguradora</Th>
              <Th>Radicado</Th>
              <Th>Responsable</Th>
              <Th derecha>Reclamado</Th>
              <Th derecha>Pagado</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {filtrados.map((s) => (
              <tr key={s.id} className={clsx("hover:bg-surface-page", s.cerrado && "opacity-60")}>
                <Td>
                  <span
                    className={clsx(
                      "inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold",
                      COLOR_ESTADO[s.estado]
                    )}
                    title={s.estadoTexto ?? undefined}
                  >
                    {ETIQUETA_ESTADO[s.estado]}
                  </span>
                  {s.cerrado && (
                    <span className="ml-1.5 inline-flex items-center gap-0.5 text-[11px] font-semibold text-status-good">
                      <IconCheck className="h-3 w-3" />
                      cerrado
                    </span>
                  )}
                </Td>
                <Td derecha>
                  {s.dias == null ? (
                    <span className="text-xs text-ink-muted">—</span>
                  ) : (
                    <span
                      className={clsx(
                        "text-xs font-semibold tabla-num",
                        s.dias > 60
                          ? "text-status-critical"
                          : s.dias > 30
                            ? "text-[#b07800]"
                            : "text-ink-muted"
                      )}
                    >
                      {s.dias} d
                    </span>
                  )}
                </Td>
                <Td>
                  <div className="max-w-[230px] truncate font-medium" title={s.asegurado}>
                    {s.asegurado}
                  </div>
                  <div className="text-[11px] text-ink-muted">
                    {s.nit ?? "—"}
                    {s.administrador && ` · ${s.administrador}`}
                  </div>
                </Td>
                <Td>
                  <div className="max-w-[200px] truncate" title={s.cobertura ?? undefined}>
                    {s.cobertura ?? "—"}
                  </div>
                </Td>
                <Td>{s.aseguradora ?? "—"}</Td>
                <Td>
                  <div className="max-w-[140px] truncate text-xs" title={s.radicado ?? undefined}>
                    {s.radicado ?? "—"}
                  </div>
                </Td>
                <Td>
                  <div className="text-xs">{s.responsable ?? "—"}</div>
                </Td>
                <Td derecha>{s.valorSiniestro ? fmtCOP(s.valorSiniestro) : "—"}</Td>
                <Td derecha className={s.valorPagado ? "font-semibold text-status-good" : ""}>
                  {s.valorPagado ? fmtCOP(s.valorPagado) : "—"}
                </Td>
                <Td>
                  <button
                    onClick={() => setGestionando(s)}
                    className="rounded-lg border border-brand/40 px-2.5 py-1 text-xs font-semibold text-brand hover:bg-brand-light/40"
                  >
                    Gestionar
                  </button>
                </Td>
              </tr>
            ))}
            {filtrados.length === 0 && (
              <tr>
                <Td className="py-6 text-center text-ink-muted" colSpan={10}>
                  No hay siniestros que cumplan los filtros.
                </Td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {gestionando && (
        <ModalSiniestro
          siniestro={gestionando}
          onCerrar={() => setGestionando(null)}
          onGuardado={() => {
            setGestionando(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal de gestión: registrar seguimiento, ver el caso y editar lo esencial
// ---------------------------------------------------------------------------

const claseInput =
  "w-full rounded-md border border-line-axis bg-white px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none";
const claseLabel = "block text-xs font-semibold uppercase tracking-wide text-ink-muted";

function ModalSiniestro({
  siniestro: s,
  onCerrar,
  onGuardado,
}: {
  siniestro: SiniestroVista;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const [pestania, setPestania] = useState<
    "seguimiento" | "caso" | "documentos" | "editar"
  >("seguimiento");
  const [nota, setNota] = useState("");
  const [estadoTexto, setEstadoTexto] = useState(s.estadoTexto ?? "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Para cerrar hay que confirmar el pago, así que el botón abre un formulario
  // en vez de cerrar de una vez.
  const [cerrando, setCerrando] = useState(false);
  const [fechaPago, setFechaPago] = useState(s.fechaPago ? s.fechaPago.slice(0, 10) : "");
  const [valorPagado, setValorPagado] = useState(
    s.valorPagado != null ? String(s.valorPagado) : ""
  );

  const hoy = new Date();
  const hoyISO = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
  const [fecha, setFecha] = useState(hoyISO);

  const enviar = async (cuerpo: Record<string, unknown>) => {
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch(`/api/siniestros/${s.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "No se pudo guardar.");
      onGuardado();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setGuardando(false);
    }
  };

  const claseTab = (activo: boolean) =>
    clsx(
      "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
      activo ? "border-brand text-brand" : "border-transparent text-ink-secondary hover:text-ink"
    );

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/45 p-4 py-[5vh]"
      onClick={onCerrar}
    >
      <div
        className="w-full max-w-3xl rounded-xl bg-surface shadow-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-line-grid px-5 pt-4">
          <h3 className="text-base font-bold">{s.asegurado}</h3>
          <p className="mt-0.5 text-sm text-ink-secondary">
            {s.cobertura ?? "Sin cobertura registrada"}
            {s.aseguradora && ` · ${s.aseguradora}`}
            {s.radicado && ` · radicado ${s.radicado}`}
          </p>
          <div className="mt-3 flex flex-wrap gap-1">
            <button onClick={() => setPestania("seguimiento")} className={claseTab(pestania === "seguimiento")}>
              Registrar seguimiento
            </button>
            <button onClick={() => setPestania("caso")} className={claseTab(pestania === "caso")}>
              Historia del caso
            </button>
            <button
              onClick={() => setPestania("documentos")}
              className={claseTab(pestania === "documentos")}
            >
              Documentos
            </button>
            <button onClick={() => setPestania("editar")} className={claseTab(pestania === "editar")}>
              Editar datos
            </button>
          </div>
        </div>

        <div className="px-5 py-4">
          {pestania === "seguimiento" && (
            <div>
              <div className="mb-4 grid grid-cols-2 gap-3 rounded-lg bg-surface-page px-3 py-2.5 text-xs sm:grid-cols-4">
                <div>
                  <div className="text-ink-muted">Estado</div>
                  <div className="font-semibold">{ETIQUETA_ESTADO[s.estado]}</div>
                </div>
                <div>
                  <div className="text-ink-muted">Sin movimiento</div>
                  <div className="font-semibold">{s.dias == null ? "—" : `${s.dias} días`}</div>
                </div>
                <div>
                  <div className="text-ink-muted">Reclamado</div>
                  <div className="font-semibold tabla-num">
                    {s.valorSiniestro ? fmtCOP(s.valorSiniestro) : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-ink-muted">Pagado</div>
                  <div className="font-semibold tabla-num">
                    {s.valorPagado ? fmtCOP(s.valorPagado) : "—"}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <div>
                  <label className={claseLabel}>Fecha del seguimiento</label>
                  <input
                    type="date"
                    className={claseInput}
                    value={fecha}
                    onChange={(e) => setFecha(e.target.value)}
                  />
                </div>
                <div>
                  <label className={claseLabel}>Estado / pendiente por</label>
                  <input
                    className={claseInput}
                    value={estadoTexto}
                    onChange={(e) => setEstadoTexto(e.target.value)}
                    placeholder="Ej: EN LA COMPAÑÍA, COPROPIEDAD, EN PAGO…"
                  />
                </div>
                <div className="col-span-2">
                  <label className={claseLabel}>¿Qué se hizo? *</label>
                  <textarea
                    className={`${claseInput} mt-1`}
                    rows={4}
                    value={nota}
                    onChange={(e) => setNota(e.target.value)}
                    placeholder="Ej: se llamó a la administradora y se solicitó el registro fotográfico pendiente."
                  />
                  <p className="mt-1 text-[11px] text-ink-muted">
                    Queda con la fecha al comienzo del historial de observaciones.
                  </p>
                </div>
              </div>

              {error && <p className="mt-3 text-sm text-status-critical">{error}</p>}

              {/* Para cerrar el caso primero hay que confirmar el pago */}
              {cerrando && !s.cerrado && (
                <div className="mt-4 rounded-lg border border-status-good/40 bg-status-good/5 p-3">
                  <p className="text-xs text-ink-secondary">
                    Antes de cerrar el caso confirme el pago. Si se objetó o no
                    hubo indemnización, escriba <b>0</b> en el valor.
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div>
                      <label className={claseLabel}>Fecha de confirmación del pago *</label>
                      <input
                        type="date"
                        className={claseInput}
                        value={fechaPago}
                        onChange={(e) => setFechaPago(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className={claseLabel}>Valor pagado *</label>
                      <input
                        type="number"
                        className={claseInput}
                        value={valorPagado}
                        onChange={(e) => setValorPagado(e.target.value)}
                        placeholder="0"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line-grid pt-4">
                {s.cerrado ? (
                  <button
                    onClick={() => enviar({ cerrado: false })}
                    disabled={guardando}
                    className="rounded-lg border border-line-axis px-3 py-1.5 text-sm font-medium text-ink-secondary hover:bg-surface-page"
                  >
                    Reabrir caso
                  </button>
                ) : cerrando ? (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => enviar({ cerrado: true, fechaPago, valorPagado })}
                      disabled={guardando}
                      className="rounded-lg bg-status-good px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                    >
                      Confirmar pago y cerrar
                    </button>
                    <button
                      onClick={() => setCerrando(false)}
                      disabled={guardando}
                      className="rounded-lg px-2 py-1.5 text-sm text-ink-secondary hover:bg-surface-page"
                    >
                      Volver
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setCerrando(true)}
                    disabled={guardando}
                    className="rounded-lg border border-line-axis px-3 py-1.5 text-sm font-medium text-ink-secondary hover:bg-surface-page"
                  >
                    Cerrar caso…
                  </button>
                )}
                <div className="ml-auto flex gap-2">
                  <button
                    onClick={onCerrar}
                    disabled={guardando}
                    className="rounded-lg px-3 py-1.5 text-sm text-ink-secondary hover:bg-surface-page"
                  >
                    Cerrar
                  </button>
                  <button
                    onClick={() => enviar({ modo: "seguimiento", nota, fecha, estadoTexto })}
                    disabled={guardando}
                    className="rounded-lg bg-brand px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
                  >
                    {guardando ? "Guardando…" : "Guardar seguimiento"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {pestania === "caso" && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
                {[
                  ["Póliza", s.poliza],
                  ["NIT", s.nit],
                  ["Administración", s.firmaAdministracion],
                  ["Administrador", s.administrador],
                  ["Celular", s.celular],
                  ["Correo", s.email],
                  ["Ocurrencia", fmtFecha(s.fechaOcurrencia)],
                  ["Aviso a la compañía", fmtFecha(s.fechaAvisoCompania)],
                  ["Último seguimiento", fmtFecha(s.fechaUltimoSeguimiento)],
                  ["Valor a liquidar", s.valorLiquidar ? fmtCOP(s.valorLiquidar) : null],
                  ["Deducible", s.deducible ? fmtCOP(s.deducible) : null],
                  ["Fecha de pago", fmtFecha(s.fechaPago)],
                ].map(([k, v]) => (
                  <div key={String(k)}>
                    <div className="text-[11px] uppercase tracking-wide text-ink-muted">{k}</div>
                    <div>{v || "—"}</div>
                  </div>
                ))}
              </div>

              {s.resumen && (
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-ink-muted">
                    Resumen del evento
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-ink-secondary">{s.resumen}</p>
                </div>
              )}

              <div>
                <div className="text-[11px] uppercase tracking-wide text-ink-muted">
                  Historial de observaciones
                </div>
                <p className="mt-1 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg bg-surface-page p-3 text-xs leading-relaxed text-ink-secondary scroll-fino">
                  {s.observaciones || "Sin observaciones registradas."}
                </p>
              </div>

              {s.origen && (
                <p className="text-[11px] text-ink-muted">Procedencia: {s.origen}</p>
              )}
            </div>
          )}

          {pestania === "documentos" && (
            <div>
              <p className="rounded-lg bg-surface-page px-3 py-2 text-xs text-ink-secondary">
                Los soportes del siniestro están en la unidad compartida de la
                empresa. El botón abre el buscador de SharePoint con el nombre
                del cliente ya escrito, en una pestaña nueva.
              </p>
              <a
                href={urlBusqueda(s.asegurado)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-dark"
              >
                <IconCarpeta className="h-4 w-4" />
                Buscar en SharePoint
              </a>
              <p className="mt-2.5 text-xs text-ink-muted">
                Se buscará:{" "}
                <span className="font-medium text-ink-secondary">{s.asegurado}</span>
              </p>

              {s.radicado && (
                <>
                  <p className="mt-4 text-xs text-ink-muted">
                    Si los soportes están archivados por el número del caso:
                  </p>
                  <a
                    href={urlBusqueda(s.radicado)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1.5 inline-flex items-center gap-2 rounded-lg border border-line-axis px-3 py-1.5 text-sm font-medium text-ink-secondary hover:border-brand-300 hover:text-brand"
                  >
                    Buscar por radicado {s.radicado}
                  </a>
                </>
              )}
            </div>
          )}

          {pestania === "editar" && (
            <FormularioEditar
              siniestro={s}
              onCerrar={onCerrar}
              onGuardar={enviar}
              guardando={guardando}
              error={error}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function FormularioEditar({
  siniestro: s,
  onCerrar,
  onGuardar,
  guardando,
  error,
}: {
  siniestro: SiniestroVista;
  onCerrar: () => void;
  onGuardar: (cuerpo: Record<string, unknown>) => void;
  guardando: boolean;
  error: string | null;
}) {
  const soloFecha = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
  const [f, setF] = useState({
    asegurado: s.asegurado,
    nit: s.nit ?? "",
    aseguradora: s.aseguradora ?? "",
    poliza: s.poliza ?? "",
    cobertura: s.cobertura ?? "",
    radicado: s.radicado ?? "",
    responsable: s.responsable ?? "",
    administrador: s.administrador ?? "",
    celular: s.celular ?? "",
    email: s.email ?? "",
    estadoTexto: s.estadoTexto ?? "",
    valorSiniestro: s.valorSiniestro ?? "",
    valorLiquidar: s.valorLiquidar ?? "",
    deducible: s.deducible ?? "",
    valorPagado: s.valorPagado ?? "",
    fechaOcurrencia: soloFecha(s.fechaOcurrencia),
    fechaAvisoCompania: soloFecha(s.fechaAvisoCompania),
    fechaPago: soloFecha(s.fechaPago),
    resumen: s.resumen ?? "",
  });
  const campo = (k: keyof typeof f) => ({
    value: f[k] as string | number,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setF({ ...f, [k]: e.target.value }),
  });

  return (
    <div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-3">
        <div className="col-span-2">
          <label className={claseLabel}>Cliente *</label>
          <input className={claseInput} {...campo("asegurado")} />
        </div>
        <div>
          <label className={claseLabel}>NIT</label>
          <input className={claseInput} {...campo("nit")} />
        </div>
        <div>
          <label className={claseLabel}>Aseguradora</label>
          <input className={claseInput} {...campo("aseguradora")} />
        </div>
        <div>
          <label className={claseLabel}>Póliza</label>
          <input className={claseInput} {...campo("poliza")} />
        </div>
        <div>
          <label className={claseLabel}>Radicado</label>
          <input className={claseInput} {...campo("radicado")} />
        </div>
        <div className="col-span-2">
          <label className={claseLabel}>Cobertura / evento</label>
          <input className={claseInput} {...campo("cobertura")} />
        </div>
        <div>
          <label className={claseLabel}>Responsable</label>
          <input className={claseInput} {...campo("responsable")} />
        </div>
        <div>
          <label className={claseLabel}>Administrador</label>
          <input className={claseInput} {...campo("administrador")} />
        </div>
        <div>
          <label className={claseLabel}>Celular</label>
          <input className={claseInput} {...campo("celular")} />
        </div>
        <div>
          <label className={claseLabel}>Correo</label>
          <input className={claseInput} {...campo("email")} />
        </div>
        <div>
          <label className={claseLabel}>Ocurrencia</label>
          <input type="date" className={claseInput} {...campo("fechaOcurrencia")} />
        </div>
        <div>
          <label className={claseLabel}>Aviso a la compañía</label>
          <input type="date" className={claseInput} {...campo("fechaAvisoCompania")} />
        </div>
        <div>
          <label className={claseLabel}>Fecha de pago</label>
          <input type="date" className={claseInput} {...campo("fechaPago")} />
        </div>
        <div>
          <label className={claseLabel}>Valor reclamado</label>
          <input type="number" className={claseInput} {...campo("valorSiniestro")} />
        </div>
        <div>
          <label className={claseLabel}>Valor a liquidar</label>
          <input type="number" className={claseInput} {...campo("valorLiquidar")} />
        </div>
        <div>
          <label className={claseLabel}>Deducible</label>
          <input type="number" className={claseInput} {...campo("deducible")} />
        </div>
        <div>
          <label className={claseLabel}>Valor pagado</label>
          <input type="number" className={claseInput} {...campo("valorPagado")} />
        </div>
        <div className="col-span-2 md:col-span-3">
          <label className={claseLabel}>Estado / pendiente por</label>
          <input className={claseInput} {...campo("estadoTexto")} />
        </div>
        <div className="col-span-2 md:col-span-3">
          <label className={claseLabel}>Resumen del evento</label>
          <textarea className={claseInput} rows={3} {...campo("resumen")} />
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-status-critical">{error}</p>}

      <div className="mt-5 flex justify-end gap-2 border-t border-line-grid pt-4">
        <button
          onClick={onCerrar}
          disabled={guardando}
          className="rounded-lg px-3 py-1.5 text-sm text-ink-secondary hover:bg-surface-page"
        >
          Cancelar
        </button>
        <button
          onClick={() => onGuardar(f)}
          disabled={guardando}
          className="rounded-lg bg-brand px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {guardando ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </div>
  );
}
