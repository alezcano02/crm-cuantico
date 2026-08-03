"use client";

import { useState } from "react";
import clsx from "clsx";
import type { ListasFormulario } from "@/lib/queries";
import { fmtCOP, fmtFecha } from "@/lib/format";
import { primaNoCausada } from "@/lib/calculos";
import {
  IconCancelar,
  IconCarpeta,
  IconCheck,
  IconDinero,
  IconEditar,
  IconRenovar,
} from "@/components/icons";
import { urlBusqueda } from "@/lib/carpetas";
import { PolizaEditable, CamposPoliza } from "@/components/poliza-form";
import { exigirOk } from "@/lib/respuesta";

export interface PolizaGestionable extends PolizaEditable {
  id: number;
  valorCuota?: number | null;
  notaCartera?: string | null;
  gestionada?: boolean;
  notaGestion?: string | null;
}

type Pestania = "pago" | "documentos" | "editar" | "renovar" | "cancelar" | "gestion";

const PESTANIAS: { id: Pestania; etiqueta: string; Icono: (p: { className?: string }) => JSX.Element }[] = [
  { id: "pago", etiqueta: "Registrar pago", Icono: IconDinero },
  { id: "documentos", etiqueta: "Documentos", Icono: IconCarpeta },
  { id: "editar", etiqueta: "Editar datos", Icono: IconEditar },
  { id: "renovar", etiqueta: "Renovar", Icono: IconRenovar },
  { id: "cancelar", etiqueta: "Cancelar", Icono: IconCancelar },
  { id: "gestion", etiqueta: "Nota de gestión", Icono: IconCheck },
];

export const claseInput =
  "w-full rounded-md border border-line-axis bg-white px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none";
export const claseLabel =
  "block text-xs font-semibold uppercase tracking-wide text-ink-muted";

function hoyISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function sumarMeses(iso: string, meses: number): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1 + meses, d));
  return base.toISOString().slice(0, 10);
}

function masUnAnio(iso: string | null): string {
  return sumarMeses(iso ? iso.slice(0, 10) : hoyISO(), 12);
}

/**
 * Modal único de gestión de una póliza: registrar pago (total o por cuotas),
 * editar sus datos, renovarla o cancelarla. Sustituye a los botones sueltos
 * que antes había en cada fila.
 */
export function GestionarPoliza({
  poliza,
  listas,
  pestaniaInicial = "pago",
  onCerrar,
  onGuardado,
}: {
  poliza: PolizaGestionable;
  listas: ListasFormulario;
  pestaniaInicial?: Pestania;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const [pestania, setPestania] = useState<Pestania>(pestaniaInicial);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/45 p-4 py-[6vh]"
      onClick={onCerrar}
    >
      <div
        className="w-full max-w-2xl rounded-xl bg-surface shadow-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-line-grid px-5 pt-4">
          <h3 className="text-base font-bold">Gestionar póliza {poliza.numero}</h3>
          <p className="mt-0.5 text-sm text-ink-secondary">
            {poliza.ramo}
            {poliza.aseguradora ? ` · ${poliza.aseguradora}` : ""} · {poliza.asegurado}
          </p>
          <div className="mt-3 flex flex-wrap gap-1">
            {PESTANIAS.map(({ id, etiqueta, Icono }) => (
              <button
                key={id}
                onClick={() => setPestania(id)}
                className={clsx(
                  "-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                  pestania === id
                    ? "border-brand text-brand"
                    : "border-transparent text-ink-secondary hover:text-ink"
                )}
              >
                <Icono className="h-4 w-4" />
                {etiqueta}
              </button>
            ))}
          </div>
        </div>

        <div className="px-5 py-4">
          {pestania === "pago" && (
            <PanelPago poliza={poliza} onCerrar={onCerrar} onGuardado={onGuardado} />
          )}
          {pestania === "editar" && (
            <PanelEditar
              poliza={poliza}
              listas={listas}
              onCerrar={onCerrar}
              onGuardado={onGuardado}
            />
          )}
          {pestania === "renovar" && (
            <PanelRenovar poliza={poliza} onCerrar={onCerrar} onGuardado={onGuardado} />
          )}
          {pestania === "cancelar" && (
            <PanelCancelar poliza={poliza} onCerrar={onCerrar} onGuardado={onGuardado} />
          )}
          {pestania === "documentos" && <PanelDocumentos poliza={poliza} />}
          {pestania === "gestion" && (
            <PanelGestion poliza={poliza} onCerrar={onCerrar} onGuardado={onGuardado} />
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Botonera común a todos los paneles
// ---------------------------------------------------------------------------

function Acciones({
  onCerrar,
  onGuardar,
  guardando,
  etiqueta,
  peligro,
  extra,
}: {
  onCerrar: () => void;
  onGuardar: () => void;
  guardando: boolean;
  etiqueta: string;
  peligro?: boolean;
  extra?: React.ReactNode;
}) {
  return (
    <div className="mt-5 flex items-center gap-2 border-t border-line-grid pt-4">
      {extra}
      <div className="ml-auto flex gap-2">
        <button
          onClick={onCerrar}
          disabled={guardando}
          className="rounded-lg px-3 py-1.5 text-sm text-ink-secondary hover:bg-surface-page"
        >
          Cerrar
        </button>
        <button
          onClick={onGuardar}
          disabled={guardando}
          className={clsx(
            "rounded-lg px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50",
            peligro ? "bg-status-critical hover:opacity-90" : "bg-brand hover:bg-brand-dark"
          )}
        >
          {guardando ? "Guardando…" : etiqueta}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pago: total o por cuotas
// ---------------------------------------------------------------------------

function PanelPago({
  poliza,
  onCerrar,
  onGuardado,
}: {
  poliza: PolizaGestionable;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const pagada = (poliza.estadoPago ?? "").toUpperCase() === "OK PAGO";
  const [modo, setModo] = useState<"total" | "cuota">("total");
  const [fechaPago, setFechaPago] = useState(hoyISO());
  const [valorCuota, setValorCuota] = useState(
    poliza.valorCuota != null ? String(poliza.valorCuota) : ""
  );
  const [proximaFecha, setProximaFecha] = useState(sumarMeses(hoyISO(), 1));
  const [nota, setNota] = useState(poliza.notaCartera ?? "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enviar = async (cuerpo: Record<string, unknown>) => {
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch(`/api/policies/${poliza.id}/pago`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...cuerpo, notaCartera: nota }),
      });
      const json = await exigirOk(res, "Error al registrar el pago.");
      onGuardado();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setGuardando(false);
    }
  };

  const claseOpcion = (activo: boolean) =>
    clsx(
      "flex-1 rounded-lg border px-3 py-2.5 text-left transition-colors",
      activo
        ? "border-brand bg-brand-light/40 ring-1 ring-brand"
        : "border-line-axis hover:border-brand-300"
    );

  return (
    <div>
      <div className="mb-4 flex items-center justify-between rounded-lg bg-surface-page px-3 py-2 text-sm">
        <span className="text-ink-secondary">
          Estado actual:{" "}
          <b className={pagada ? "text-status-good" : "text-[#8a6100]"}>
            {pagada ? "OK PAGO" : "PENDIENTE"}
          </b>
        </span>
        <span className="tabla-num text-ink-secondary">
          Prima total {fmtCOP(poliza.primaTotal)}
          {poliza.fechaMaxPago && ` · límite ${fmtFecha(poliza.fechaMaxPago)}`}
        </span>
      </div>

      <div className="flex gap-2">
        <button type="button" onClick={() => setModo("total")} className={claseOpcion(modo === "total")}>
          <div className="text-sm font-semibold">Pago total</div>
          <div className="mt-0.5 text-xs text-ink-muted">
            La póliza queda a paz y salvo (OK PAGO).
          </div>
        </button>
        <button type="button" onClick={() => setModo("cuota")} className={claseOpcion(modo === "cuota")}>
          <div className="text-sm font-semibold">Pago de cuota</div>
          <div className="mt-0.5 text-xs text-ink-muted">
            Sigue pendiente; se agenda la próxima cuota.
          </div>
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
        <div>
          <label className={claseLabel}>Fecha del pago</label>
          <input
            type="date"
            className={claseInput}
            value={fechaPago}
            onChange={(e) => setFechaPago(e.target.value)}
          />
        </div>
        {modo === "cuota" && (
          <>
            <div>
              <label className={claseLabel}>Valor de la cuota</label>
              <input
                type="number"
                className={claseInput}
                value={valorCuota}
                onChange={(e) => setValorCuota(e.target.value)}
                placeholder="Ej: 301950"
              />
            </div>
            <div>
              <label className={claseLabel}>Fecha próxima cuota *</label>
              <input
                type="date"
                className={claseInput}
                value={proximaFecha}
                onChange={(e) => setProximaFecha(e.target.value)}
              />
              <div className="mt-1 flex gap-1">
                {[1, 2, 3, 6].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setProximaFecha(sumarMeses(fechaPago, m))}
                    className="rounded border border-line-axis px-1.5 py-0.5 text-[11px] text-ink-secondary hover:border-brand-300 hover:text-brand"
                  >
                    +{m} {m === 1 ? "mes" : "meses"}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
        <div className={modo === "cuota" ? "col-span-2" : ""}>
          <label className={claseLabel}>Observación de cartera</label>
          <input
            className={claseInput}
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Ej: PENDIENTE AMPLIACIÓN"
          />
          <p className="mt-1 text-[11px] text-ink-muted">
            Aparece en el informe de cartera junto a la póliza.
          </p>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-status-critical">{error}</p>}

      <Acciones
        onCerrar={onCerrar}
        guardando={guardando}
        etiqueta={modo === "total" ? "Registrar pago total" : "Registrar cuota"}
        onGuardar={() =>
          enviar(
            modo === "total"
              ? { modo: "total", fechaPago }
              : { modo: "cuota", fechaPago, valorCuota, proximaFecha }
          )
        }
        extra={
          pagada ? (
            <button
              onClick={() => enviar({ modo: "revertir" })}
              disabled={guardando}
              className="rounded-lg border border-line-axis px-3 py-1.5 text-sm font-medium text-ink-secondary hover:bg-surface-page"
            >
              Revertir pago
            </button>
          ) : undefined
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editar datos (reutiliza los campos del formulario de póliza)
// ---------------------------------------------------------------------------

function PanelEditar({
  poliza,
  listas,
  onCerrar,
  onGuardado,
}: {
  poliza: PolizaGestionable;
  listas: ListasFormulario;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const [f, setF] = useState<PolizaEditable>(poliza);
  const [guardando, setGuardando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const soloFecha = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch(`/api/policies/${poliza.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...f,
          fechaPago: soloFecha(f.fechaPago),
          fechaMaxPago: soloFecha(f.fechaMaxPago),
          vencimiento: soloFecha(f.vencimiento),
          fechaNacimiento: soloFecha(f.fechaNacimiento),
        }),
      });
      const json = await exigirOk(res, "Error al guardar.");
      onGuardado();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setGuardando(false);
    }
  };

  const eliminar = async () => {
    setGuardando(true);
    try {
      const res = await fetch(`/api/policies/${poliza.id}`, { method: "DELETE" });
      await exigirOk(res, "Error al eliminar.");
      onGuardado();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setGuardando(false);
    }
  };

  return (
    <div>
      <CamposPoliza f={f} setF={setF} listas={listas} />
      {error && <p className="mt-3 text-sm text-status-critical">{error}</p>}
      <Acciones
        onCerrar={onCerrar}
        onGuardar={guardar}
        guardando={guardando}
        etiqueta="Guardar cambios"
        extra={
          confirmando ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-status-critical">¿Eliminar?</span>
              <button
                onClick={eliminar}
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
              Eliminar póliza
            </button>
          )
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Renovar
// ---------------------------------------------------------------------------

function PanelRenovar({
  poliza,
  onCerrar,
  onGuardado,
}: {
  poliza: PolizaGestionable;
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
      const json = await exigirOk(res, "Error al renovar.");
      onGuardado();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setGuardando(false);
    }
  };

  return (
    <div>
      <p className="rounded-lg bg-brand-light/40 px-3 py-2 text-xs text-ink-secondary">
        La póliza pasa a RENOVACION con el nuevo vencimiento (un año después por
        defecto). Entra en la producción del ciclo correspondiente y sale de la
        lista de pendientes.
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
      <Acciones
        onCerrar={onCerrar}
        onGuardar={guardar}
        guardando={guardando}
        etiqueta="Renovar póliza"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Documentos: carpeta del cliente en la unidad compartida (SharePoint)
// ---------------------------------------------------------------------------

function PanelDocumentos({ poliza }: { poliza: PolizaGestionable }) {
  // Se busca por el nombre del asegurado en el sitio de SharePoint. No se
  // arman enlaces directos a la carpeta: las direcciones construidas a mano
  // daban error al abrirlas.
  const nombre = poliza.asegurado;
  return (
    <div>
      <p className="rounded-lg bg-surface-page px-3 py-2 text-xs text-ink-secondary">
        Los documentos del cliente están en la unidad compartida de la empresa.
        El botón abre el buscador de SharePoint con el nombre del asegurado ya
        escrito, en una pestaña nueva.
      </p>

      <a
        href={urlBusqueda(nombre)}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-dark"
      >
        <IconCarpeta className="h-4 w-4" />
        Buscar en SharePoint
      </a>

      <p className="mt-2.5 text-xs text-ink-muted">
        Se buscará: <span className="font-medium text-ink-secondary">{nombre}</span>
      </p>

      {poliza.ccNit && (
        <>
          <p className="mt-4 text-xs text-ink-muted">
            Si el nombre está escrito distinto en la carpeta, pruebe con el
            documento:
          </p>
          <a
            href={urlBusqueda(poliza.ccNit)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1.5 inline-flex items-center gap-2 rounded-lg border border-line-axis px-3 py-1.5 text-sm font-medium text-ink-secondary hover:border-brand-300 hover:text-brand"
          >
            Buscar por CC/NIT {poliza.ccNit}
          </a>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Nota de gestión de renovación (marca la póliza como ya gestionada)
// ---------------------------------------------------------------------------

function PanelGestion({
  poliza,
  onCerrar,
  onGuardado,
}: {
  poliza: PolizaGestionable;
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
      await exigirOk(res, "No se pudo guardar.");
      onGuardado();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setGuardando(false);
    }
  };

  return (
    <div>
      <p className="rounded-lg bg-surface-page px-3 py-2 text-xs text-ink-secondary">
        Marque la póliza como gestionada cuando ya haya contactado al cliente
        para la renovación. Sale de la lista de pendientes por gestionar.
        {poliza.gestionada && (
          <b className="ml-1 text-status-good">Actualmente está marcada como gestionada.</b>
        )}
      </p>
      <label className="mt-4 block">
        <span className={claseLabel}>Nota interna</span>
        <textarea
          className={`${claseInput} mt-1`}
          rows={4}
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Ej: cliente contactado 20/07, espera cotización de renovación…"
        />
      </label>
      {error && <p className="mt-3 text-sm text-status-critical">{error}</p>}
      <Acciones
        onCerrar={onCerrar}
        onGuardar={() => guardar(true)}
        guardando={guardando}
        etiqueta="Marcar como gestionada"
        extra={
          poliza.gestionada ? (
            <button
              onClick={() => guardar(false)}
              disabled={guardando}
              className="rounded-lg border border-line-axis px-3 py-1.5 text-sm font-medium text-ink-secondary hover:bg-surface-page"
            >
              Reabrir gestión
            </button>
          ) : undefined
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cancelar / No renovada
// ---------------------------------------------------------------------------

function PanelCancelar({
  poliza,
  onCerrar,
  onGuardado,
}: {
  poliza: PolizaGestionable;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const vencISO = poliza.vencimiento ? poliza.vencimiento.slice(0, 10) : "";
  const [modo, setModo] = useState<"cancelacion" | "no_renovada">("cancelacion");
  const [fechaCancelacion, setFechaCancelacion] = useState(hoyISO());
  const [fechaRenovacion, setFechaRenovacion] = useState(vencISO);
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const noRenovada = modo === "no_renovada";

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
          motivo,
        }),
      });
      const json = await exigirOk(res, "Error al cancelar.");
      onGuardado();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setGuardando(false);
    }
  };

  const claseTab = (activo: boolean) =>
    clsx(
      "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
      activo ? "bg-status-critical text-white" : "text-ink-secondary hover:bg-surface"
    );

  return (
    <div>
      <div className="flex gap-1 rounded-lg border border-line-grid bg-surface-page p-1">
        <button
          type="button"
          onClick={() => setModo("cancelacion")}
          className={claseTab(!noRenovada)}
        >
          Cancelación
        </button>
        <button
          type="button"
          onClick={() => {
            setModo("no_renovada");
            setFechaRenovacion(vencISO);
          }}
          className={claseTab(noRenovada)}
        >
          No renovada
        </button>
      </div>

      <p className="mt-3 rounded-lg bg-status-critical/5 px-3 py-2 text-xs text-ink-secondary">
        {noRenovada ? (
          <>
            La póliza no se renueva: se registra su <b>fecha de renovación</b> sin
            fecha de cancelación. Cuenta como producción cancelada, no como
            cancelación del mes.
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
          <label className={claseLabel}>Fecha de cancelación</label>
          <input
            type="date"
            className={`${claseInput} disabled:cursor-not-allowed disabled:bg-surface-page disabled:text-ink-muted`}
            value={noRenovada ? "" : fechaCancelacion}
            onChange={(e) => setFechaCancelacion(e.target.value)}
            disabled={noRenovada}
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

      {/* Vista previa de lo que se descontará. Se calcula sola con la fecha de
          cancelación: es la prima no causada, o sea la devolución al cliente.
          Sin esa fecha no hay cancelación del mes que descontar, solo
          producción cancelada; se dice explícitamente para que no parezca que
          la cifra se perdió. */}
      {!noRenovada && (
        <div className="mt-3 rounded-lg bg-surface-page px-3 py-2.5 text-xs">
          {(() => {
            const fc = fechaCancelacion ? new Date(fechaCancelacion + "T00:00:00Z") : null;
            const fv = fechaRenovacion ? new Date(fechaRenovacion + "T00:00:00Z") : null;
            if (!fc) {
              return (
                <p className="text-[11px] leading-relaxed text-ink-muted">
                  Sin fecha de cancelación no se descuenta nada de las
                  cancelaciones del mes. La póliza cuenta como{" "}
                  <b>producción cancelada</b> en el mes de su renovación, por la
                  prima completa ({fmtCOP(poliza.primaNeta)}). Es lo normal en
                  las no renovaciones.
                </p>
              );
            }
            const noCausada = primaNoCausada(poliza.primaNeta, fc, fv);
            const dias = fv
              ? Math.round((fv.getTime() - fc.getTime()) / 86400000)
              : null;
            return (
              <>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-ink-secondary">
                    Se descontará de las cancelaciones del mes:
                  </span>
                  <span className="tabla-num font-bold text-status-critical">
                    −{fmtCOP(noCausada)}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-ink-muted">
                  {dias == null
                    ? "Sin la fecha de renovación no se puede prorratear: se descuenta la prima completa."
                    : dias <= 0
                      ? "La vigencia ya había terminado: no hay prima por devolver."
                      : `Prima no causada: ${dias} días que faltaban de vigencia, sobre una prima neta de ${fmtCOP(poliza.primaNeta)}.`}
                </p>
              </>
            );
          })()}
        </div>
      )}

      <label className="mt-4 block">
        <span className={claseLabel}>
          Motivo {noRenovada ? "de la no renovación" : "de la cancelación"}
        </span>
        <textarea
          className={`${claseInput} mt-1`}
          rows={3}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Ej: el cliente vendió el vehículo · se pasó a otra agencia · pérdida total…"
        />
        <span className="mt-1 block text-[11px] text-ink-muted">
          Queda guardado en el histórico de cancelaciones.
        </span>
      </label>

      {error && <p className="mt-3 text-sm text-status-critical">{error}</p>}
      <Acciones
        onCerrar={onCerrar}
        onGuardar={guardar}
        guardando={guardando}
        peligro
        etiqueta={noRenovada ? "Marcar como no renovada" : "Confirmar cancelación"}
      />
    </div>
  );
}
