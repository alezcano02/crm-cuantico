"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { fmtCOP, fmtFecha } from "@/lib/format";
import { Card, CardTitle, EstadoVacio, StatCard, Td, Th } from "@/components/ui";
import { IconMas } from "@/components/icons";
import { BotonExportar } from "@/components/boton-exportar";
import { BuscadorTabla } from "@/components/buscador-tabla";
import { FiltroMes } from "@/components/filtro-mes";
import { exigirOk } from "@/lib/respuesta";
import { api } from "@/lib/rutas";
import {
  ESTADOS_AMPARADO,
  ETIQUETA_NOVEDAD,
  PARENTESCOS,
  estaActivo,
  estaEnTramite,
  nombreParentesco,
} from "@/lib/colectivas";

export interface EmpresaVista {
  id: number;
  nombre: string;
  nit: string | null;
  carpeta: string | null;
  nota: string | null;
}
export interface AmparadoVista {
  id: number;
  empresaId: number;
  polizaNumero: string;
  ramo: string;
  plan: string | null;
  docEmpleado: string;
  nombreEmpleado: string;
  docAmparado: string;
  nombreAmparado: string;
  parentesco: string;
  valorAsegurado: number | null;
  primaMensual: number | null;
  estado: string;
  radicado: string | null;
  observacion: string | null;
  fechaIngreso: string | null;
  fechaRetiro: string | null;
}
export interface NovedadVista {
  id: number;
  empresaId: number;
  amparadoId: number | null;
  tipo: string;
  fecha: string;
  estado: string;
  radicado: string | null;
  nombreAmparado: string;
  docAmparado: string;
  nota: string | null;
}
export interface PolizaColectivaVista {
  numero: string;
  ramo: string;
  asegurado: string;
  aseguradora: string | null;
  primaNeta: number;
  vencimiento: string | null;
  /** Recibos de inclusión absorbidos por esta colectiva. */
  recibos?: number;
}

const COLOR_ESTADO: Record<string, string> = {
  EXPEDIDO: "bg-status-good/10 text-status-good",
  "EN EXPEDICION": "bg-status-warning/15 text-[#8a6100]",
  "EN EVALUACION": "bg-status-warning/15 text-[#8a6100]",
  "EN COMPLEMENTOS": "bg-status-warning/15 text-[#8a6100]",
  RETIRADO: "bg-surface-sunken text-ink-muted",
  RECHAZADO: "bg-status-critical/10 text-status-critical",
};

export function ColectivasPanel({
  empresas,
  amparados,
  novedades,
  polizas,
}: {
  empresas: EmpresaVista[];
  amparados: AmparadoVista[];
  novedades: NovedadVista[];
  polizas: PolizaColectivaVista[];
}) {
  const router = useRouter();
  const [empresaId, setEmpresaId] = useState<number | null>(empresas[0]?.id ?? null);
  const [q, setQ] = useState("");
  const [mes, setMes] = useState("");
  const [verRetirados, setVerRetirados] = useState(false);
  const [creandoEmpresa, setCreandoEmpresa] = useState(false);
  const [incluyendo, setIncluyendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const empresa = empresas.find((e) => e.id === empresaId) ?? null;
  const delEmpresa = useMemo(
    () => amparados.filter((a) => a.empresaId === empresaId),
    [amparados, empresaId]
  );
  const novedadesEmpresa = useMemo(
    () => novedades.filter((n) => n.empresaId === empresaId),
    [novedades, empresaId]
  );

  const meses = useMemo(
    () => Array.from(new Set(novedadesEmpresa.map((n) => n.fecha.slice(0, 7)))).sort().reverse(),
    [novedadesEmpresa]
  );

  const visibles = useMemo(() => {
    let lista = delEmpresa;
    // Los retirados se esconden por defecto: la lista de trabajo es quién está
    // cubierto hoy. Pero no se borran, porque hay que poder demostrar meses
    // después quién estuvo y hasta cuándo.
    if (!verRetirados) lista = lista.filter((a) => estaActivo(a.estado, a.fechaRetiro ? new Date(a.fechaRetiro) : null));
    if (q.trim()) {
      const t = q.trim().toLowerCase();
      lista = lista.filter(
        (a) =>
          a.nombreAmparado.toLowerCase().includes(t) ||
          a.docAmparado.toLowerCase().includes(t) ||
          a.nombreEmpleado.toLowerCase().includes(t) ||
          a.polizaNumero.toLowerCase().includes(t)
      );
    }
    return lista;
  }, [delEmpresa, q, verRetirados]);

  const novedadesFiltradas = useMemo(() => {
    let lista = novedadesEmpresa;
    if (mes) lista = lista.filter((n) => n.fecha.slice(0, 7) === mes);
    return lista;
  }, [novedadesEmpresa, mes]);

  const resumen = useMemo(() => {
    const activos = delEmpresa.filter((a) =>
      estaActivo(a.estado, a.fechaRetiro ? new Date(a.fechaRetiro) : null)
    );
    return {
      activos: activos.length,
      enTramite: activos.filter((a) => estaEnTramite(a.estado)).length,
      primaMensual: activos.reduce((s, a) => s + (a.primaMensual ?? 0), 0),
      pendientes: novedadesEmpresa.filter((n) => n.estado === "SOLICITADA").length,
    };
  }, [delEmpresa, novedadesEmpresa]);

  const enviar = async (url: string, metodo: string, cuerpo: unknown) => {
    setError(null);
    try {
      const res = await fetch(api(url), {
        method: metodo,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      });
      await exigirOk(res, "No se pudo guardar.");
      router.refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    }
  };

  const retirar = async (a: AmparadoVista) => {
    const fecha = window.prompt(
      `Retirar a ${a.nombreAmparado}.\n\nFecha efectiva del retiro (AAAA-MM-DD):`,
      new Date().toISOString().slice(0, 10)
    );
    if (!fecha) return;
    await enviar(`/api/colectivas/amparados/${a.id}`, "PATCH", { retirar: true, fechaRetiro: fecha });
  };

  const cambiarNovedad = async (n: NovedadVista, estado: string) => {
    await enviar(`/api/colectivas/novedades/${n.id}`, "PATCH", { estado });
  };

  if (empresas.length === 0) {
    return (
      <>
        {creandoEmpresa && (
          <FormEmpresa onCerrar={() => setCreandoEmpresa(false)} onGuardar={enviar} />
        )}
        <Card>
          <EstadoVacio
            titulo="Todavía no hay empresas"
            descripcion="Cree la primera empresa para empezar a gestionar sus colectivas. Cada empresa agrupa sus pólizas y las personas cubiertas."
            accion={
              <button
                onClick={() => setCreandoEmpresa(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
              >
                <IconMas className="h-4 w-4" />
                Nueva empresa
              </button>
            }
          />
        </Card>
      </>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-lg border border-status-critical/30 bg-status-critical/5 px-3 py-2 text-sm text-status-critical">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={empresaId ?? ""}
          onChange={(e) => setEmpresaId(Number(e.target.value))}
          aria-label="Empresa"
          className="rounded-lg border border-line-axis bg-surface px-3 py-2 text-sm font-medium focus:border-brand focus:outline-none"
        >
          {empresas.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nombre}
            </option>
          ))}
        </select>
        <button
          onClick={() => setCreandoEmpresa(true)}
          className="rounded-lg border border-line-axis px-3 py-2 text-sm text-ink-secondary hover:bg-surface-page"
        >
          Nueva empresa
        </button>
        <button
          onClick={() => setIncluyendo(true)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
        >
          <IconMas className="h-4 w-4" />
          Incluir persona
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard etiqueta="Personas cubiertas" valor={String(resumen.activos)} acento="verde" />
        <StatCard
          etiqueta="En trámite"
          valor={String(resumen.enTramite)}
          detalle="Sin expedir todavía"
          acento={resumen.enTramite > 0 ? "amarillo" : undefined}
        />
        <StatCard
          etiqueta="Novedades sin confirmar"
          valor={String(resumen.pendientes)}
          detalle="Esperando a la aseguradora"
          acento={resumen.pendientes > 0 ? "amarillo" : undefined}
        />
        <StatCard etiqueta="Prima mensual" valor={fmtCOP(resumen.primaMensual)} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <BuscadorTabla valor={q} onCambiar={setQ} marcador="Buscar persona / documento / póliza" />
        <label className="flex items-center gap-1.5 text-sm text-ink-secondary">
          <input
            type="checkbox"
            checked={verRetirados}
            onChange={(e) => setVerRetirados(e.target.checked)}
          />
          Ver también los retirados
        </label>
        <span className="ml-auto text-sm text-ink-muted">{visibles.length} personas</span>
        <BotonExportar
          nombre={`colectiva-${empresa?.nombre ?? ""}`}
          filas={visibles}
          columnas={[
            { encabezado: "Póliza", valor: (a) => a.polizaNumero },
            { encabezado: "Ramo", valor: (a) => a.ramo },
            { encabezado: "Plan", valor: (a) => a.plan ?? "" },
            { encabezado: "Doc. empleado", valor: (a) => a.docEmpleado },
            { encabezado: "Empleado", valor: (a) => a.nombreEmpleado },
            { encabezado: "Doc. amparado", valor: (a) => a.docAmparado },
            { encabezado: "Amparado", valor: (a) => a.nombreAmparado },
            { encabezado: "Parentesco", valor: (a) => nombreParentesco(a.parentesco) },
            { encabezado: "Valor asegurado", valor: (a) => a.valorAsegurado ?? "" },
            { encabezado: "Prima mensual", valor: (a) => a.primaMensual ?? "" },
            { encabezado: "Estado", valor: (a) => a.estado },
            { encabezado: "Radicado", valor: (a) => a.radicado ?? "" },
            { encabezado: "Ingreso", valor: (a) => (a.fechaIngreso ? new Date(a.fechaIngreso) : null) },
            { encabezado: "Retiro", valor: (a) => (a.fechaRetiro ? new Date(a.fechaRetiro) : null) },
          ]}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <div className="overflow-x-auto scroll-fino rounded-xl border border-line-grid bg-surface">
          <table className="w-full border-collapse whitespace-nowrap">
            <thead>
              <tr>
                <Th>Amparado</Th>
                <Th>Parentesco</Th>
                <Th>Empleado</Th>
                <Th>Póliza</Th>
                <Th derecha>Valor asegurado</Th>
                <Th derecha>Prima mes</Th>
                <Th>Estado</Th>
                <Th>Ingreso</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {visibles.map((a) => {
                const activo = estaActivo(a.estado, a.fechaRetiro ? new Date(a.fechaRetiro) : null);
                return (
                  <tr key={a.id} className={clsx("hover:bg-surface-page", !activo && "opacity-55")}>
                    <Td className="font-medium">
                      {a.nombreAmparado}
                      <div className="text-[11px] font-normal text-ink-muted">{a.docAmparado}</div>
                    </Td>
                    <Td>{nombreParentesco(a.parentesco)}</Td>
                    <Td>
                      <div className="max-w-[180px] truncate text-xs" title={a.nombreEmpleado}>
                        {a.nombreEmpleado}
                      </div>
                    </Td>
                    <Td>
                      <div className="text-xs">{a.polizaNumero}</div>
                      <div className="text-[11px] text-ink-muted">{a.plan ?? a.ramo}</div>
                    </Td>
                    <Td derecha>{a.valorAsegurado == null ? "—" : fmtCOP(a.valorAsegurado)}</Td>
                    <Td derecha>{a.primaMensual == null ? "—" : fmtCOP(a.primaMensual)}</Td>
                    <Td>
                      <span
                        className={clsx(
                          "rounded px-1.5 py-0.5 text-[11px] font-semibold",
                          COLOR_ESTADO[a.estado] ?? "bg-surface-sunken text-ink-secondary"
                        )}
                      >
                        {a.estado}
                      </span>
                      {a.radicado && (
                        <div className="text-[11px] text-ink-muted">rad. {a.radicado}</div>
                      )}
                    </Td>
                    <Td>
                      <div className="text-xs">{fmtFecha(a.fechaIngreso)}</div>
                      {a.fechaRetiro && (
                        <div className="text-[11px] text-status-critical">
                          salió {fmtFecha(a.fechaRetiro)}
                        </div>
                      )}
                    </Td>
                    <Td>
                      {activo && (
                        <button
                          onClick={() => retirar(a)}
                          className="rounded-lg border border-status-critical/40 px-2.5 py-1 text-xs font-semibold text-status-critical hover:bg-status-critical/5"
                        >
                          Retirar
                        </button>
                      )}
                    </Td>
                  </tr>
                );
              })}
              {visibles.length === 0 && (
                <tr>
                  <Td className="py-6 text-center text-ink-muted" colSpan={9}>
                    {delEmpresa.length === 0
                      ? "Esta empresa todavía no tiene personas cargadas."
                      : "Ninguna persona cumple el filtro."}
                  </Td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="space-y-4">
          <Card>
            <CardTitle
              accion={
                <FiltroMes valor={mes} onCambiar={setMes} meses={meses} etiqueta="Todos los meses" />
              }
            >
              Movimientos
            </CardTitle>
            <div className="max-h-[520px] space-y-2 overflow-y-auto scroll-fino">
              {novedadesFiltradas.map((n) => (
                <div
                  key={n.id}
                  className="rounded-lg border border-line-grid p-2.5 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={clsx(
                        "rounded px-1.5 py-0.5 text-[11px] font-semibold",
                        n.tipo === "RETIRO"
                          ? "bg-status-critical/10 text-status-critical"
                          : "bg-status-good/10 text-status-good"
                      )}
                    >
                      {ETIQUETA_NOVEDAD[n.tipo] ?? n.tipo}
                    </span>
                    <span className="text-ink-muted">{fmtFecha(n.fecha)}</span>
                  </div>
                  <div className="mt-1 font-medium">{n.nombreAmparado}</div>
                  <div className="text-[11px] text-ink-muted">{n.docAmparado}</div>
                  {n.estado === "SOLICITADA" ? (
                    <div className="mt-1.5 flex gap-1.5">
                      <button
                        onClick={() => cambiarNovedad(n, "CONFIRMADA")}
                        className="rounded border border-status-good/40 px-2 py-0.5 text-[11px] font-semibold text-status-good hover:bg-status-good/5"
                      >
                        Confirmar
                      </button>
                      <button
                        onClick={() => cambiarNovedad(n, "RECHAZADA")}
                        className="rounded border border-line-axis px-2 py-0.5 text-[11px] text-ink-secondary hover:bg-surface-page"
                      >
                        Rechazar
                      </button>
                    </div>
                  ) : (
                    <div className="mt-1 text-[11px] font-semibold text-ink-muted">{n.estado}</div>
                  )}
                </div>
              ))}
              {novedadesFiltradas.length === 0 && (
                <p className="py-4 text-center text-xs text-ink-muted">
                  Sin movimientos {mes ? "en el mes elegido" : "registrados"}.
                </p>
              )}
            </div>
          </Card>

          <Card>
            <CardTitle>Pólizas del informe</CardTitle>
            <p className="mb-2 text-[11px] leading-relaxed text-ink-muted">
              Colectivas del informe de producción, ya con sus inclusiones
              sumadas. Sirven de referencia para saber qué número usar al
              incluir a alguien.
            </p>
            <div className="max-h-64 space-y-1.5 overflow-y-auto scroll-fino text-xs">
              {polizas.map((p, i) => (
                <div key={`${p.numero}-${i}`} className="border-b border-line-grid pb-1.5 last:border-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium">{p.numero}</span>
                    {!!p.recibos && (
                      <span
                        className="shrink-0 rounded bg-surface-page px-1.5 py-0.5 text-[10px] text-ink-muted"
                        title="Recibos de inclusión que cuelgan de esta colectiva y ya no se listan aparte"
                      >
                        +{p.recibos} {p.recibos === 1 ? "inclusión" : "inclusiones"}
                      </span>
                    )}
                  </div>
                  <div className="truncate text-[11px] text-ink-muted" title={p.asegurado}>
                    {p.ramo} · {p.asegurado}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {creandoEmpresa && (
        <FormEmpresa onCerrar={() => setCreandoEmpresa(false)} onGuardar={enviar} />
      )}
      {incluyendo && empresa && (
        <FormInclusion
          empresa={empresa}
          polizas={polizas}
          onCerrar={() => setIncluyendo(false)}
          onGuardar={enviar}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

const claseCampo =
  "w-full rounded-lg border border-line-axis bg-surface px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none";

function Modal({
  titulo,
  onCerrar,
  children,
}: {
  titulo: string;
  onCerrar: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-brand-dark/40 p-4"
      onClick={onCerrar}
    >
      <div
        className="mt-10 w-full max-w-lg rounded-xl bg-surface p-4 shadow-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="titular mb-3 text-[22px] text-brand">{titulo}</h2>
        {children}
      </div>
    </div>
  );
}

function FormEmpresa({
  onCerrar,
  onGuardar,
}: {
  onCerrar: () => void;
  onGuardar: (url: string, metodo: string, cuerpo: unknown) => Promise<boolean>;
}) {
  const [nombre, setNombre] = useState("");
  const [nit, setNit] = useState("");
  const [carpeta, setCarpeta] = useState("");
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    setGuardando(true);
    const ok = await onGuardar("/api/colectivas/empresas", "POST", { nombre, nit, carpeta });
    setGuardando(false);
    if (ok) onCerrar();
  };

  return (
    <Modal titulo="Nueva empresa" onCerrar={onCerrar}>
      <div className="space-y-3">
        <label className="block text-sm">
          <span className="text-ink-secondary">Nombre</span>
          <input className={claseCampo} value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="text-ink-secondary">NIT</span>
          <input className={claseCampo} value={nit} onChange={(e) => setNit(e.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="text-ink-secondary">Carpeta en SharePoint (opcional)</span>
          <input
            className={claseCampo}
            value={carpeta}
            onChange={(e) => setCarpeta(e.target.value)}
            placeholder="4. Asesores/Oficina/…"
          />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onCerrar} className="rounded-lg border border-line-axis px-3 py-1.5 text-sm">
            Cancelar
          </button>
          <button
            onClick={guardar}
            disabled={guardando || !nombre.trim()}
            className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {guardando ? "Guardando…" : "Crear"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function FormInclusion({
  empresa,
  polizas,
  onCerrar,
  onGuardar,
}: {
  empresa: EmpresaVista;
  polizas: PolizaColectivaVista[];
  onCerrar: () => void;
  onGuardar: (url: string, metodo: string, cuerpo: unknown) => Promise<boolean>;
}) {
  const [f, setF] = useState({
    polizaNumero: "",
    ramo: "VIDA GRUPO",
    plan: "",
    docEmpleado: "",
    nombreEmpleado: "",
    docAmparado: "",
    nombreAmparado: "",
    parentesco: "AF",
    valorAsegurado: "",
    primaMensual: "",
    radicado: "",
    fechaIngreso: new Date().toISOString().slice(0, 10),
    observacion: "",
  });
  const [guardando, setGuardando] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  // Si el amparado es el propio empleado, no tiene sentido pedir los datos dos
  // veces: se copian solos.
  const esAfiliado = f.parentesco === "AF";

  const guardar = async () => {
    setGuardando(true);
    const ok = await onGuardar("/api/colectivas/amparados", "POST", {
      ...f,
      empresaId: empresa.id,
      docEmpleado: esAfiliado ? f.docAmparado : f.docEmpleado,
      nombreEmpleado: esAfiliado ? f.nombreAmparado : f.nombreEmpleado,
    });
    setGuardando(false);
    if (ok) onCerrar();
  };

  const listo = f.polizaNumero.trim() && f.docAmparado.trim() && f.nombreAmparado.trim();

  return (
    <Modal titulo={`Incluir persona · ${empresa.nombre}`} onCerrar={onCerrar}>
      <div className="grid grid-cols-2 gap-3">
        <label className="col-span-2 block text-sm">
          <span className="text-ink-secondary">Póliza</span>
          <input
            className={claseCampo}
            list="polizas-colectivas"
            value={f.polizaNumero}
            onChange={(e) => set("polizaNumero", e.target.value)}
            placeholder="Número de la póliza colectiva"
          />
          <datalist id="polizas-colectivas">
            {polizas.map((p, i) => (
              <option key={`${p.numero}-${i}`} value={p.numero}>
                {p.ramo} · {p.asegurado}
              </option>
            ))}
          </datalist>
        </label>
        <label className="block text-sm">
          <span className="text-ink-secondary">Ramo</span>
          <select className={claseCampo} value={f.ramo} onChange={(e) => set("ramo", e.target.value)}>
            <option>VIDA GRUPO</option>
            <option>COLECTIVA</option>
            <option>SALUD</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-ink-secondary">Plan</span>
          <input className={claseCampo} value={f.plan} onChange={(e) => set("plan", e.target.value)} />
        </label>

        <label className="block text-sm">
          <span className="text-ink-secondary">Parentesco</span>
          <select
            className={claseCampo}
            value={f.parentesco}
            onChange={(e) => set("parentesco", e.target.value)}
          >
            {Object.entries(PARENTESCOS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-ink-secondary">Fecha de ingreso</span>
          <input
            type="date"
            className={claseCampo}
            value={f.fechaIngreso}
            onChange={(e) => set("fechaIngreso", e.target.value)}
          />
        </label>

        <label className="block text-sm">
          <span className="text-ink-secondary">Documento</span>
          <input
            className={claseCampo}
            value={f.docAmparado}
            onChange={(e) => set("docAmparado", e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="text-ink-secondary">Nombre</span>
          <input
            className={claseCampo}
            value={f.nombreAmparado}
            onChange={(e) => set("nombreAmparado", e.target.value)}
          />
        </label>

        {!esAfiliado && (
          <>
            <label className="block text-sm">
              <span className="text-ink-secondary">Doc. del empleado</span>
              <input
                className={claseCampo}
                value={f.docEmpleado}
                onChange={(e) => set("docEmpleado", e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="text-ink-secondary">Nombre del empleado</span>
              <input
                className={claseCampo}
                value={f.nombreEmpleado}
                onChange={(e) => set("nombreEmpleado", e.target.value)}
              />
            </label>
          </>
        )}

        <label className="block text-sm">
          <span className="text-ink-secondary">Valor asegurado</span>
          <input
            className={claseCampo}
            value={f.valorAsegurado}
            onChange={(e) => set("valorAsegurado", e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="text-ink-secondary">Prima mensual</span>
          <input
            className={claseCampo}
            value={f.primaMensual}
            onChange={(e) => set("primaMensual", e.target.value)}
          />
        </label>
        <label className="col-span-2 block text-sm">
          <span className="text-ink-secondary">Radicado (si ya lo dio la aseguradora)</span>
          <input
            className={claseCampo}
            value={f.radicado}
            onChange={(e) => set("radicado", e.target.value)}
          />
        </label>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onCerrar} className="rounded-lg border border-line-axis px-3 py-1.5 text-sm">
          Cancelar
        </button>
        <button
          onClick={guardar}
          disabled={guardando || !listo}
          className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {guardando ? "Guardando…" : "Incluir"}
        </button>
      </div>
    </Modal>
  );
}
