"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { fmtFecha } from "@/lib/format";
import { StatCard, Td, Th } from "@/components/ui";
import { IconMas } from "@/components/icons";
import { BotonExportar } from "@/components/boton-exportar";
import { Paginacion, usePaginacion } from "@/components/paginacion";
import { PanelFiltros } from "@/components/panel-filtros";
import { BuscadorTabla } from "@/components/buscador-tabla";
import { FiltroSeleccion, FichasFiltros } from "@/components/filtro-seleccion";
import { ETIQUETA_SITUACION, SITUACIONES, type ProspectoVista } from "@/lib/prospectos";
import { exigirOk } from "@/lib/respuesta";
import { api } from "@/lib/rutas";

type Pestania = "pendientes" | "perdidas" | "todas";

const PESTANIAS: { id: Pestania; etiqueta: string }[] = [
  { id: "pendientes", etiqueta: "Pendientes" },
  { id: "perdidas", etiqueta: "Perdidos" },
  { id: "todas", etiqueta: "Todas" },
];

const COLOR: Record<string, string> = {
  PENDIENTE: "bg-status-warning/15 text-[#8a6100]",
  PERDIDA: "bg-status-critical/10 text-status-critical",
  GANADA: "bg-status-good/10 text-status-good",
};

function normalizar(v: string): string {
  return v.trim().replace(/\s+/g, " ");
}
function opciones(valores: (string | null)[]): string[] {
  return Array.from(
    new Set(valores.filter((v): v is string => !!v).map(normalizar).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, "es"));
}

export function ProspectosTabla({ prospectos }: { prospectos: ProspectoVista[] }) {
  const router = useRouter();
  const [pestania, setPestania] = useState<Pestania>("pendientes");
  const [q, setQ] = useState("");
  const [selCompania, setSelCompania] = useState<string[]>([]);
  const [selAdmin, setSelAdmin] = useState<string[]>([]);
  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState<ProspectoVista | null>(null);
  const [gestionando, setGestionando] = useState<ProspectoVista | null>(null);
  const [error, setError] = useState<string | null>(null);

  const companias = useMemo(() => opciones(prospectos.map((p) => p.compania)), [prospectos]);
  const admins = useMemo(() => opciones(prospectos.map((p) => p.administrador)), [prospectos]);

  const filtrados = useMemo(() => {
    let lista = prospectos;
    if (pestania === "pendientes") lista = lista.filter((p) => p.situacion === "PENDIENTE");
    else if (pestania === "perdidas") lista = lista.filter((p) => p.situacion === "PERDIDA");
    if (selCompania.length)
      lista = lista.filter((p) => p.compania && selCompania.includes(normalizar(p.compania)));
    if (selAdmin.length)
      lista = lista.filter((p) => p.administrador && selAdmin.includes(normalizar(p.administrador)));
    if (q.trim()) {
      const t = q.trim().toLowerCase();
      lista = lista.filter(
        (p) =>
          p.nombre.toLowerCase().includes(t) ||
          (p.administrador ?? "").toLowerCase().includes(t) ||
          (p.estado ?? "").toLowerCase().includes(t)
      );
    }
    /*
     * Ordenado por lo que falta para que arranque la vigencia, no por fecha de
     * creación: el prospecto que vence antes es el que hay que llamar hoy.
     * Los que ya pasaron van primero porque son los que se están perdiendo.
     */
    return [...lista].sort((a, b) => (a.dias ?? 99999) - (b.dias ?? 99999));
  }, [prospectos, pestania, q, selCompania, selAdmin]);

  const totales = useMemo(() => {
    const p = prospectos.filter((x) => x.situacion === "PENDIENTE");
    return {
      pendientes: p.length,
      // Lo que se está escapando: pendientes cuya vigencia arranca dentro de
      // 30 días o ya arrancó.
      urgentes: p.filter((x) => x.dias != null && x.dias <= 30).length,
      perdidas: prospectos.filter((x) => x.situacion === "PERDIDA").length,
      ganadas: prospectos.filter((x) => x.situacion === "GANADA").length,
    };
  }, [prospectos]);

  const limpiar = () => {
    setSelCompania([]);
    setSelAdmin([]);
    setQ("");
  };
  const grupos = [
    { etiqueta: "Compañía", valores: selCompania, onCambiar: setSelCompania },
    { etiqueta: "Administrador", valores: selAdmin, onCambiar: setSelAdmin },
  ];
  const nFiltros = grupos.reduce((n, g) => n + g.valores.length, 0);

  const { visibles, pagina, setPagina, totalPaginas } = usePaginacion(filtrados);

  const guardar = async (url: string, metodo: string, cuerpo: unknown) => {
    try {
      const r = await fetch(api(url), {
        method: metodo,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      });
      await exigirOk(r, "No se pudo guardar el prospecto.");
      setError(null);
      setCreando(false);
      setEditando(null);
      router.refresh();
      return true;
    } catch (e) {
      // El mensaje del servidor se enseña tal cual: dice qué falta, y es más
      // útil que un «error al guardar» genérico.
      setError(e instanceof Error ? e.message : "No se pudo guardar el prospecto.");
      return false;
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          etiqueta="Pendientes"
          valor={String(totales.pendientes)}
          detalle="Cotizaciones abiertas"
          acento={totales.pendientes > 0 ? "amarillo" : undefined}
        />
        <StatCard
          etiqueta="Se vencen pronto"
          valor={String(totales.urgentes)}
          detalle="Vigencia arranca en 30 días o menos"
          acento={totales.urgentes > 0 ? "rojo" : "verde"}
        />
        <StatCard etiqueta="No conseguidas" valor={String(totales.perdidas)} detalle="Cerradas sin éxito" />
        <StatCard
          etiqueta="Ganadas"
          valor={String(totales.ganadas)}
          detalle="Se convirtieron en póliza"
          acento={totales.ganadas > 0 ? "verde" : undefined}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-lg border border-line-grid bg-surface p-1">
          {PESTANIAS.map((t) => (
            <button
              key={t.id}
              onClick={() => setPestania(t.id)}
              className={clsx(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                pestania === t.id ? "bg-brand text-white" : "text-ink-secondary hover:bg-surface-page"
              )}
            >
              {t.etiqueta}
            </button>
          ))}
        </div>
        <BuscadorTabla valor={q} onCambiar={setQ} marcador="Buscar cliente / administrador / estado" />
        <button
          onClick={() => setCreando(true)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
        >
          <IconMas className="h-4 w-4" />
          Nuevo prospecto
        </button>
      </div>

      {error && (
        <p className="rounded-lg border border-status-critical/40 bg-status-critical/5 px-3 py-2 text-sm text-status-critical">
          {error}
        </p>
      )}

      <FichasFiltros grupos={grupos} onLimpiarTodo={limpiar} />

      <PanelFiltros activos={nFiltros}>
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line-grid bg-white p-3">
          <FiltroSeleccion
            etiqueta="Compañía"
            opciones={companias}
            valores={selCompania}
            onCambiar={setSelCompania}
            plural="todas"
          />
          <FiltroSeleccion
            etiqueta="Administrador"
            opciones={admins}
            valores={selAdmin}
            onCambiar={setSelAdmin}
          />
          <BotonExportar
            nombre="prospectos"
            filas={filtrados}
            columnas={[
              { encabezado: "Cliente", valor: (p) => p.nombre },
              { encabezado: "Inicio de vigencia", valor: (p) => (p.fechaInicio ? new Date(p.fechaInicio) : "") },
              { encabezado: "Administrador", valor: (p) => p.administrador ?? "" },
              { encabezado: "Compañía", valor: (p) => p.compania ?? "" },
              { encabezado: "Situación", valor: (p) => ETIQUETA_SITUACION[p.situacion as "PENDIENTE"] ?? p.situacion },
              { encabezado: "Estado", valor: (p) => p.estado ?? "" },
              { encabezado: "Asesor", valor: (p) => p.asesor ?? "" },
              { encabezado: "Nota", valor: (p) => p.nota ?? "" },
            ]}
          />
        </div>
      </PanelFiltros>

      <div className="overflow-x-auto scroll-fino rounded-xl border border-line-grid bg-surface">
        <table className="w-full border-collapse whitespace-nowrap">
          <thead>
            <tr>
              <Th>Cliente</Th>
              <Th>Inicio vigencia</Th>
              <Th derecha>Faltan</Th>
              <Th>Administrador</Th>
              <Th>Compañía</Th>
              <Th>Situación</Th>
              <Th>Estado</Th>
              <Th>Último toque</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {visibles.map((p) => (
              <tr key={p.id} className="hover:bg-surface-page">
                <Td className="font-medium">
                  <div className="max-w-[240px] truncate" title={p.nombre}>
                    {p.nombre}
                  </div>
                </Td>
                <Td>{p.fechaInicio ? fmtFecha(new Date(p.fechaInicio)) : "—"}</Td>
                <Td
                  derecha
                  className={
                    p.dias != null && p.dias < 0
                      ? "font-semibold text-status-critical"
                      : p.dias != null && p.dias <= 30
                        ? "font-semibold text-[#8a6100]"
                        : "text-ink-muted"
                  }
                >
                  {p.dias == null ? "—" : p.dias < 0 ? `${-p.dias} d. tarde` : `${p.dias} d.`}
                </Td>
                <Td>{p.administrador ?? "—"}</Td>
                <Td>{p.compania ?? "—"}</Td>
                <Td>
                  <span
                    className={clsx(
                      "rounded px-1.5 py-0.5 text-[11px] font-semibold",
                      COLOR[p.situacion] ?? "bg-surface-sunken text-ink-secondary"
                    )}
                  >
                    {ETIQUETA_SITUACION[p.situacion as "PENDIENTE"] ?? p.situacion}
                  </span>
                </Td>
                <Td>
                  <div className="max-w-[280px] truncate text-ink-secondary" title={p.estado ?? ""}>
                    {p.estado ?? "—"}
                  </div>
                </Td>
                <Td className="text-ink-muted">
                  {p.ultimoSeguimiento ? fmtFecha(new Date(p.ultimoSeguimiento)) : "—"}
                </Td>
                <Td>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setGestionando(p)}
                      className="rounded-lg bg-brand px-2 py-1 text-xs font-semibold text-white hover:bg-brand-dark"
                    >
                      Gestionar
                    </button>
                    <button
                      onClick={() => setEditando(p)}
                      className="rounded-lg border border-line-axis px-2 py-1 text-xs text-ink-secondary hover:bg-surface-page"
                    >
                      Editar
                    </button>
                  </div>
                </Td>
              </tr>
            ))}
            {filtrados.length === 0 && (
              <tr>
                <Td className="py-6 text-center text-ink-muted" colSpan={9}>
                  No hay prospectos que cumplan los filtros.
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
        total={filtrados.length}
        etiqueta="prospectos"
      />

      {gestionando && (
        <PanelGestion
          prospecto={gestionando}
          onCerrar={() => setGestionando(null)}
          onGuardar={guardar}
        />
      )}

      {(creando || editando) && (
        <FormProspecto
          prospecto={editando}
          onCerrar={() => {
            setCreando(false);
            setEditando(null);
          }}
          onGuardar={guardar}
        />
      )}
    </div>
  );
}

function FormProspecto({
  prospecto,
  onCerrar,
  onGuardar,
}: {
  prospecto: ProspectoVista | null;
  onCerrar: () => void;
  onGuardar: (url: string, metodo: string, cuerpo: unknown) => Promise<boolean>;
}) {
  const [f, setF] = useState({
    nombre: prospecto?.nombre ?? "",
    fechaInicio: prospecto?.fechaInicio ? prospecto.fechaInicio.slice(0, 10) : "",
    administrador: prospecto?.administrador ?? "",
    compania: prospecto?.compania ?? "",
    estado: prospecto?.estado ?? "",
    situacion: prospecto?.situacion ?? "PENDIENTE",
    asesor: prospecto?.asesor ?? "",
    nota: prospecto?.nota ?? "",
    polizaNumero: prospecto?.polizaNumero ?? "",
  });
  const [guardando, setGuardando] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const clase =
    "w-full rounded-lg border border-line-axis bg-surface px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none";

  const enviar = async () => {
    setGuardando(true);
    const ok = await onGuardar(
      prospecto ? `/api/prospectos/${prospecto.id}` : "/api/prospectos",
      prospecto ? "PATCH" : "POST",
      f
    );
    setGuardando(false);
    if (!ok) return;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4">
      <div className="mt-10 w-full max-w-lg rounded-xl border border-line-grid bg-surface p-5 shadow-lg">
        <h2 className="mb-3 text-lg font-semibold">
          {prospecto ? "Editar prospecto" : "Nuevo prospecto"}
        </h2>
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="text-ink-secondary">Cliente o copropiedad *</span>
            <input className={clase} value={f.nombre} onChange={(e) => set("nombre", e.target.value)} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="text-ink-secondary">Inicio de vigencia</span>
              <input type="date" className={clase} value={f.fechaInicio} onChange={(e) => set("fechaInicio", e.target.value)} />
            </label>
            <label className="block text-sm">
              <span className="text-ink-secondary">Compañía</span>
              <input className={clase} value={f.compania} onChange={(e) => set("compania", e.target.value)} />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="text-ink-secondary">Administrador</span>
              <input className={clase} value={f.administrador} onChange={(e) => set("administrador", e.target.value)} />
            </label>
            <label className="block text-sm">
              <span className="text-ink-secondary">Asesor</span>
              <input className={clase} value={f.asesor} onChange={(e) => set("asesor", e.target.value)} />
            </label>
          </div>
          <label className="block text-sm">
            <span className="text-ink-secondary">Estado (lo que pasó, con sus palabras)</span>
            <input className={clase} value={f.estado} onChange={(e) => set("estado", e.target.value)} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="text-ink-secondary">Situación</span>
              <select className={clase} value={f.situacion} onChange={(e) => set("situacion", e.target.value)}>
                {SITUACIONES.map((s) => (
                  <option key={s} value={s}>
                    {ETIQUETA_SITUACION[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-ink-secondary">Póliza (si se ganó)</span>
              <input className={clase} value={f.polizaNumero} onChange={(e) => set("polizaNumero", e.target.value)} />
            </label>
          </div>
          <label className="block text-sm">
            <span className="text-ink-secondary">Nota</span>
            <textarea rows={2} className={clase} value={f.nota} onChange={(e) => set("nota", e.target.value)} />
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onCerrar} className="rounded-lg border border-line-axis px-3 py-2 text-sm text-ink-secondary hover:bg-surface-page">
            Cancelar
          </button>
          <button
            onClick={enviar}
            disabled={guardando || !f.nombre.trim()}
            className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Panel de gestión: la historia del prospecto y el sitio donde se le añade.
 *
 * Mismo criterio que los siniestros: lo que se escribe no reemplaza nada, se
 * antepone con su fecha. La gracia de una bitácora es poder reconstruir tres
 * meses después por qué se perdió un negocio, y eso solo funciona si nadie
 * puede borrar lo anterior sin querer.
 */
function PanelGestion({
  prospecto,
  onCerrar,
  onGuardar,
}: {
  prospecto: ProspectoVista;
  onCerrar: () => void;
  onGuardar: (url: string, metodo: string, cuerpo: unknown) => Promise<boolean>;
}) {
  const [nota, setNota] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [situacion, setSituacion] = useState(prospecto.situacion);
  const [estado, setEstado] = useState(prospecto.estado ?? "");
  const [guardando, setGuardando] = useState(false);
  const clase =
    "w-full rounded-lg border border-line-axis bg-surface px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none";

  const entradas = (prospecto.historia ?? "").split("\n\n").filter((x) => x.trim());

  const enviar = async () => {
    setGuardando(true);
    const ok = await onGuardar(`/api/prospectos/${prospecto.id}`, "PATCH", {
      notaSeguimiento: nota,
      fechaSeguimiento: fecha,
      situacion,
      estado,
    });
    setGuardando(false);
    if (ok) onCerrar();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4">
      <div className="mt-10 w-full max-w-2xl rounded-xl border border-line-grid bg-surface p-5 shadow-lg">
        <h2 className="text-lg font-semibold">{prospecto.nombre}</h2>
        <p className="mb-4 text-sm text-ink-secondary">
          {prospecto.compania ?? "Sin compañía"}
          {prospecto.administrador ? ` · ${prospecto.administrador}` : ""}
          {prospecto.dias != null &&
            ` · vigencia ${
              prospecto.dias < 0 ? `arrancó hace ${-prospecto.dias} días` : `en ${prospecto.dias} días`
            }`}
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <label className="block text-sm">
              <span className="text-ink-secondary">¿Qué se hizo? *</span>
              <textarea
                rows={4}
                className={clase}
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                placeholder="Ej: se llamó a la administradora, quedó de confirmar el jueves."
              />
              <span className="mt-1 block text-[11px] text-ink-muted">
                Queda con la fecha al comienzo de la historia. No borra lo anterior.
              </span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="text-ink-secondary">Fecha</span>
                <input type="date" className={clase} value={fecha} onChange={(e) => setFecha(e.target.value)} />
              </label>
              <label className="block text-sm">
                <span className="text-ink-secondary">Situación</span>
                <select className={clase} value={situacion} onChange={(e) => setSituacion(e.target.value)}>
                  {SITUACIONES.map((s) => (
                    <option key={s} value={s}>
                      {ETIQUETA_SITUACION[s]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block text-sm">
              <span className="text-ink-secondary">Estado (resumen de una línea)</span>
              <input className={clase} value={estado} onChange={(e) => setEstado(e.target.value)} />
            </label>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold">Historia</h3>
            {entradas.length === 0 ? (
              <p className="text-sm text-ink-muted">
                Todavía no hay gestiones registradas. La primera que escriba aparecerá aquí.
              </p>
            ) : (
              <ol className="max-h-72 space-y-2 overflow-y-auto scroll-fino border-l border-line-grid pl-3 text-sm">
                {entradas.map((e, i) => {
                  const corte = e.indexOf(" · ");
                  const sello = corte > 0 ? e.slice(0, corte) : null;
                  const texto = corte > 0 ? e.slice(corte + 3) : e;
                  return (
                    <li key={i}>
                      {sello && (
                        <span className="mr-1.5 text-[11px] font-semibold text-ink-muted">{sello}</span>
                      )}
                      <span className="whitespace-pre-wrap">{texto}</span>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCerrar}
            className="rounded-lg border border-line-axis px-3 py-2 text-sm text-ink-secondary hover:bg-surface-page"
          >
            Cerrar
          </button>
          <button
            onClick={enviar}
            disabled={guardando || !nota.trim()}
            className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {guardando ? "Guardando…" : "Registrar gestión"}
          </button>
        </div>
      </div>
    </div>
  );
}
