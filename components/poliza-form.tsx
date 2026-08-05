"use client";

import { useState } from "react";
import type { ListasFormulario } from "@/lib/queries";
import { exigirOk } from "@/lib/respuesta";
import { api } from "@/lib/rutas";
import { LeerPolizaPdf } from "@/components/leer-poliza-pdf";

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
  valorCuota?: number | null;
  notaCartera?: string | null;
  /* Columnas del informe que las tablas muestran pero el formulario no edita:
     el área técnica las escribe en el Excel. */
  observacion?: string | null;
  mesVencimiento?: string | null;
  vtoSoat?: string | null;
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
  valorCuota: null,
  notaCartera: null,
};

function soloFecha(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

const claseInput =
  "w-full rounded-md border border-line-axis bg-white px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none";
const claseLabel = "block text-xs font-semibold uppercase tracking-wide text-ink-muted";

/**
 * Rejilla de campos de una póliza. Se usa tanto para crear una póliza nueva
 * como dentro del modal "Gestionar póliza" (pestaña Editar datos).
 */
export function CamposPoliza({
  f,
  setF,
  listas,
}: {
  f: PolizaEditable;
  setF: (p: PolizaEditable) => void;
  listas: ListasFormulario;
}) {
  const campo = (clave: keyof PolizaEditable) => ({
    value: (f[clave] as string | number | null) ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setF({ ...f, [clave]: e.target.value }),
  });

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
    // Si el valor guardado no está en LISTAS (el archivo real trae valores
    // fuera de lista) se antepone para no perderlo al editar.
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

  const fecha = (clave: keyof PolizaEditable) => (
    <input
      type="date"
      className={claseInput}
      value={soloFecha(f[clave] as string | null)}
      onChange={(e) => setF({ ...f, [clave]: e.target.value })}
    />
  );

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-3">
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
        {fecha("vencimiento")}
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
        <label className={claseLabel}>Valor cuota</label>
        <input type="number" className={claseInput} {...campo("valorCuota")} />
      </div>
      <div>
        <label className={claseLabel}>Fecha pago</label>
        {fecha("fechaPago")}
      </div>
      <div>
        <label className={claseLabel}>Fecha máx. pago</label>
        {fecha("fechaMaxPago")}
      </div>
      <div>
        <label className={claseLabel}>Fecha nacimiento</label>
        {fecha("fechaNacimiento")}
      </div>
      <div>
        <label className={claseLabel}>Celular</label>
        <input className={claseInput} {...campo("celular")} />
      </div>
      <div className="col-span-2">
        <label className={claseLabel}>Correo</label>
        <input type="email" className={claseInput} {...campo("correo")} />
      </div>
      <div className="col-span-2 md:col-span-3">
        <label className={claseLabel}>Observación de cartera</label>
        <input
          className={claseInput}
          {...campo("notaCartera")}
          placeholder="Aparece en el informe de cartera"
        />
      </div>
    </div>
  );
}

/** Formulario para crear una póliza nueva. */
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
  const [error, setError] = useState<string | null>(null);

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch(api(esNueva ? "/api/policies" : `/api/policies/${poliza!.id}`), {
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
      const json = await exigirOk(res, "Error al guardar.");
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
        <h3 className="text-base font-bold">
          {esNueva ? "Nueva póliza" : `Editar póliza ${poliza!.numero}`}
        </h3>
        <p className="mt-0.5 text-xs text-ink-muted">
          Los campos derivados (mes de vencimiento, días al vence, edad) se
          recalculan automáticamente al guardar.
        </p>

        {/* Al crear o renovar, el PDF de la compañía puede rellenar casi todo.
            Solo propone: lo que traiga queda en el formulario para revisarlo. */}
        <div className="mt-4">
          <LeerPolizaPdf onAplicar={(datos) => setF((v) => ({ ...v, ...datos }))} />
        </div>

        <div className="mt-4">
          <CamposPoliza f={f} setF={setF} listas={listas} />
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
            onClick={guardar}
            disabled={guardando}
            className="rounded-lg bg-brand px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {guardando ? "Guardando…" : esNueva ? "Crear póliza" : "Guardar cambios"}
          </button>
        </div>
      </div>
    </div>
  );
}
