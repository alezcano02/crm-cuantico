"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import type { Semaforo } from "@/lib/calculos";
import type { ListasFormulario } from "@/lib/queries";
import { fmtCOP, fmtFecha } from "@/lib/format";
import { EstadoPagoBadge, SemaforoBadge, Td, Th } from "@/components/ui";
import { IconCheck, IconMas } from "@/components/icons";
import { PolizaEditable, PolizaForm } from "@/components/poliza-form";
import { BotonExportar } from "@/components/boton-exportar";
import { GestionarPoliza } from "@/components/gestionar-poliza";
import { Paginacion, usePaginacion } from "@/components/paginacion";
import { PanelFiltros } from "@/components/panel-filtros";

export interface PolizaVista extends PolizaEditable {
  id: number;
  dias: number | null;
  semaforo: Semaforo | null;
  gestionada: boolean;
  notaGestion: string | null;
}

type Pestania = "pendientes" | "proximos" | "todas";

const PESTANIAS: { id: Pestania; etiqueta: string }[] = [
  { id: "pendientes", etiqueta: "Pendientes de renovar (vencidas)" },
  { id: "proximos", etiqueta: "Próximos a vencer (0–30 días)" },
  { id: "todas", etiqueta: "Toda la cartera" },
];

function normalizar(v: string): string {
  return v.trim().replace(/\s+/g, " ");
}

function opciones(valores: (string | null)[]): string[] {
  return Array.from(
    new Set(valores.filter((v): v is string => !!v).map(normalizar).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, "es"));
}

export function VencimientosTabla({
  polizas,
  listas,
}: {
  polizas: PolizaVista[];
  listas: ListasFormulario;
}) {
  const router = useRouter();
  const [pestania, setPestania] = useState<Pestania>("pendientes");
  const [q, setQ] = useState("");
  const [asesor, setAsesor] = useState("");
  const [ramo, setRamo] = useState("");
  const [aseguradora, setAseguradora] = useState("");
  const [tipoNegocio, setTipoNegocio] = useState("");
  const [estadoPago, setEstadoPago] = useState("");
  const [soloSinGestionar, setSoloSinGestionar] = useState(false);
  const [orden, setOrden] = useState<"dias" | "prima">("dias");
  const [gestionando, setGestionando] = useState<PolizaVista | null>(null);
  const [creando, setCreando] = useState(false);

  const asesores = useMemo(
    () => opciones(polizas.flatMap((p) => [p.asesor1, p.asesor2])),
    [polizas]
  );
  const ramos = useMemo(() => opciones(polizas.map((p) => p.ramo)), [polizas]);
  const aseguradoras = useMemo(() => opciones(polizas.map((p) => p.aseguradora)), [polizas]);
  const tiposNegocio = useMemo(() => opciones(polizas.map((p) => p.tipoNegocio)), [polizas]);

  const filtradas = useMemo(() => {
    let lista = polizas;
    if (pestania === "pendientes") {
      lista = lista.filter((p) => p.dias != null && p.dias < 0);
    } else if (pestania === "proximos") {
      lista = lista.filter((p) => p.dias != null && p.dias >= 0 && p.dias <= 30);
    }
    // Buscador libre: mismo criterio que la pantalla de Búsqueda
    // (número de póliza, nombre del asegurado o CC/NIT).
    if (q.trim()) {
      const t = q.trim().toLowerCase();
      lista = lista.filter(
        (p) =>
          p.numero.toLowerCase().includes(t) ||
          p.asegurado.toLowerCase().includes(t) ||
          (p.ccNit ?? "").toLowerCase().includes(t)
      );
    }
    if (asesor)
      lista = lista.filter(
        (p) =>
          (p.asesor1 && normalizar(p.asesor1) === asesor) ||
          (p.asesor2 && normalizar(p.asesor2) === asesor)
      );
    if (ramo) lista = lista.filter((p) => normalizar(p.ramo) === ramo);
    if (aseguradora)
      lista = lista.filter((p) => p.aseguradora && normalizar(p.aseguradora) === aseguradora);
    if (tipoNegocio)
      lista = lista.filter((p) => p.tipoNegocio && normalizar(p.tipoNegocio) === tipoNegocio);
    if (estadoPago) lista = lista.filter((p) => (p.estadoPago ?? "") === estadoPago);
    if (soloSinGestionar) lista = lista.filter((p) => !p.gestionada);
    return [...lista].sort((a, b) => {
      if (orden === "prima") return b.primaNeta - a.primaNeta;
      // Por días: más vencidas primero; sin fecha al final
      const da = a.dias ?? Number.MAX_SAFE_INTEGER;
      const db = b.dias ?? Number.MAX_SAFE_INTEGER;
      return da - db;
    });
  }, [
    polizas, pestania, q, asesor, ramo, aseguradora, tipoNegocio,
    estadoPago, soloSinGestionar, orden,
  ]);

  const enRiesgo = filtradas.filter(
    (p) => p.estadoPago === "PENDIENTE" && p.dias != null && p.dias <= 30
  ).length;

  const alGuardar = () => {
    setGestionando(null);
    setCreando(false);
    router.refresh();
  };

  const limpiar = () => {
    setQ("");
    setAsesor("");
    setRamo("");
    setAseguradora("");
    setTipoNegocio("");
    setEstadoPago("");
    setSoloSinGestionar(false);
  };

  const hayFiltros =
    q || asesor || ramo || aseguradora || tipoNegocio || estadoPago || soloSinGestionar;

  const claseSelect =
    "rounded-lg border border-line-axis bg-surface px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none";

  // Solo se pintan 100 filas por página; los filtros siguen sobre el total.
  const { visibles, pagina, setPagina, totalPaginas } = usePaginacion(filtradas);

  return (
    <div className="space-y-4">
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
        <button
          onClick={() => setCreando(true)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
        >
          <IconMas className="h-4 w-4" />
          Nueva póliza
        </button>
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
        <select className={claseSelect} value={ramo} onChange={(e) => setRamo(e.target.value)}>
          <option value="">Ramo: todos</option>
          {ramos.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
        <select
          className={claseSelect}
          value={tipoNegocio}
          onChange={(e) => setTipoNegocio(e.target.value)}
        >
          <option value="">Tipo negocio: todos</option>
          {tiposNegocio.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <select className={claseSelect} value={asesor} onChange={(e) => setAsesor(e.target.value)}>
          <option value="">Asesor: todos</option>
          {asesores.map((a) => (
            <option key={a}>{a}</option>
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
        <select
          className={claseSelect}
          value={estadoPago}
          onChange={(e) => setEstadoPago(e.target.value)}
        >
          <option value="">Pago: todos</option>
          <option value="OK PAGO">OK PAGO</option>
          <option value="PENDIENTE">PENDIENTE</option>
        </select>
        <select
          className={claseSelect}
          value={orden}
          onChange={(e) => setOrden(e.target.value as "dias" | "prima")}
        >
          <option value="dias">Orden: más vencidas primero</option>
          <option value="prima">Orden: mayor prima neta</option>
        </select>
        <label className="flex items-center gap-1.5 text-sm text-ink-secondary">
          <input
            type="checkbox"
            checked={soloSinGestionar}
            onChange={(e) => setSoloSinGestionar(e.target.checked)}
          />
          Solo sin gestionar
        </label>
        {hayFiltros && (
          <button
            onClick={limpiar}
            className="rounded-lg border border-line-axis px-2.5 py-1.5 text-sm text-ink-secondary hover:bg-surface-page"
          >
            Limpiar
          </button>
        )}
        <span className="ml-auto text-sm text-ink-muted">
          {filtradas.length} pólizas
          {enRiesgo > 0 && (
            <span className="ml-2 font-semibold text-status-critical">
              · {enRiesgo} en riesgo (pago pendiente y vencen ≤ 30 días)
            </span>
          )}
        </span>
        <BotonExportar
          nombre="vencimientos"
          filas={filtradas}
          columnas={[
            { encabezado: "Días al vence", valor: (p) => p.dias ?? "" },
            { encabezado: "Estado", valor: (p) => p.semaforo ?? "" },
            {
              encabezado: "Vencimiento",
              valor: (p) => (p.vencimiento ? new Date(p.vencimiento) : null),
            },
            { encabezado: "Póliza", valor: (p) => p.numero },
            { encabezado: "Ramo", valor: (p) => p.ramo },
            { encabezado: "Placa", valor: (p) => p.placa ?? "" },
            { encabezado: "Tipo negocio", valor: (p) => p.tipoNegocio ?? "" },
            { encabezado: "Asegurado", valor: (p) => p.asegurado },
            { encabezado: "CC/NIT", valor: (p) => p.ccNit ?? "" },
            { encabezado: "Aseguradora", valor: (p) => p.aseguradora ?? "" },
            { encabezado: "Asesor 1", valor: (p) => p.asesor1 ?? "" },
            { encabezado: "Asesor 2", valor: (p) => p.asesor2 ?? "" },
            { encabezado: "Prima neta", valor: (p) => p.primaNeta },
            { encabezado: "Prima total", valor: (p) => p.primaTotal },
            { encabezado: "Estado de pago", valor: (p) => p.estadoPago ?? "" },
            { encabezado: "Celular", valor: (p) => p.celular ?? "" },
            { encabezado: "Correo", valor: (p) => p.correo ?? "" },
            { encabezado: "Gestionada", valor: (p) => (p.gestionada ? "SÍ" : "NO") },
            { encabezado: "Nota de gestión", valor: (p) => p.notaGestion ?? "" },
          ]}
        />
      </div>
      </PanelFiltros>

      <div className="overflow-x-auto scroll-fino rounded-xl border border-line-grid bg-surface">
        <table className="w-full border-collapse whitespace-nowrap">
          <thead>
            <tr>
              <Th>Semáforo</Th>
              <Th>Vencimiento</Th>
              <Th>Póliza</Th>
              <Th>Ramo</Th>
              <Th>Placa</Th>
              <Th>Tipo negocio</Th>
              <Th>Asegurado</Th>
              <Th>Contacto</Th>
              <Th>Aseguradora</Th>
              <Th>Asesor</Th>
              <Th derecha>Prima neta</Th>
              <Th>Pago</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {visibles.map((p) => (
              <tr
                key={p.id}
                className={clsx("hover:bg-surface-page", p.gestionada && "opacity-60")}
              >
                <Td>
                  <SemaforoBadge nivel={p.semaforo} dias={p.dias} />
                </Td>
                <Td>{fmtFecha(p.vencimiento)}</Td>
                <Td className="font-medium">{p.numero}</Td>
                <Td>{p.ramo}</Td>
                <Td>
                  {p.placa ? (
                    <span className="rounded bg-surface-sunken px-1.5 py-0.5 text-[11px] font-semibold tracking-wide">
                      {p.placa}
                    </span>
                  ) : (
                    <span className="text-ink-muted">—</span>
                  )}
                </Td>
                <Td>
                  {p.tipoNegocio ? (
                    <span className="rounded bg-surface-sunken px-1.5 py-0.5 text-[11px] font-medium text-ink-secondary">
                      {p.tipoNegocio}
                    </span>
                  ) : (
                    <span className="text-ink-muted">—</span>
                  )}
                </Td>
                <Td>
                  <div className="max-w-[220px] truncate" title={p.asegurado}>
                    {p.asegurado}
                  </div>
                  {p.ccNit && <div className="text-[11px] text-ink-muted">{p.ccNit}</div>}
                </Td>
                <Td>
                  <div className="text-xs">
                    {p.celular && <div>{p.celular}</div>}
                    {p.correo && (
                      <div className="max-w-[180px] truncate text-ink-muted" title={p.correo}>
                        {p.correo}
                      </div>
                    )}
                    {!p.celular && !p.correo && <span className="text-ink-muted">—</span>}
                  </div>
                </Td>
                <Td>{p.aseguradora ?? "—"}</Td>
                <Td>
                  <div className="text-xs">
                    <div>{p.asesor1 ?? "—"}</div>
                    {p.asesor2 && <div className="text-ink-muted">{p.asesor2}</div>}
                  </div>
                </Td>
                <Td derecha>{fmtCOP(p.primaNeta)}</Td>
                <Td>
                  <EstadoPagoBadge estado={p.estadoPago} />
                </Td>
                <Td>
                  <div className="flex items-center gap-2">
                    {p.gestionada && (
                      <span
                        title={p.notaGestion ?? "Gestionada"}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-status-good"
                      >
                        <IconCheck className="h-3.5 w-3.5" />
                        Gestionada
                      </span>
                    )}
                    <button
                      onClick={() => setGestionando(p)}
                      className="inline-flex items-center gap-1 rounded-lg border border-brand/40 px-2.5 py-1 text-xs font-semibold text-brand hover:bg-brand-light/40"
                    >
                      Gestionar
                    </button>
                  </div>
                </Td>
              </tr>
            ))}
            {filtradas.length === 0 && (
              <tr>
                <Td className="py-6 text-center text-ink-muted" colSpan={13}>
                  No hay pólizas que cumplan los filtros.
                </Td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Paginacion
        pagina={pagina}
        totalPaginas={totalPaginas}
        onCambiar={setPagina}
        total={filtradas.length}
        etiqueta="pólizas"
      />

      {gestionando && (
        <GestionarPoliza
          poliza={gestionando}
          listas={listas}
          pestaniaInicial="gestion"
          onCerrar={() => setGestionando(null)}
          onGuardado={alGuardar}
        />
      )}
      {creando && (
        <PolizaForm
          poliza={null}
          listas={listas}
          onCerrar={() => setCreando(false)}
          onGuardado={alGuardar}
        />
      )}
    </div>
  );
}
