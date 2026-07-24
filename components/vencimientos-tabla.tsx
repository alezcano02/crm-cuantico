"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import type { Semaforo } from "@/lib/calculos";
import type { ListasFormulario } from "@/lib/queries";
import { fmtCOP, fmtFecha } from "@/lib/format";
import { EstadoPagoBadge, SemaforoBadge, Td, Th } from "@/components/ui";
import { IconCancelar, IconCheck, IconEditar, IconMas, IconRenovar } from "@/components/icons";
import { PolizaEditable, PolizaForm } from "@/components/poliza-form";
import { DialogoCancelar, DialogoRenovar } from "@/components/acciones-poliza";

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
  const [asesor, setAsesor] = useState("");
  const [ramo, setRamo] = useState("");
  const [aseguradora, setAseguradora] = useState("");
  const [estadoPago, setEstadoPago] = useState("");
  const [soloSinGestionar, setSoloSinGestionar] = useState(false);
  const [orden, setOrden] = useState<"dias" | "prima">("dias");
  const [gestionando, setGestionando] = useState<PolizaVista | null>(null);
  const [editando, setEditando] = useState<PolizaVista | null>(null);
  const [renovando, setRenovando] = useState<PolizaVista | null>(null);
  const [cancelando, setCancelando] = useState<PolizaVista | null>(null);
  const [creando, setCreando] = useState(false);

  const asesores = useMemo(
    () => opciones(polizas.flatMap((p) => [p.asesor1, p.asesor2])),
    [polizas]
  );
  const ramos = useMemo(() => opciones(polizas.map((p) => p.ramo)), [polizas]);
  const aseguradoras = useMemo(() => opciones(polizas.map((p) => p.aseguradora)), [polizas]);

  const filtradas = useMemo(() => {
    let lista = polizas;
    if (pestania === "pendientes") {
      lista = lista.filter((p) => p.dias != null && p.dias < 0);
    } else if (pestania === "proximos") {
      lista = lista.filter((p) => p.dias != null && p.dias >= 0 && p.dias <= 30);
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
    if (estadoPago) lista = lista.filter((p) => (p.estadoPago ?? "") === estadoPago);
    if (soloSinGestionar) lista = lista.filter((p) => !p.gestionada);
    return [...lista].sort((a, b) => {
      if (orden === "prima") return b.primaNeta - a.primaNeta;
      // Por días: más vencidas primero; sin fecha al final
      const da = a.dias ?? Number.MAX_SAFE_INTEGER;
      const db = b.dias ?? Number.MAX_SAFE_INTEGER;
      return da - db;
    });
  }, [polizas, pestania, asesor, ramo, aseguradora, estadoPago, soloSinGestionar, orden]);

  const enRiesgo = filtradas.filter(
    (p) => p.estadoPago === "PENDIENTE" && p.dias != null && p.dias <= 30
  ).length;

  const alGuardar = () => {
    setGestionando(null);
    setEditando(null);
    setRenovando(null);
    setCancelando(null);
    setCreando(false);
    router.refresh();
  };

  const claseSelect =
    "rounded-md border border-line-axis bg-white px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-lg border border-line-grid bg-white p-1">
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
          className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
        >
          <IconMas className="h-4 w-4" />
          Nueva póliza
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select className={claseSelect} value={ramo} onChange={(e) => setRamo(e.target.value)}>
          <option value="">Ramo: todos</option>
          {ramos.map((r) => (
            <option key={r}>{r}</option>
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
        <span className="ml-auto text-sm text-ink-muted">
          {filtradas.length} pólizas
          {enRiesgo > 0 && (
            <span className="ml-2 font-semibold text-status-critical">
              · {enRiesgo} en riesgo (pago pendiente y vencen ≤ 30 días)
            </span>
          )}
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-line-grid bg-surface">
        <table className="w-full border-collapse whitespace-nowrap">
          <thead>
            <tr>
              <Th>Semáforo</Th>
              <Th>Vencimiento</Th>
              <Th>Póliza</Th>
              <Th>Ramo</Th>
              <Th>Asegurado</Th>
              <Th>Contacto</Th>
              <Th>Aseguradora</Th>
              <Th>Asesor</Th>
              <Th derecha>Prima neta</Th>
              <Th>Pago</Th>
              <Th>Gestión</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {filtradas.map((p) => (
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
                  {p.gestionada ? (
                    <button
                      onClick={() => setGestionando(p)}
                      title={p.notaGestion ?? undefined}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-status-good hover:underline"
                    >
                      <IconCheck className="h-3.5 w-3.5" />
                      Gestionada
                    </button>
                  ) : (
                    <button
                      onClick={() => setGestionando(p)}
                      className="rounded border border-brand px-2 py-0.5 text-xs font-medium text-brand hover:bg-brand-light/40"
                    >
                      Marcar gestión
                    </button>
                  )}
                </Td>
                <Td>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setRenovando(p)}
                      title="Renovar (nuevo ciclo)"
                      className="inline-flex items-center gap-1 rounded border border-status-good/50 px-1.5 py-0.5 text-xs font-medium text-status-good hover:bg-status-good/5"
                    >
                      <IconRenovar className="h-3.5 w-3.5" />
                      Renovar
                    </button>
                    <button
                      onClick={() => setCancelando(p)}
                      title="Cancelar (mover a cancelaciones)"
                      className="rounded p-1 text-ink-muted hover:bg-status-critical/10 hover:text-status-critical"
                    >
                      <IconCancelar className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setEditando(p)}
                      title="Editar póliza"
                      className="rounded p-1 text-ink-muted hover:bg-brand-light/40 hover:text-brand"
                    >
                      <IconEditar className="h-4 w-4" />
                    </button>
                  </div>
                </Td>
              </tr>
            ))}
            {filtradas.length === 0 && (
              <tr>
                <Td className="py-6 text-center text-ink-muted" colSpan={12}>
                  No hay pólizas que cumplan los filtros.
                </Td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {gestionando && (
        <DialogoGestion
          poliza={gestionando}
          onCerrar={() => setGestionando(null)}
          onGuardado={alGuardar}
        />
      )}
      {renovando && (
        <DialogoRenovar
          poliza={renovando}
          onCerrar={() => setRenovando(null)}
          onGuardado={alGuardar}
        />
      )}
      {cancelando && (
        <DialogoCancelar
          poliza={cancelando}
          onCerrar={() => setCancelando(null)}
          onGuardado={alGuardar}
        />
      )}
      {(editando || creando) && (
        <PolizaForm
          poliza={editando}
          listas={listas}
          onCerrar={() => {
            setEditando(null);
            setCreando(false);
          }}
          onGuardado={alGuardar}
        />
      )}
    </div>
  );
}

function DialogoGestion({
  poliza,
  onCerrar,
  onGuardado,
}: {
  poliza: PolizaVista;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const [nota, setNota] = useState(poliza.notaGestion ?? "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guardar = async (gestionada: boolean) => {
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch(`/api/policies/${poliza.id}/gestion`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gestionada, nota }),
      });
      if (!res.ok) throw new Error(await res.text());
      onGuardado();
    } catch (e) {
      setError("No se pudo guardar. Intente de nuevo.");
      setGuardando(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onCerrar}
    >
      <div
        className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-bold">Gestión de renovación</h3>
        <p className="mt-1 text-sm text-ink-secondary">
          Póliza <span className="font-semibold">{poliza.numero}</span> · {poliza.ramo} ·{" "}
          {poliza.asegurado}
        </p>
        <label className="mt-4 block text-sm font-medium text-ink-secondary">
          Nota interna
          <textarea
            className="mt-1 w-full rounded-md border border-line-axis p-2 text-sm focus:border-brand focus:outline-none"
            rows={3}
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Ej: cliente contactado 20/07, espera cotización de renovación…"
          />
        </label>
        {error && <p className="mt-2 text-sm text-status-critical">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCerrar}
            disabled={guardando}
            className="rounded-md px-3 py-1.5 text-sm text-ink-secondary hover:bg-surface-page"
          >
            Cancelar
          </button>
          {poliza.gestionada && (
            <button
              onClick={() => guardar(false)}
              disabled={guardando}
              className="rounded-md border border-line-axis px-3 py-1.5 text-sm font-medium hover:bg-surface-page"
            >
              Reabrir gestión
            </button>
          )}
          <button
            onClick={() => guardar(true)}
            disabled={guardando}
            className="rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {guardando ? "Guardando…" : "Marcar como gestionada"}
          </button>
        </div>
      </div>
    </div>
  );
}
