"use client";

import { useState } from "react";
import type { ListasFormulario } from "@/lib/queries";

export interface PolizaEditable {
  id?: number;
  numero: string;
  ramo: string;
  asegurado: string;
  ccNit: string | null;
  placa: string | null;
  aseguradora: string | null;
  tipoNegocio: string | null;
  asesor1: string | null;
  asesor2: string | null;
  primaNeta: number;
  primaTotal: number;
  formaPago: string | null;
  estadoPago: string | null;
  fechaPago: string | null; // ISO
  fechaMaxPago: string | null;
  vencimiento: string | null;
  fechaNacimiento: string | null;
  correo: string | null;
  celular: string | null;
}

const VACIA: PolizaEditable = {
  numero: "",
  ramo: "",
  asegurado: "",
  ccNit: null,
  placa: null,
  aseguradora: null,
  tipoNegocio: null,
  asesor1: null,
  asesor2: null,
  primaNeta: 0,
  primaTotal: 0,
  formaPago: null,
  estadoPago: null,
  fechaPago: null,
  fechaMaxPago: null,
  vencimiento: null,
  fechaNacimiento: null,
  correo: null,
  celular: null,
};

function soloFecha(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

export function PolizaForm({
  poliza,
  listas,
  onCerrar,
  onGuardado,
}: {
  poliza: PolizaEditable | null; // null = crear nueva
  listas: ListasFormulario;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const esNueva = !poliza?.id;
  const [f, setF] = useState<PolizaEditable>(poliza ?? VACIA);
  const [guardando, setGuardando] = useState(false);
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const campo = (clave: keyof PolizaEditable) => ({
    value: (f[clave] as string | number | null) ?? "",
    onChange: (
      e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
    ) => setF({ ...f, [clave]: e.target.value }),
  });

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch(esNueva ? "/api/policies" : `/api/policies/${poliza!.id}`, {
        method: esNueva ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...f,
          fechaPago: soloFecha(f.fechaPago),
          fechaMaxPago: soloFecha(f.fechaMaxPago),
          vencimiento: soloFecha(f.vencimiento),
          fechaNacimiento: soloFecha(f.fechaNacimiento),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al guardar.");
      onGuardado();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setGuardando(false);
    }
  };

  const eliminar = async () => {
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch(`/api/policies/${poliza!.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Error al eliminar.");
      onGuardado();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setGuardando(false);
    }
  };

  const claseInput =
    "w-full rounded-md border border-line-axis bg-white px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none";
  const claseLabel = "block text-xs font-semibold uppercase tracking-wide text-ink-muted";

  const Select = ({
    clave,
    opciones,
    requerido,
  }: {
    clave: keyof PolizaEditable;
    opciones: string[];
    requerido?: boolean;
  }) => {
    const actual = (f[clave] as string | null) ?? "";
    const lista = actual && !opciones.includes(actual) ? [actual, ...opciones] : opciones;
    return (
      <select className={claseInput} {...campo(clave)}>
        {!requerido && <option value="">—</option>}
        {requerido && !actual && <option value="">Seleccione…</option>}
        {lista.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onCerrar}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-bold">
          {esNueva ? "Nueva póliza" : `Editar póliza ${poliza!.numero}`}
        </h3>
        <p className="mt-0.5 text-xs text-ink-muted">
          Los campos derivados (mes de vencimiento, días al vence, edad) se
          recalculan automáticamente al guardar.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-3">
          <div>
            <label className={claseLabel}>Póliza *</label>
            <input className={claseInput} {...campo("numero")} />
          </div>
          <div>
            <label className={claseLabel}>Ramo *</label>
            <Select clave="ramo" opciones={listas.ramos} requerido />
          </div>
          <div>
            <label className={claseLabel}>Tipo negocio</label>
            <Select clave="tipoNegocio" opciones={listas.tiposNegocio} />
          </div>
          <div className="col-span-2">
            <label className={claseLabel}>Asegurado *</label>
            <input className={claseInput} {...campo("asegurado")} />
          </div>
          <div>
            <label className={claseLabel}>CC / NIT</label>
            <input className={claseInput} {...campo("ccNit")} />
          </div>
          <div>
            <label className={claseLabel}>Aseguradora</label>
            <Select clave="aseguradora" opciones={listas.aseguradoras} />
          </div>
          <div>
            <label className={claseLabel}>Placa</label>
            <input className={claseInput} {...campo("placa")} />
          </div>
          <div>
            <label className={claseLabel}>Vencimiento</label>
            <input
              type="date"
              className={claseInput}
              value={soloFecha(f.vencimiento)}
              onChange={(e) => setF({ ...f, vencimiento: e.target.value })}
            />
          </div>
          <div>
            <label className={claseLabel}>Asesor 1</label>
            <Select clave="asesor1" opciones={listas.asesores} />
          </div>
          <div>
            <label className={claseLabel}>Asesor 2</label>
            <Select clave="asesor2" opciones={listas.asesores} />
          </div>
          <div>
            <label className={claseLabel}>Prima neta</label>
            <input type="number" className={claseInput} {...campo("primaNeta")} />
          </div>
          <div>
            <label className={claseLabel}>Prima total</label>
            <input type="number" className={claseInput} {...campo("primaTotal")} />
          </div>
          <div>
            <label className={claseLabel}>Forma de pago</label>
            <Select clave="formaPago" opciones={listas.formasPago} />
          </div>
          <div>
            <label className={claseLabel}>Estado de pago</label>
            <Select clave="estadoPago" opciones={listas.estadosPago} />
          </div>
          <div>
            <label className={claseLabel}>Fecha pago</label>
            <input
              type="date"
              className={claseInput}
              value={soloFecha(f.fechaPago)}
              onChange={(e) => setF({ ...f, fechaPago: e.target.value })}
            />
          </div>
          <div>
            <label className={claseLabel}>Fecha máx. pago</label>
            <input
              type="date"
              className={claseInput}
              value={soloFecha(f.fechaMaxPago)}
              onChange={(e) => setF({ ...f, fechaMaxPago: e.target.value })}
            />
          </div>
          <div>
            <label className={claseLabel}>Fecha nacimiento</label>
            <input
              type="date"
              className={claseInput}
              value={soloFecha(f.fechaNacimiento)}
              onChange={(e) => setF({ ...f, fechaNacimiento: e.target.value })}
            />
          </div>
          <div>
            <label className={claseLabel}>Celular</label>
            <input className={claseInput} {...campo("celular")} />
          </div>
          <div className="col-span-2">
            <label className={claseLabel}>Correo</label>
            <input type="email" className={claseInput} {...campo("correo")} />
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-status-critical">{error}</p>}

        <div className="mt-5 flex items-center gap-2">
          {!esNueva &&
            (confirmandoBorrado ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-status-critical">¿Eliminar definitivamente?</span>
                <button
                  onClick={eliminar}
                  disabled={guardando}
                  className="rounded-md bg-status-critical px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                >
                  Sí, eliminar
                </button>
                <button
                  onClick={() => setConfirmandoBorrado(false)}
                  className="rounded-md px-2 py-1.5 text-sm text-ink-secondary hover:bg-surface-page"
                >
                  No
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmandoBorrado(true)}
                disabled={guardando}
                className="rounded-md border border-status-critical/40 px-3 py-1.5 text-sm font-medium text-status-critical hover:bg-status-critical/5"
              >
                Eliminar póliza
              </button>
            ))}
          <div className="ml-auto flex gap-2">
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
              className="rounded-md bg-brand px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
            >
              {guardando ? "Guardando…" : esNueva ? "Crear póliza" : "Guardar cambios"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
