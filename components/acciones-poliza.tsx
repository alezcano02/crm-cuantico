"use client";

import { useState } from "react";
import { fmtCOP } from "@/lib/format";
import { IconCancelar, IconRenovar } from "@/components/icons";

interface PolizaMin {
  id: number;
  numero: string;
  ramo: string;
  asegurado: string;
  aseguradora: string | null;
  primaNeta: number;
  primaTotal: number;
  vencimiento: string | null; // ISO
}

function hoyISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Suma un año a una fecha ISO (YYYY-MM-DD…); si no hay, usa hoy + 1 año. */
function masUnAnio(iso: string | null): string {
  const base = iso ? iso.slice(0, 10) : hoyISO();
  const [y, m, d] = base.split("-").map(Number);
  return `${y + 1}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const claseInput =
  "w-full rounded-md border border-line-axis bg-white px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none";
const claseLabel = "block text-xs font-semibold uppercase tracking-wide text-ink-muted";

function Modal({
  titulo,
  poliza,
  children,
  onCerrar,
}: {
  titulo: string;
  poliza: PolizaMin;
  children: React.ReactNode;
  onCerrar: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onCerrar}
    >
      <div
        className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-bold">{titulo}</h3>
        <p className="mt-1 text-sm text-ink-secondary">
          Póliza <span className="font-semibold">{poliza.numero}</span> · {poliza.ramo} ·{" "}
          {poliza.asegurado}
          {poliza.aseguradora ? ` · ${poliza.aseguradora}` : ""}
        </p>
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Renovar: adelanta el vencimiento un año (editable), actualiza prima y pago.
// ---------------------------------------------------------------------------

export function DialogoRenovar({
  poliza,
  onCerrar,
  onGuardado,
}: {
  poliza: PolizaMin;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const [vencimiento, setVencimiento] = useState(masUnAnio(poliza.vencimiento));
  const [primaNeta, setPrimaNeta] = useState(String(poliza.primaNeta));
  const [primaTotal, setPrimaTotal] = useState(String(poliza.primaTotal));
  const [estadoPago, setEstadoPago] = useState("PENDIENTE");
  const [fechaMaxPago, setFechaMaxPago] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch(`/api/policies/${poliza.id}/renovar`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vencimiento, primaNeta, primaTotal, estadoPago, fechaMaxPago }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al renovar.");
      onGuardado();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setGuardando(false);
    }
  };

  return (
    <Modal titulo="Renovar póliza" poliza={poliza} onCerrar={onCerrar}>
      <p className="mt-3 rounded-md bg-brand-light/30 px-3 py-2 text-xs text-ink-secondary">
        La póliza pasa a RENOVACION con el nuevo vencimiento (un año después por
        defecto). Con esto entra en la producción del ciclo correspondiente y
        sale de la lista de pendientes.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
        <div className="col-span-2">
          <label className={claseLabel}>Nuevo vencimiento *</label>
          <input
            type="date"
            className={claseInput}
            value={vencimiento}
            onChange={(e) => setVencimiento(e.target.value)}
          />
        </div>
        <div>
          <label className={claseLabel}>Prima neta</label>
          <input
            type="number"
            className={claseInput}
            value={primaNeta}
            onChange={(e) => setPrimaNeta(e.target.value)}
          />
        </div>
        <div>
          <label className={claseLabel}>Prima total</label>
          <input
            type="number"
            className={claseInput}
            value={primaTotal}
            onChange={(e) => setPrimaTotal(e.target.value)}
          />
        </div>
        <div>
          <label className={claseLabel}>Estado de pago</label>
          <select
            className={claseInput}
            value={estadoPago}
            onChange={(e) => setEstadoPago(e.target.value)}
          >
            <option value="PENDIENTE">PENDIENTE</option>
            <option value="OK PAGO">OK PAGO</option>
          </select>
        </div>
        <div>
          <label className={claseLabel}>Fecha máx. pago</label>
          <input
            type="date"
            className={claseInput}
            value={fechaMaxPago}
            onChange={(e) => setFechaMaxPago(e.target.value)}
          />
        </div>
      </div>
      {error && <p className="mt-3 text-sm text-status-critical">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button
          onClick={onCerrar}
          disabled={guardando}
          className="rounded-md px-3 py-1.5 text-sm text-ink-secondary hover:bg-surface-page"
        >
          Cancelar
        </button>
        <button
          onClick={guardar}
          disabled={guardando}
          className="inline-flex items-center gap-1.5 rounded-md bg-brand px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          <IconRenovar className="h-4 w-4" />
          {guardando ? "Renovando…" : "Renovar póliza"}
        </button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Cancelar: crea el registro en cancelaciones y retira la póliza de la cartera.
// ---------------------------------------------------------------------------

export function DialogoCancelar({
  poliza,
  onCerrar,
  onGuardado,
}: {
  poliza: PolizaMin;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const vencISO = poliza.vencimiento ? poliza.vencimiento.slice(0, 10) : "";
  // modo "cancelacion": cancelación real con fecha propia.
  // modo "no_renovada": la póliza llegó a su renovación y no se renovó; no hay
  // fecha de cancelación, solo la de renovación (su vencimiento).
  const [modo, setModo] = useState<"cancelacion" | "no_renovada">("cancelacion");
  const [fechaCancelacion, setFechaCancelacion] = useState(hoyISO());
  const [fechaRenovacion, setFechaRenovacion] = useState(vencISO);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const noRenovada = modo === "no_renovada";

  const elegirNoRenovada = () => {
    setModo("no_renovada");
    // Trae automáticamente la fecha de renovación (el vencimiento vigente).
    setFechaRenovacion(vencISO);
  };

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch(`/api/policies/${poliza.id}/cancelar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          noRenovada,
          fechaCancelacion: noRenovada ? null : fechaCancelacion,
          fechaRenovacion,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al cancelar.");
      onGuardado();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setGuardando(false);
    }
  };

  const claseTab = (activo: boolean) =>
    `flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
      activo ? "bg-status-critical text-white" : "text-ink-secondary hover:bg-surface-page"
    }`;

  return (
    <Modal titulo="Cancelar / No renovar póliza" poliza={poliza} onCerrar={onCerrar}>
      <div className="mt-3 flex gap-1 rounded-lg border border-line-grid bg-surface-page p-1">
        <button
          type="button"
          onClick={() => setModo("cancelacion")}
          className={claseTab(modo === "cancelacion")}
        >
          Cancelación
        </button>
        <button type="button" onClick={elegirNoRenovada} className={claseTab(noRenovada)}>
          No renovada
        </button>
      </div>

      <p className="mt-3 rounded-md bg-status-critical/5 px-3 py-2 text-xs text-ink-secondary">
        {noRenovada ? (
          <>
            La póliza no se renueva: se registra su <b>fecha de renovación</b> (su
            vencimiento) sin fecha de cancelación. Cuenta como producción
            cancelada, no como cancelación del mes.
          </>
        ) : (
          <>
            La póliza se moverá al histórico de <b>cancelaciones</b> (prima{" "}
            {fmtCOP(poliza.primaNeta)}) y saldrá de la cartera activa.
          </>
        )}{" "}
        Este registro se conserva aunque se reimporte el Excel.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
        <div>
          <label className={claseLabel}>
            Fecha de cancelación {noRenovada ? "" : "*"}
          </label>
          <input
            type="date"
            className={`${claseInput} disabled:cursor-not-allowed disabled:bg-surface-page disabled:text-ink-muted`}
            value={noRenovada ? "" : fechaCancelacion}
            onChange={(e) => setFechaCancelacion(e.target.value)}
            disabled={noRenovada}
            placeholder={noRenovada ? "No aplica" : undefined}
          />
        </div>
        <div>
          <label className={claseLabel}>
            Fecha de renovación {noRenovada ? "*" : ""}
          </label>
          <input
            type="date"
            className={claseInput}
            value={fechaRenovacion}
            onChange={(e) => setFechaRenovacion(e.target.value)}
          />
        </div>
      </div>
      <p className="mt-1.5 text-[11px] text-ink-muted">
        {noRenovada
          ? "Sin fecha de cancelación: no suma a las cancelaciones del mes, solo a la producción cancelada por mes de renovación."
          : "La fecha de cancelación alimenta la métrica de cancelaciones; la de renovación, la producción cancelada."}
      </p>

      {error && <p className="mt-3 text-sm text-status-critical">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button
          onClick={onCerrar}
          disabled={guardando}
          className="rounded-md px-3 py-1.5 text-sm text-ink-secondary hover:bg-surface-page"
        >
          Volver
        </button>
        <button
          onClick={guardar}
          disabled={guardando}
          className="inline-flex items-center gap-1.5 rounded-md bg-status-critical px-4 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          <IconCancelar className="h-4 w-4" />
          {guardando
            ? "Guardando…"
            : noRenovada
              ? "Marcar como no renovada"
              : "Confirmar cancelación"}
        </button>
      </div>
    </Modal>
  );
}
